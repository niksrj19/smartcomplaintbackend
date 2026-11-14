import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import type { DomainEvent } from '../../../ports/event-publisher.js';

interface OutboxRow {
  id: string;
  aggregate_id: string;
  event_type: string;
  payload: unknown;
  created_at: Date;
}

export interface OutboxBatchResult {
  claimed: number;
  published: number;
  failed: number;
}

const MAX_ATTEMPTS_BEFORE_SKIP = 10;

/**
 * Background work can wait longer for a DB connection than a user request (Prisma's default is 2s).
 * Avoids "Unable to start a transaction in the given time" when everything starts at once.
 */
export const BACKGROUND_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class OutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Claims a batch with FOR UPDATE SKIP LOCKED, so several app instances can run the relay
   * without publishing the same event twice. `publish` runs while the rows are locked;
   * rows are marked published only if it succeeds.
   */
  async processBatch(
    batchSize: number,
    publish: (topic: string, events: DomainEvent[]) => Promise<void>,
  ): Promise<OutboxBatchResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<OutboxRow[]>`
          SELECT id, aggregate_id, event_type, payload, created_at
          FROM outbox_events
          WHERE published_at IS NULL AND attempts < ${MAX_ATTEMPTS_BEFORE_SKIP}
          ORDER BY created_at ASC
          LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED`;
        if (rows.length === 0) return { claimed: 0, published: 0, failed: 0 };

        // One Kafka send per topic; order within each topic is preserved
        const byTopic = new Map<string, OutboxRow[]>();
        for (const r of rows) byTopic.set(r.event_type, [...(byTopic.get(r.event_type) ?? []), r]);

        let published = 0;
        let failed = 0;
        for (const [topic, topicRows] of byTopic) {
          const ids = topicRows.map((r) => r.id);
          try {
            await publish(topic, topicRows.map(toDomainEvent));
            await tx.outboxEvent.updateMany({ where: { id: { in: ids } }, data: { publishedAt: new Date() } });
            published += ids.length;
          } catch (err) {
            await tx.outboxEvent.updateMany({
              where: { id: { in: ids } },
              data: { attempts: { increment: 1 }, lastError: String((err as Error).message).slice(0, 500) },
            });
            failed += ids.length;
          }
        }
        return { claimed: rows.length, published, failed };
      },
      BACKGROUND_TX_OPTIONS,
    );
  }

  /** Keeps the table small — published events are already in Kafka */
  async deletePublishedOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.outboxEvent.deleteMany({
      where: { publishedAt: { not: null, lt: cutoff } },
    });
    return count;
  }
}

function toDomainEvent(r: OutboxRow): DomainEvent {
  return {
    id: r.id,
    type: r.event_type,
    key: r.aggregate_id,
    payload: r.payload,
    occurredAt: new Date(r.created_at).toISOString(),
  };
}