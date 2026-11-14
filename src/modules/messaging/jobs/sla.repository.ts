import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { COMPLAINT_TOPICS, type ComplaintSlaBreachedPayload } from '../../../shared/events/complaint.events.js';
import { BACKGROUND_TX_OPTIONS } from '../outbox/outbox.repository.js';

@Injectable()
export class SlaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds open complaints past their SLA deadline that haven't been escalated yet,
   * marks them escalated, writes a history note and a "complaint.sla-breached" outbox event —
   * all in one transaction. SKIP LOCKED makes it safe to run on several app instances.
   * Each complaint is escalated exactly once (escalated_at is set).
   */
  async escalateBreached(limit: number): Promise<string[]> {
    return this.prisma.$transaction(
      async (tx) => {
        const due = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM complaints
          WHERE escalated_at IS NULL
            AND sla_due_at < now()
            AND status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS')
          ORDER BY sla_due_at ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED`;
        if (due.length === 0) return [];

        const escalatedAt = new Date();
        const tickets: string[] = [];
        for (const { id } of due) {
          const c = await tx.complaint.update({
            where: { id },
            data: { escalatedAt },
            include: { department: true, assignedOfficer: true },
          });
          await tx.complaintStatusHistory.create({
            data: {
              complaintId: id,
              oldStatus: c.status,
              newStatus: c.status,
              changedById: null,
              remark: 'SLA deadline missed — escalated to the department',
            },
          });
          const payload: ComplaintSlaBreachedPayload = {
            complaintId: id,
            ticketNumber: c.ticketNumber,
            title: c.title,
            priority: c.priority,
            status: c.status,
            department: {
              id: c.department.id,
              code: c.department.code,
              name: c.department.name,
              contactEmail: c.department.contactEmail,
            },
            officer: c.assignedOfficer
              ? { id: c.assignedOfficer.id, name: c.assignedOfficer.name, email: c.assignedOfficer.email }
              : null,
            slaDueAt: c.slaDueAt!.toISOString(),
            escalatedAt: escalatedAt.toISOString(),
          };
          await tx.outboxEvent.create({
            data: { aggregateType: 'complaint', aggregateId: id, eventType: COMPLAINT_TOPICS.slaBreached, payload: payload as object },
          });
          tickets.push(c.ticketNumber);
        }
        return tickets;
      },
      BACKGROUND_TX_OPTIONS,
    );
  }
}