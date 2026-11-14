import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../ports/event-publisher.js';
import { COMPLAINT_TOPICS, type ComplaintCreatedPayload } from '../../../shared/events/complaint.events.js';
import { ConsumerToolkit, IdempotentConsumer } from './idempotent-consumer.js';
import { RoutingRepository } from './routing.repository.js';

/**
 * Auto-assigns each new complaint to the least-busy officer in its department,
 * then publishes complaint.assigned (via the outbox) — which triggers the citizen's email.
 * If the department has no officers yet, the complaint stays SUBMITTED for a department admin.
 */
@Injectable()
export class RoutingConsumer extends IdempotentConsumer {
  protected readonly groupId = 'routing-service';
  protected readonly topics = [COMPLAINT_TOPICS.created];

  constructor(
    toolkit: ConsumerToolkit,
    private readonly routing: RoutingRepository,
  ) {
    super(toolkit);
  }

  protected async handle(event: DomainEvent): Promise<void> {
    const p = event.payload as ComplaintCreatedPayload;
    const officer = await this.routing.findLeastLoadedOfficer(p.department.id);
    if (!officer) {
      this.logger.log(`${p.ticketNumber}: no officers in ${p.department.code}, left for manual assignment`);
      return;
    }
    const assigned = await this.routing.assign(p.complaintId, officer);
    this.logger.log(
      assigned ? `${p.ticketNumber} assigned to ${officer.name}` : `${p.ticketNumber} was already assigned, skipped`,
    );
  }
}
