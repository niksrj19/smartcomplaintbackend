import { Inject, Injectable } from '@nestjs/common';
import { MAILER, type Mailer } from '../../ports/mailer.js';
import type {
  ComplaintAssignedPayload,
  ComplaintCreatedPayload,
  ComplaintSlaBreachedPayload,
  ComplaintStatusChangedPayload,
} from '../../shared/events/complaint.events.js';
import {
  complaintAssignedEmail,
  complaintReceivedEmail,
  newComplaintForDepartmentEmail,
  slaBreachedEmail,
  statusChangedEmail,
} from './templates/complaint-emails.js';

/** Builds the right email for each event and sends it through the mailer port. */
@Injectable()
export class NotificationService {
  constructor(@Inject(MAILER) private readonly mailer: Mailer) {}

  async onComplaintCreated(p: ComplaintCreatedPayload): Promise<void> {
    await this.mailer.send(complaintReceivedEmail(p));
    await this.mailer.send(newComplaintForDepartmentEmail(p));
  }

  onComplaintAssigned(p: ComplaintAssignedPayload): Promise<void> {
    return this.mailer.send(complaintAssignedEmail(p));
  }

  onStatusChanged(p: ComplaintStatusChangedPayload): Promise<void> {
    return this.mailer.send(statusChangedEmail(p));
  }

  /** Staff-only alert — the citizen isn't emailed about internal escalations */
  async onSlaBreached(p: ComplaintSlaBreachedPayload): Promise<void> {
    await this.mailer.send(slaBreachedEmail(p, p.department.contactEmail));
    if (p.officer && p.officer.email !== p.department.contactEmail) {
      await this.mailer.send(slaBreachedEmail(p, p.officer.email));
    }
  }
}
