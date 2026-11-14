import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../ports/event-publisher.js';
import {
  COMPLAINT_TOPICS,
  type ComplaintAssignedPayload,
  type ComplaintCreatedPayload,
  type ComplaintSlaBreachedPayload,
  type ComplaintStatusChangedPayload,
} from '../../../shared/events/complaint.events.js';
import { NotificationService } from '../../notifications/notification.service.js';
import { ConsumerToolkit, IdempotentConsumer } from './idempotent-consumer.js';

/** Emails the citizen (and the department) at every step of a complaint's life. */
@Injectable()
export class NotificationConsumer extends IdempotentConsumer {
  protected readonly groupId = 'notification-service';
  protected readonly topics = [
    COMPLAINT_TOPICS.created,
    COMPLAINT_TOPICS.assigned,
    COMPLAINT_TOPICS.statusChanged,
    COMPLAINT_TOPICS.slaBreached,
  ];

  constructor(
    toolkit: ConsumerToolkit,
    private readonly notifications: NotificationService,
  ) {
    super(toolkit);
  }

  protected async handle(event: DomainEvent): Promise<void> {
    switch (event.type) {
      case COMPLAINT_TOPICS.created:
        return this.notifications.onComplaintCreated(event.payload as ComplaintCreatedPayload);
      case COMPLAINT_TOPICS.assigned:
        return this.notifications.onComplaintAssigned(event.payload as ComplaintAssignedPayload);
      case COMPLAINT_TOPICS.statusChanged:
        return this.notifications.onStatusChanged(event.payload as ComplaintStatusChangedPayload);
      case COMPLAINT_TOPICS.slaBreached:
        return this.notifications.onSlaBreached(event.payload as ComplaintSlaBreachedPayload);
      default:
        this.logger.warn(`Ignoring unknown event type ${event.type}`);
    }
  }
}
