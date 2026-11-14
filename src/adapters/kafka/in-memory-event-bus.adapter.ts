import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { EventBusAdmin } from '../../ports/event-bus-admin.js';
import type { EventConsumer, SubscribeOptions } from '../../ports/event-consumer.js';
import type { DomainEvent, EventPublisher } from '../../ports/event-publisher.js';

/** For tests and for running without Kafka (EVENT_BUS_PROVIDER=memory). Single-process only. */
export class InMemoryEventBusAdapter implements EventPublisher, EventConsumer, EventBusAdmin {
  readonly name = 'memory';
  private readonly logger = new Logger(InMemoryEventBusAdapter.name);
  private readonly emitter = new EventEmitter();

  async publish(topic: string, event: DomainEvent): Promise<void> {
    this.emitter.emit(topic, event);
  }

  async publishBatch(topic: string, events: DomainEvent[]): Promise<void> {
    for (const e of events) this.emitter.emit(topic, e);
  }

  /** Nothing to create in memory */
  async ensureTopics(): Promise<void> {}

  async subscribe({ topics, groupId, handler }: SubscribeOptions): Promise<void> {
    for (const topic of topics) {
      this.emitter.on(topic, (event: DomainEvent) => {
        handler(event, { topic }).catch((err: unknown) =>
          this.logger.error(`[${groupId}] handler failed for ${event.type}: ${String(err)}`),
        );
      });
    }
  }
}
