import { Injectable } from '@nestjs/common';
import { addDays, istDayStart } from '../../../common/dates/date-range.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { type ComplaintStatus, Prisma, type StaffUser } from '../../../generated/prisma/client.js';
import {
  COMPLAINT_TOPICS,
  type ComplaintAssignedPayload,
  type ComplaintStatusChangedPayload,
} from '../../../shared/events/complaint.events.js';
import type { StaffPrincipal } from '../../auth-core/auth-core.types.js';
import { OPEN_STATUSES } from './complaint-workflow.js';
import type { ListStaffComplaintsQuery } from './dto/staff-complaints.schemas.js';

/** Includes needed to build event payloads */
const EVENT_INCLUDE = { citizen: true, department: true } as const;
type ComplaintWithRefs = Prisma.ComplaintGetPayload<{ include: typeof EVENT_INCLUDE }>;

@Injectable()
export class StaffComplaintsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Row-level access control, applied to EVERY staff query:
   * super admin → all, department admin → their department, officer → assigned to them.
   */
  scope(actor: StaffPrincipal): Prisma.ComplaintWhereInput {
    switch (actor.role) {
      case 'SUPER_ADMIN':
        return {};
      case 'DEPARTMENT_ADMIN':
        return { departmentId: actor.departmentId ?? '00000000-0000-0000-0000-000000000000' };
      case 'OFFICER':
        return { assignedOfficerId: actor.id };
    }
  }

  async list(actor: StaffPrincipal, q: ListStaffComplaintsQuery) {
    const now = new Date();
    const filters: Prisma.ComplaintWhereInput[] = [this.scope(actor)];
    if (q.status) filters.push({ status: { in: q.status } });
    if (q.priority) filters.push({ priority: { in: q.priority } });
    if (q.departmentId && actor.role === 'SUPER_ADMIN') filters.push({ departmentId: q.departmentId });
    if (q.assignedOfficerId && actor.role !== 'OFFICER') filters.push({ assignedOfficerId: q.assignedOfficerId });
    if (q.unassigned !== undefined) filters.push({ assignedOfficerId: q.unassigned ? null : { not: null } });
    if (q.overdue) filters.push({ slaDueAt: { lt: now }, status: { in: OPEN_STATUSES } });
    if (q.escalated !== undefined) filters.push({ escalatedAt: q.escalated ? { not: null } : null });
    if (q.search) {
      filters.push({
        OR: [
          { ticketNumber: { contains: q.search.toUpperCase() } },
          { title: { contains: q.search, mode: 'insensitive' } },
        ],
      });
    }
    if (q.category) {
      filters.push({ OR: q.category.map((c) => ({ category: { equals: c, mode: 'insensitive' as const } })) });
    }
    if (q.createdFrom || q.createdTo) {
      filters.push({
        createdAt: {
          ...(q.createdFrom ? { gte: istDayStart(q.createdFrom) } : {}),
          ...(q.createdTo ? { lt: istDayStart(addDays(q.createdTo, 1)) } : {}),
        },
      });
    }
    const where: Prisma.ComplaintWhereInput = { AND: filters };

    const orderBy: Prisma.ComplaintOrderByWithRelationInput[] = {
      newest: [{ createdAt: 'desc' as const }],
      oldest: [{ createdAt: 'asc' as const }],
      priority: [{ priority: 'desc' as const }, { createdAt: 'asc' as const }],
      sla: [{ slaDueAt: { sort: 'asc' as const, nulls: 'last' as const } }],
    }[q.sort];

    const [rows, total] = await Promise.all([
      this.prisma.complaint.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          department: { select: { id: true, code: true, name: true } },
          assignedOfficer: { select: { id: true, name: true } },
          duplicateOf: { select: { ticketNumber: true } },
          _count: { select: { attachments: true } },
        },
      }),
      this.prisma.complaint.count({ where }),
    ]);

    return {
      total,
      items: rows.map((c) => ({
        id: c.id,
        ticketNumber: c.ticketNumber,
        title: c.title,
        category: c.category,
        priority: c.priority,
        status: c.status,
        department: c.department,
        assignedOfficer: c.assignedOfficer,
        address: c.address,
        slaDueAt: c.slaDueAt,
        isOverdue: !!c.slaDueAt && c.slaDueAt < now && OPEN_STATUSES.includes(c.status),
        escalatedAt: c.escalatedAt,
        duplicateOfTicket: c.duplicateOf?.ticketNumber ?? null,
        photoCount: c._count.attachments,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    };
  }

  findDetail(actor: StaffPrincipal, id: string) {
    return this.prisma.complaint.findFirst({
      where: { AND: [{ id }, this.scope(actor)] },
      include: {
        citizen: { select: { name: true, email: true, phone: true } },
        department: { select: { id: true, code: true, name: true } },
        assignedOfficer: { select: { id: true, name: true, email: true } },
        attachments: { select: { objectKey: true, contentType: true }, orderBy: { createdAt: 'asc' } },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          include: { changedBy: { select: { name: true, role: true } } },
        },
        duplicateOf: { select: { id: true, ticketNumber: true, title: true, status: true } },
        duplicates: { select: { id: true, ticketNumber: true, title: true, status: true } },
        session: {
          select: {
            messages: {
              where: { role: { in: ['USER', 'ASSISTANT'] }, type: 'TEXT' },
              orderBy: { createdAt: 'asc' },
              take: 50,
              select: { role: true, content: true, createdAt: true },
            },
          },
        },
      },
    });
  }

  /** Just what's needed to authorise a change */
  findForUpdate(actor: StaffPrincipal, id: string) {
    return this.prisma.complaint.findFirst({
      where: { AND: [{ id }, this.scope(actor)] },
      select: { id: true, status: true, departmentId: true, assignedOfficerId: true },
    });
  }

  findStaffUser(id: string): Promise<StaffUser | null> {
    return this.prisma.staffUser.findUnique({ where: { id } });
  }

  /**
   * Assign (or reassign) an officer. Optimistic concurrency: the update only applies if the
   * status is still what we checked, so two admins acting at once can't both "win".
   */
  async assign(input: {
    complaintId: string;
    fromStatus: ComplaintStatus;
    officer: StaffUser;
    actor: StaffPrincipal;
    remark?: string;
  }): Promise<boolean> {
    const { complaintId, fromStatus, officer, actor, remark } = input;
    // Reassigning a complaint already in progress keeps it in progress
    const toStatus: ComplaintStatus = fromStatus === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'ASSIGNED';

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.complaint.updateMany({
        where: { id: complaintId, status: fromStatus },
        data: { status: toStatus, assignedOfficerId: officer.id },
      });
      if (count === 0) return false;

      const c = await tx.complaint.findUniqueOrThrow({ where: { id: complaintId }, include: EVENT_INCLUDE });
      await tx.complaintStatusHistory.create({
        data: {
          complaintId,
          oldStatus: fromStatus,
          newStatus: toStatus,
          changedById: actor.id,
          remark: [`Assigned to ${officer.name}`, remark].filter(Boolean).join(' — '),
        },
      });

      const payload: ComplaintAssignedPayload = {
        complaintId,
        ticketNumber: c.ticketNumber,
        title: c.title,
        priority: c.priority,
        ...refs(c),
        officer: { id: officer.id, name: officer.name, email: officer.email },
        assignedById: actor.id,
        assignedAt: new Date().toISOString(),
      };
      await tx.outboxEvent.create({
        data: { aggregateType: 'complaint', aggregateId: complaintId, eventType: COMPLAINT_TOPICS.assigned, payload: payload as object },
      });
      return true;
    });
  }

  /** Status change + history + outbox event in one transaction (same optimistic check) */
  async changeStatus(input: {
    complaintId: string;
    from: ComplaintStatus;
    to: ComplaintStatus;
    actor: StaffPrincipal;
    remark?: string;
  }): Promise<boolean> {
    const { complaintId, from, to, actor, remark } = input;

    return this.prisma.$transaction(async (tx) => {
      const resolvedAt = to === 'RESOLVED' ? new Date() : to === 'IN_PROGRESS' && from === 'RESOLVED' ? null : undefined;
      const { count } = await tx.complaint.updateMany({
        where: { id: complaintId, status: from },
        data: { status: to, ...(resolvedAt !== undefined ? { resolvedAt } : {}) },
      });
      if (count === 0) return false;

      const c = await tx.complaint.findUniqueOrThrow({ where: { id: complaintId }, include: EVENT_INCLUDE });
      await tx.complaintStatusHistory.create({
        data: { complaintId, oldStatus: from, newStatus: to, changedById: actor.id, remark: remark || null },
      });

      const payload: ComplaintStatusChangedPayload = {
        complaintId,
        ticketNumber: c.ticketNumber,
        title: c.title,
        ...refs(c),
        oldStatus: from,
        newStatus: to,
        remark: remark || null,
        changedById: actor.id,
        changedAt: new Date().toISOString(),
      };
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'complaint',
          aggregateId: complaintId,
          eventType: COMPLAINT_TOPICS.statusChanged,
          payload: payload as object,
        },
      });
      return true;
    });
  }
}

function refs(c: ComplaintWithRefs) {
  return {
    citizen: { id: c.citizen.id, name: c.citizen.name, email: c.citizen.email, phone: c.citizen.phone },
    department: {
      id: c.department.id,
      code: c.department.code,
      name: c.department.name,
      contactEmail: c.department.contactEmail,
    },
  };
}
