import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EVENT_BUS_ADMIN, type EventBusAdmin } from '../../ports/event-bus-admin.js';
import { COMPLAINT_TOPICS } from '../../shared/events/complaint.events.js';

const PARTITIONS = 3;

/**
 * Kafka auto-create is off (docker-compose), so topics are created explicitly at startup.
 * Retries in the background — the app still starts if Kafka is slow; the relay and
 * consumers retry until the topics exist.
 */
@Injectable()
export class KafkaTopicsInitializer implements OnModuleInit {
  private readonly logger = new Logger(KafkaTopicsInitializer.name);

  constructor(@Inject(EVENT_BUS_ADMIN) private readonly admin: EventBusAdmin) {}

  onModuleInit(): void {
    void this.ensure(1);
  }

  private async ensure(attempt: number): Promise<void> {
    try {
      await this.admin.ensureTopics(
        Object.values(COMPLAINT_TOPICS).map((name) => ({ name, partitions: PARTITIONS })),
      );
      this.logger.log('Kafka topics ready');
    } catch (err) {
      const delay = Math.min(1000 * 2 ** attempt, 30_000);
      this.logger.warn(`Topic setup failed (attempt ${attempt}), retrying in ${delay / 1000}s: ${(err as Error).message}`);
      setTimeout(() => void this.ensure(attempt + 1), delay);
    }
  }
}
