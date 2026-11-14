import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../ports/event-publisher.js';
import { COMPLAINT_TOPICS, type ComplaintCreatedPayload } from '../../../shared/events/complaint.events.js';
import { DuplicateRepository } from './duplicate.repository.js';
import { ConsumerToolkit, IdempotentConsumer } from './idempotent-consumer.js';

/** Stricter than the chat-time hint (0.85): linking is a stored fact staff will rely on */
const LINK_THRESHOLD = 0.9;

/**
 * Links each new complaint to an existing open complaint describing the same issue.
 * Never changes status or closes anything — staff see "possible duplicate of SC-…" and decide.
 */
@Injectable()
export class DuplicateDetectionConsumer extends IdempotentConsumer {
  protected readonly groupId = 'duplicate-detection-service';
  protected readonly topics = [COMPLAINT_TOPICS.created];

  constructor(
    toolkit: ConsumerToolkit,
    private readonly duplicates: DuplicateRepository,
  ) {
    super(toolkit);
  }

  protected async handle(event: DomainEvent): Promise<void> {
    const p = event.payload as ComplaintCreatedPayload;
    const match = await this.duplicates.findClosestOriginal(p.complaintId);
    if (!match || match.similarity < LINK_THRESHOLD) return;

    if (await this.duplicates.link(p.complaintId, match)) {
      this.logger.log(`${p.ticketNumber} linked as possible duplicate of ${match.ticketNumber} (${match.similarity})`);
    }
  }
}
