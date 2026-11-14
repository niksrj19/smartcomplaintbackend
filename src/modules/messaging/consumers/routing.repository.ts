import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { COMPLAINT_TOPICS, type ComplaintAssignedPayload } from '../../../shared/events/complaint.events.js';

export interface OfficerCandidate {
  id: string;
  name: string;
  email: string;
}

@Injectable()
export class RoutingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Active officer in the department with the fewest open complaints (ties broken randomly) */
  async findLeastLoadedOfficer(departmentId: string): Promise<OfficerCandidate | null> {
    const rows = await this.prisma.$queryRaw<OfficerCandidate[]>`
      SELECT s.id, s.name, s.email
      FROM staff_users s
      LEFT JOIN complaints c
        ON c.assigned_officer_id = s.id AND c.status IN ('ASSIGNED', 'IN_PROGRESS')
      WHERE s.department_id = ${departmentId}::uuid AND s.role = 'OFFICER' AND s.is_active = true
      GROUP BY s.id, s.name, s.email
      ORDER BY COUNT(c.id) ASC, random()
      LIMIT 1`;
    return rows[0] ?? null;
  }

  /**
   * Assigns + writes history + writes the "complaint.assigned" outbox event, all in one transaction.
   * Only moves a SUBMITTED complaint, so replaying the event can't reassign it.
   * Returns false if the complaint was already assigned.
   */
  async assign(complaintId: string, officer: OfficerCandidate): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.complaint.updateMany({
        where: { id: complaintId, status: 'SUBMITTED' },
        data: { status: 'ASSIGNED', assignedOfficerId: officer.id },
      });
      if (count === 0) return false;

      const c = await tx.complaint.findUniqueOrThrow({
        where: { id: complaintId },
        include: { citizen: true, department: true },
      });
      await tx.complaintStatusHistory.create({
        data: {
          complaintId,
          oldStatus: 'SUBMITTED',
          newStatus: 'ASSIGNED',
          changedById: null,
          remark: `Auto-assigned to ${officer.name}`,
        },
      });

      const payload: ComplaintAssignedPayload = {
        complaintId,
        ticketNumber: c.ticketNumber,
        title: c.title,
        priority: c.priority,
        citizen: { id: c.citizen.id, name: c.citizen.name, email: c.citizen.email, phone: c.citizen.phone },
        department: {
          id: c.department.id,
          code: c.department.code,
          name: c.department.name,
          contactEmail: c.department.contactEmail,
        },
        officer: { id: officer.id, name: officer.name, email: officer.email },
        assignedById: null,
        assignedAt: new Date().toISOString(),
      };
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'complaint',
          aggregateId: complaintId,
          eventType: COMPLAINT_TOPICS.assigned,
          payload: payload as object,
        },
      });
      return true;
    });
  }
}
