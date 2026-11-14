import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { type ComplaintPriority, type ComplaintStatus, Prisma } from '../../generated/prisma/client.js';
import type { DateRange } from './dto/analytics.schemas.js';

/** null = every department (super admin); otherwise only these ids */
export type DeptScope = string[] | null;

/** Converts a UTC timestamp column to an IST calendar day */
const IST_DAY = (col: string) => Prisma.raw(`(${col} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date`);
const IST_WEEK = (col: string) =>
  Prisma.raw(`date_trunc('week', ${col} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date`);
const OPEN_SQL = Prisma.raw(`('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS')`);
const HOURS = Prisma.raw(`EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)) / 3600`);

export interface DeptMetricsRow {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  total: number;
  submitted: number;
  assigned: number;
  inProgress: number;
  resolved: number;
  closed: number;
  rejected: number;
  overdue: number;
  escalated: number;
  resolvedInRange: number;
  resolvedWithinSla: number;
  avgHours: string | number | null;
}

export interface BucketRow {
  departmentId: string;
  bucket: string;
  n: number;
}

export interface CategoryRow {
  category: string;
  total: number;
  open: number;
  resolved: number;
  overdue: number;
  avgHours: string | number | null;
}

export interface OfficerRow {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  open: number;
  overdue: number;
  resolvedInRange: number;
  resolvedWithinSla: number;
  avgHours: string | number | null;
}

/**
 * Read-only aggregate queries for analytics. Definitions used everywhere:
 *  - "in range" for counts = created_at within the range
 *  - resolution metrics = resolved_at within the range (whenever the complaint was created)
 *  - overdue / open workload = the state right now
 */
@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private created(r: DateRange): Prisma.Sql {
    return Prisma.sql`c.created_at >= ${r.from} AND c.created_at < ${r.to}`;
  }

  private resolved(r: DateRange): Prisma.Sql {
    return Prisma.sql`c.resolved_at >= ${r.from} AND c.resolved_at < ${r.to}`;
  }

  /** Department filter for a column (c.department_id or d.id); an empty scope matches nothing */
  private inScope(column: 'c.department_id' | 'd.id', scope: DeptScope): Prisma.Sql {
    if (scope === null) return Prisma.empty;
    if (scope.length === 0) return Prisma.sql`AND false`;
    return Prisma.sql`AND ${Prisma.raw(column)} IN (${Prisma.join(scope.map((id) => Prisma.sql`${id}::uuid`))})`;
  }

  departmentMetrics(range: DateRange, scope: DeptScope): Promise<DeptMetricsRow[]> {
    const created = this.created(range);
    const resolved = this.resolved(range);
    return this.prisma.$queryRaw<DeptMetricsRow[]>`
      SELECT d.id, d.code, d.name, d.is_active AS "isActive",
        COUNT(c.id) FILTER (WHERE ${created})::int AS total,
        COUNT(c.id) FILTER (WHERE ${created} AND c.status = 'SUBMITTED')::int AS submitted,
        COUNT(c.id) FILTER (WHERE ${created} AND c.status = 'ASSIGNED')::int AS assigned,
        COUNT(c.id) FILTER (WHERE ${created} AND c.status = 'IN_PROGRESS')::int AS "inProgress",
        COUNT(c.id) FILTER (WHERE ${created} AND c.status = 'RESOLVED')::int AS resolved,
        COUNT(c.id) FILTER (WHERE ${created} AND c.status = 'CLOSED')::int AS closed,
        COUNT(c.id) FILTER (WHERE ${created} AND c.status = 'REJECTED')::int AS rejected,
        COUNT(c.id) FILTER (WHERE ${created} AND c.status IN ${OPEN_SQL} AND c.sla_due_at < now())::int AS overdue,
        COUNT(c.id) FILTER (WHERE ${created} AND c.escalated_at IS NOT NULL)::int AS escalated,
        COUNT(c.id) FILTER (WHERE ${resolved})::int AS "resolvedInRange",
        COUNT(c.id) FILTER (WHERE ${resolved} AND c.resolved_at <= c.sla_due_at)::int AS "resolvedWithinSla",
        AVG(${HOURS}) FILTER (WHERE ${resolved}) AS "avgHours"
      FROM departments d
      LEFT JOIN complaints c ON c.department_id = d.id
      WHERE true ${this.inScope('d.id', scope)}
      GROUP BY d.id, d.code, d.name, d.is_active
      ORDER BY d.name ASC`;
  }

  departments(scope: DeptScope) {
    return this.prisma.department.findMany({
      where: scope === null ? {} : { id: { in: scope } },
      select: { id: true, code: true, name: true, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  findDepartment(id: string) {
    return this.prisma.department.findUnique({ where: { id }, select: { id: true, code: true, name: true, isActive: true } });
  }

  /** Counts per department per bucket (IST day or ISO week starting Monday) */
  createdBuckets(range: DateRange, granularity: 'day' | 'week', scope: DeptScope): Promise<BucketRow[]> {
    const bucket = granularity === 'day' ? IST_DAY('c.created_at') : IST_WEEK('c.created_at');
    return this.prisma.$queryRaw<BucketRow[]>`
      SELECT c.department_id AS "departmentId", to_char(${bucket}, 'YYYY-MM-DD') AS bucket, COUNT(*)::int AS n
      FROM complaints c
      WHERE ${this.created(range)} ${this.inScope('c.department_id', scope)}
      GROUP BY 1, 2`;
  }

  resolvedBuckets(range: DateRange, granularity: 'day' | 'week', scope: DeptScope): Promise<BucketRow[]> {
    const bucket = granularity === 'day' ? IST_DAY('c.resolved_at') : IST_WEEK('c.resolved_at');
    return this.prisma.$queryRaw<BucketRow[]>`
      SELECT c.department_id AS "departmentId", to_char(${bucket}, 'YYYY-MM-DD') AS bucket, COUNT(*)::int AS n
      FROM complaints c
      WHERE ${this.resolved(range)} ${this.inScope('c.department_id', scope)}
      GROUP BY 1, 2`;
  }

  statusAndPriority(range: DateRange, departmentId: string) {
    const where = { departmentId, createdAt: { gte: range.from, lt: range.to } };
    return Promise.all([
      this.prisma.complaint.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.complaint.groupBy({ by: ['priority'], where, _count: { _all: true } }),
    ]);
  }

  /** Categories are free text from the AI, so they're grouped case-insensitively */
  categories(range: DateRange, departmentId: string): Promise<CategoryRow[]> {
    return this.prisma.$queryRaw<CategoryRow[]>`
      SELECT MIN(c.category) AS category,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE c.status IN ${OPEN_SQL})::int AS open,
        COUNT(*) FILTER (WHERE c.status IN ('RESOLVED', 'CLOSED'))::int AS resolved,
        COUNT(*) FILTER (WHERE c.status IN ${OPEN_SQL} AND c.sla_due_at < now())::int AS overdue,
        AVG(${HOURS}) FILTER (WHERE c.resolved_at IS NOT NULL) AS "avgHours"
      FROM complaints c
      WHERE c.department_id = ${departmentId}::uuid AND ${this.created(range)}
      GROUP BY lower(trim(c.category))
      ORDER BY total DESC
      LIMIT 50`;
  }

  /** Officer performance: open/overdue = current workload; resolution metrics = within the range */
  officers(range: DateRange, departmentId: string): Promise<OfficerRow[]> {
    const resolved = this.resolved(range);
    return this.prisma.$queryRaw<OfficerRow[]>`
      SELECT s.id, s.name, s.email, s.is_active AS "isActive",
        COUNT(c.id) FILTER (WHERE c.status IN ('ASSIGNED', 'IN_PROGRESS'))::int AS open,
        COUNT(c.id) FILTER (WHERE c.status IN ('ASSIGNED', 'IN_PROGRESS') AND c.sla_due_at < now())::int AS overdue,
        COUNT(c.id) FILTER (WHERE ${resolved})::int AS "resolvedInRange",
        COUNT(c.id) FILTER (WHERE ${resolved} AND c.resolved_at <= c.sla_due_at)::int AS "resolvedWithinSla",
        AVG(${HOURS}) FILTER (WHERE ${resolved}) AS "avgHours"
      FROM staff_users s
      LEFT JOIN complaints c ON c.assigned_officer_id = s.id
      WHERE s.department_id = ${departmentId}::uuid AND s.role = 'OFFICER'
      GROUP BY s.id, s.name, s.email, s.is_active
      ORDER BY open DESC, s.name ASC`;
  }

  mapPoints(
    range: DateRange,
    scope: DeptScope,
    filters: { categories?: string[]; statuses?: ComplaintStatus[]; priorities?: ComplaintPriority[] },
    limit: number,
  ) {
    return this.prisma.complaint.findMany({
      where: {
        createdAt: { gte: range.from, lt: range.to },
        latitude: { not: null },
        longitude: { not: null },
        ...(scope === null ? {} : { departmentId: { in: scope } }),
        ...(filters.statuses ? { status: { in: filters.statuses } } : {}),
        ...(filters.priorities ? { priority: { in: filters.priorities } } : {}),
        ...(filters.categories
          ? { OR: filters.categories.map((c) => ({ category: { equals: c, mode: 'insensitive' as const } })) }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        category: true,
        priority: true,
        status: true,
        latitude: true,
        longitude: true,
        createdAt: true,
        department: { select: { id: true, code: true, name: true } },
      },
    });
  }
}
