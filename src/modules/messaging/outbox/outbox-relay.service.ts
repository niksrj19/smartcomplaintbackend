import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { EVENT_PUBLISHER, type EventPublisher } from '../../../ports/event-publisher.js';
import { OutboxRepository } from './outbox.repository.js';

const BATCH_SIZE = 50;
const IDLE_DELAY_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const CLEANUP_EVERY_N_POLLS = 3600; // ~hourly when idle
/** Let the app finish its startup burst of DB work before the first poll */
const FIRST_POLL_DELAY_MS = 5000;

/**
 * Polls outbox_events and publishes them to Kafka.
 * The business transaction only ever writes to Postgres; this relay delivers to Kafka afterwards,
 * so a Kafka outage delays events but never loses them (at-least-once delivery).
 */
@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private running = false;
  private timer?: NodeJS.Timeout;
  private failures = 0;
  private polls = 0;

  constructor(
    private readonly outbox: OutboxRepository,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  onApplicationBootstrap(): void {
    this.running = true;
    this.schedule(FIRST_POLL_DELAY_MS);
    this.logger.log('Outbox relay started');
  }

  onModuleDestroy(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(delayMs: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  private async tick(): Promise<void> {
    try {
      const result = await this.outbox.processBatch(BATCH_SIZE, (topic, events) =>
        this.publisher.publishBatch(topic, events),
      );

      if (result.published) this.logger.log(`Published ${result.published} event(s)`);
      if (result.failed) {
        this.failures++;
        this.logger.warn(`${result.failed} event(s) failed to publish; will retry`);
      } else {
        this.failures = 0;
      }

      if (++this.polls % CLEANUP_EVERY_N_POLLS === 0) {
        const deleted = await this.outbox.deletePublishedOlderThan(7);
        if (deleted) this.logger.log(`Cleaned up ${deleted} old outbox row(s)`);
      }

      // A full batch means there's probably more waiting — go again straight away
      const busy = result.claimed === BATCH_SIZE && result.failed === 0;
      this.schedule(busy ? 0 : this.backoff());
    } catch (err) {
      this.failures++;
      this.logger.error(`Outbox relay error: ${(err as Error).message}`);
      this.schedule(this.backoff());
    }
  }

  /** 1s normally; doubles on repeated failures up to 30s */
  private backoff(): number {
    return Math.min(IDLE_DELAY_MS * 2 ** this.failures, MAX_BACKOFF_MS);
  }
}