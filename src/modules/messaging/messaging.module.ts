import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { DuplicateDetectionConsumer } from './consumers/duplicate-detection.consumer.js';
import { DuplicateRepository } from './consumers/duplicate.repository.js';
import { ConsumerToolkit } from './consumers/idempotent-consumer.js';
import { NotificationConsumer } from './consumers/notification.consumer.js';
import { ProcessedEventRepository } from './consumers/processed-event.repository.js';
import { RoutingConsumer } from './consumers/routing.consumer.js';
import { RoutingRepository } from './consumers/routing.repository.js';
import { SlaEscalationJob } from './jobs/sla-escalation.job.js';
import { SlaRepository } from './jobs/sla.repository.js';
import { KafkaTopicsInitializer } from './kafka-topics.initializer.js';
import { OutboxRelayService } from './outbox/outbox-relay.service.js';
import { OutboxRepository } from './outbox/outbox.repository.js';

/**
 * Everything event-driven: topic setup, the outbox relay (Postgres → Kafka),
 * the consumer services and scheduled jobs. Add a new consumer = one class extending IdempotentConsumer.
 */
@Module({
  imports: [NotificationsModule],
  providers: [
    KafkaTopicsInitializer,
    OutboxRepository,
    OutboxRelayService,
    ProcessedEventRepository,
    ConsumerToolkit,
    RoutingRepository,
    RoutingConsumer,
    NotificationConsumer,
    DuplicateRepository,
    DuplicateDetectionConsumer,
    SlaRepository,
    SlaEscalationJob,
  ],
})
export class MessagingModule {}
