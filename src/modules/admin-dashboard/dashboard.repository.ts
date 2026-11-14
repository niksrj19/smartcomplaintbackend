import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { StaffPrincipal } from '../auth-core/auth-core.types.js';

const OPEN = ['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS'] as const;
/** Day buckets use Indian time so "today" matches the city's calendar */
const TZ = 'Asia/Kolkata';
const NO_DEPT = '00000000-0000-0000-0000-000000000000';

/** Aggregate queries for dashboards. Every query uses the same role scope as the complaint lists. */
@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  where(actor: StaffPrincipal): Prisma.ComplaintWhereInput {
    if (actor.role === 'SUPER_ADMIN') return {};
    if (actor.role === 'DEPARTMENT_ADMIN') return { departmentId: actor.departmentId ?? NO_DEPT };
    return { assignedOfficerId: actor.id };
  }

  /** Same scope as SQL, for raw queries (alias c = complaints) */
  private scopeSql(actor: StaffPrincipal): Prisma.Sql {
    if (actor.role === 'SUPER_ADMIN') return Prisma.empty;
    if (actor.role === 'DEPARTMENT_ADMIN') return Prisma.sql`AND c.department_id = ${actor.departmentId ?? NO_DEPT}::uuid`;
    return Prisma.sql`AND c.assigned_officer_id = ${actor.id}::uuid`;
  }

  async counts(actor: StaffPrincipal) {
    const base = this.where(actor);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const [byStatus, byPriorityOpen, overdue, escalatedOpen, createdLast7Days, resolvedLast7Days] = await Promise.all([
      this.prisma.complaint.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      this.prisma.complaint.groupBy({
        by: ['priority'],
        where: { AND: [base, { status: { in: [...OPEN] } }] },
        _count: { _all: true },
      }),
      this.prisma.complaint.count({ where: { AND: [base, { status: { in: [...OPEN] }, slaDueAt: { lt: now } }] } }),
      this.prisma.complaint.count({ where: { AND: [base, { status: { in: [...OPEN] }, escalatedAt: { not: null } }] } }),
      this.prisma.complaint.count({ where: { AND: [base, { createdAt: { gte: weekAgo } }] } }),
      this.prisma.complaint.count({ where: { AND: [base, { resolvedAt: { gte: weekAgo } }] } }),
    ]);
    return { byStatus, byPriorityOpen, overdue, escalatedOpen, createdLast7Days, resolvedLast7Days };
  }

  /** Average hours from submission to resolution, over complaints resolved in the last 30 days */
  async avgResolutionHours(actor: StaffPrincipal): Promise<number | null> {
    const [row] = await this.prisma.$queryRaw<{ hours: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at))) / 3600 AS hours
      FROM complaints c
      WHERE c.resolved_at IS NOT NULL AND c.resolved_at > now() - interval '30 days' ${this.scopeSql(actor)}`;
    return row?.hours === null || row?.hours === undefined ? null : Math.round(Number(row.hours) * 10) / 10;
  }

  /** Created vs resolved per day for the last 14 days, zero-filled */
  trend(actor: StaffPrincipal): Promise<{ date: string; created: number; resolved: number }[]> {
    const scope = this.scopeSql(actor);
    return this.prisma.$queryRaw`
      SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
        (SELECT COUNT(*)::int FROM complaints c
          WHERE (c.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${TZ})::date = d.day ${scope}) AS created,
        (SELECT COUNT(*)::int FROM complaints c
          WHERE (c.resolved_at AT TIME ZONE 'UTC' AT TIME ZONE ${TZ})::date = d.day ${scope}) AS resolved
      FROM (
        SELECT generate_series(
          (now() AT TIME ZONE ${TZ})::date - 13,
          (now() AT TIME ZONE ${TZ})::date,
          interval '1 day'
        )::date AS day
      ) d
      ORDER BY d.day`;
  }

  /** Super admin only: open / overdue / resolved per department */
  async byDepartment() {
    const now = new Date();
    const [departments, byStatus, overdue] = await Promise.all([
      this.prisma.department.findMany({ select: { id: true, code: true, name: true, isActive: true }, orderBy: { name: 'asc' } }),
      this.prisma.complaint.groupBy({ by: ['departmentId', 'status'], _count: { _all: true } }),
      this.prisma.complaint.groupBy({
        by: ['departmentId'],
        where: { status: { in: [...OPEN] }, slaDueAt: { lt: now } },
        _count: { _all: true },
      }),
    ]);
    return departments.map((d) => {
      const rows = byStatus.filter((r) => r.departmentId === d.id);
      const sum = (statuses: readonly string[]) =>
        rows.filter((r) => statuses.includes(r.status)).reduce((n, r) => n + r._count._all, 0);
      return {
        ...d,
        total: rows.reduce((n, r) => n + r._count._all, 0),
        open: sum(OPEN),
        resolved: sum(['RESOLVED', 'CLOSED']),
        rejected: sum(['REJECTED']),
        overdue: overdue.find((o) => o.departmentId === d.id)?._count._all ?? 0,
      };
    });
  }

  /** Officers with their current load — helps an admin choose who to assign */
  officerWorkload(departmentId: string | null) {
    const deptFilter = departmentId ? Prisma.sql`AND s.department_id = ${departmentId}::uuid` : Prisma.empty;
    return this.prisma.$queryRaw<
      { id: string; name: string; email: string; departmentId: string; open: number; overdue: number; resolved30d: number }[]
    >`
      SELECT s.id, s.name, s.email, s.department_id AS "departmentId",
        COUNT(c.id) FILTER (WHERE c.status IN ('ASSIGNED', 'IN_PROGRESS'))::int AS open,
        COUNT(c.id) FILTER (WHERE c.status IN ('ASSIGNED', 'IN_PROGRESS') AND c.sla_due_at < now())::int AS overdue,
        COUNT(c.id) FILTER (WHERE c.status IN ('RESOLVED', 'CLOSED') AND c.resolved_at > now() - interval '30 days')::int AS "resolved30d"
      FROM staff_users s
      LEFT JOIN complaints c ON c.assigned_officer_id = s.id
      WHERE s.role = 'OFFICER' AND s.is_active = true ${deptFilter}
      GROUP BY s.id, s.name, s.email, s.department_id
      ORDER BY open DESC, s.name ASC`;
  }
}
