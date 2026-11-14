import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { EVENT_CONSUMER, type EventConsumer, type EventMeta } from '../../../ports/event-consumer.js';
import { type DomainEvent, EVENT_PUBLISHER, type EventPublisher } from '../../../ports/event-publisher.js';
import { COMPLAINT_TOPICS } from '../../../shared/events/complaint.events.js';
import { ProcessedEventRepository } from './processed-event.repository.js';

const MAX_ATTEMPTS = 3;

/** Shared dependencies, bundled so each consumer's constructor stays short */
@Injectable()
export class ConsumerToolkit {
  constructor(
    @Inject(EVENT_CONSUMER) readonly eventConsumer: EventConsumer,
    @Inject(EVENT_PUBLISHER) readonly publisher: EventPublisher,
    readonly processed: ProcessedEventRepository,
  ) {}
}

/**
 * Base class for every Kafka consumer:
 *  - own consumer group → each service receives every event
 *  - idempotent: an event already handled by this consumer is skipped
 *  - retries with backoff, then sends the event to the dead-letter topic
 *    so one bad message never blocks the partition
 */
export abstract class IdempotentConsumer implements OnApplicationBootstrap {
  protected abstract readonly groupId: string;
  protected abstract readonly topics: string[];
  protected readonly logger = new Logger(this.constructor.name);

  protected constructor(private readonly toolkit: ConsumerToolkit) {}

  /** Do the work. Throw to trigger a retry. */
  protected abstract handle(event: DomainEvent, meta: EventMeta): Promise<void>;

  onApplicationBootstrap(): void {
    void this.subscribe(1);
  }

  private async subscribe(attempt: number): Promise<void> {
    try {
      await this.toolkit.eventConsumer.subscribe({
        topics: this.topics,
        groupId: this.groupId,
        handler: (event, meta) => this.process(event, meta),
      });
    } catch (err) {
      const delay = Math.min(1000 * 2 ** attempt, 30_000);
      this.logger.warn(`Subscribe failed (attempt ${attempt}), retrying in ${delay / 1000}s: ${(err as Error).message}`);
      setTimeout(() => void this.subscribe(attempt + 1), delay);
    }
  }

  private async process(event: DomainEvent, meta: EventMeta): Promise<void> {
    if (await this.toolkit.processed.isProcessed(event.id, this.groupId)) {
      this.logger.debug(`Skipping already-processed event ${event.id}`);
      return;
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await this.handle(event, meta);
        await this.toolkit.processed.markProcessed(event.id, this.groupId);
        return;
      } catch (err) {
        lastError = err;
        this.logger.warn(`${event.type} ${event.id} failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${(err as Error).message}`);
        if (attempt < MAX_ATTEMPTS) await sleep(500 * 2 ** attempt);
      }
    }

    // Give up: park it in the DLQ for inspection, and move on
    await this.toolkit.publisher.publish(COMPLAINT_TOPICS.deadLetter, {
      id: randomUUID(),
      type: 'dead-letter',
      key: event.key,
      payload: { consumer: this.groupId, topic: meta.topic, error: String((lastError as Error)?.message), event },
      occurredAt: new Date().toISOString(),
    });
    await this.toolkit.processed.markProcessed(event.id, this.groupId);
    this.logger.error(`${event.type} ${event.id} sent to DLQ after ${MAX_ATTEMPTS} attempts`);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
