import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { type Consumer, Kafka, logLevel, type Producer } from 'kafkajs';
import { ProviderError } from '../../common/errors/provider.error.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { EventBusAdmin, TopicSpec } from '../../ports/event-bus-admin.js';
import type { EventConsumer, SubscribeOptions } from '../../ports/event-consumer.js';
import type { DomainEvent, EventPublisher } from '../../ports/event-publisher.js';

/** Kafka implementation of EventPublisher, EventConsumer and EventBusAdmin. */
export class KafkaEventBusAdapter implements EventPublisher, EventConsumer, EventBusAdmin, OnModuleDestroy {
  readonly name = 'kafka';
  private readonly logger = new Logger(KafkaEventBusAdapter.name);
  private readonly kafka: Kafka;
  private producer?: Producer;
  private producerReady?: Promise<Producer>;
  private readonly consumers: Consumer[] = [];

  constructor(config: AppConfigService) {
    this.kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      logLevel: logLevel.WARN,
    });
  }

  async publish(topic: string, event: DomainEvent): Promise<void> {
    await this.publishBatch(topic, [event]);
  }

  async publishBatch(topic: string, events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    try {
      const producer = await this.getProducer();
      await producer.send({
        topic,
        messages: events.map((e) => ({
          key: e.key,
          value: JSON.stringify(e),
          headers: { 'event-id': e.id, 'event-type': e.type },
        })),
      });
    } catch (err) {
      throw new ProviderError(this.name, `publish to ${topic}`, err);
    }
  }

  async subscribe({ topics, groupId, handler }: SubscribeOptions): Promise<void> {
    try {
      const consumer = this.kafka.consumer({ groupId });
      await consumer.connect();
      await consumer.subscribe({ topics, fromBeginning: false });
      this.consumers.push(consumer);

      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          if (!message.value) return;
          const event = JSON.parse(message.value.toString()) as DomainEvent;
          // If the handler throws, kafkajs retries the message; retries/DLQ live in the messaging module
          await handler(event, { topic, partition, offset: message.offset });
        },
      });
      this.logger.log(`Consumer group "${groupId}" subscribed to ${topics.join(', ')}`);
    } catch (err) {
      throw new ProviderError(this.name, `subscribe ${groupId}`, err);
    }
  }

  async ensureTopics(topics: TopicSpec[]): Promise<void> {
    const admin = this.kafka.admin();
    try {
      await admin.connect();
      const existing = new Set(await admin.listTopics());
      const missing = topics.filter((t) => !existing.has(t.name));
      if (missing.length) {
        await admin.createTopics({
          waitForLeaders: true,
          topics: missing.map((t) => ({ topic: t.name, numPartitions: t.partitions, replicationFactor: 1 })),
        });
        this.logger.log(`Created Kafka topics: ${missing.map((t) => t.name).join(', ')}`);
      }
    } catch (err) {
      throw new ProviderError(this.name, 'ensureTopics', err);
    } finally {
      await admin.disconnect().catch(() => undefined);
    }
  }

  /** Connects once, on first publish, so the app can start even if Kafka is briefly down */
  private getProducer(): Promise<Producer> {
    if (!this.producerReady) {
      const producer = this.kafka.producer({ idempotent: true, maxInFlightRequests: 1 });
      this.producerReady = producer
        .connect()
        .then(() => {
          this.producer = producer;
          this.logger.log('Kafka producer connected');
          return producer;
        })
        .catch((err: unknown) => {
          this.producerReady = undefined; // allow a retry next time
          throw err;
        });
    }
    return this.producerReady;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.producer?.disconnect(),
      ...this.consumers.map((c) => c.disconnect()),
    ]);
  }
}
