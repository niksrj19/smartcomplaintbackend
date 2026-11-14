import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { addDays } from '../../common/dates/date-range.js';
import { CACHE_SERVICE, type CacheService } from '../../ports/cache.service.js';
import type { StaffPrincipal } from '../auth-core/auth-core.types.js';
import { AnalyticsRepository, type BucketRow, type DeptScope } from './analytics.repository.js';
import {
  type BreakdownQuery,
  type DateRange,
  type DepartmentMetrics,
  type DepartmentsQuery,
  type MapQuery,
  PRIORITIES,
  type PriorityCounts,
  type RangeView,
  STATUSES,
  type StatusCounts,
  type TrendQuery,
} from './dto/analytics.schemas.js';

const CACHE_SECONDS = 60;
const MAP_LIMIT = 2000;

const round1 = (v: string | number | null): number | null =>
  v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10;
const pct = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.round((part / whole) * 1000) / 10;

/**
 * Admin analytics with drill-down: city → department → category / priority / officer → complaint list.
 * Department admins only ever see their own department; super admins see all (or a chosen subset).
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly repo: AnalyticsRepository,
    @Inject(CACHE_SERVICE) private readonly cache: CacheService,
  ) {}

  /** Level 1: one row per department, plus city totals */
  departments(actor: StaffPrincipal, q: DepartmentsQuery) {
    const scope = this.scope(actor);
    return this.cached('departments', actor, q, async () => {
      const rows = await this.repo.departmentMetrics(q.range, scope);
      const departments: DepartmentMetrics[] = rows.map((r) => {
        const byStatus: StatusCounts = {
          SUBMITTED: r.submitted,
          ASSIGNED: r.assigned,
          IN_PROGRESS: r.inProgress,
          RESOLVED: r.resolved,
          CLOSED: r.closed,
          REJECTED: r.rejected,
        };
        return {
          id: r.id,
          code: r.code,
          name: r.name,
          isActive: r.isActive,
          total: r.total,
          byStatus,
          open: r.submitted + r.assigned + r.inProgress,
          overdue: r.overdue,
          escalated: r.escalated,
          resolvedInRange: r.resolvedInRange,
          resolvedWithinSla: r.resolvedWithinSla,
          slaCompliancePct: pct(r.resolvedWithinSla, r.resolvedInRange),
          avgResolutionHours: round1(r.avgHours),
        };
      });

      const sum = (pick: (d: DepartmentMetrics) => number) => departments.reduce((n, d) => n + pick(d), 0);
      const resolvedInRange = sum((d) => d.resolvedInRange);
      const resolvedWithinSla = sum((d) => d.resolvedWithinSla);
      // City average resolution time, weighted by how many each department resolved
      const weightedHours = departments.reduce((n, d) => n + (d.avgResolutionHours ?? 0) * d.resolvedInRange, 0);

      return {
        range: this.view(q.range),
        totals: {
          total: sum((d) => d.total),
          byStatus: Object.fromEntries(STATUSES.map((s) => [s, sum((d) => d.byStatus[s])])) as StatusCounts,
          open: sum((d) => d.open),
          overdue: sum((d) => d.overdue),
          escalated: sum((d) => d.escalated),
          resolvedInRange,
          resolvedWithinSla,
          slaCompliancePct: pct(resolvedWithinSla, resolvedInRange),
          avgResolutionHours: resolvedInRange ? Math.round((weightedHours / resolvedInRange) * 10) / 10 : null,
        },
        departments,
      };
    });
  }

  /** Created vs resolved over time, one series per department (charts can toggle them) + a total series */
  trend(actor: StaffPrincipal, q: TrendQuery) {
    let scope = this.scope(actor);
    if (scope === null && q.departmentIds) scope = q.departmentIds;

    return this.cached('trend', actor, q, async () => {
      const [departments, created, resolved] = await Promise.all([
        this.repo.departments(scope),
        this.repo.createdBuckets(q.range, q.granularity, scope),
        this.repo.resolvedBuckets(q.range, q.granularity, scope),
      ]);
      const buckets = this.buckets(q.range, q.granularity);
      const index = new Map(buckets.map((b, i) => [b, i]));
      const fill = (rows: BucketRow[], deptId: string) => {
        const out = new Array<number>(buckets.length).fill(0);
        for (const r of rows) {
          const i = index.get(r.bucket);
          if (r.departmentId === deptId && i !== undefined) out[i] += r.n;
        }
        return out;
      };

      const series = departments
        .map((d) => ({ departmentId: d.id, code: d.code, name: d.name, created: fill(created, d.id), resolved: fill(resolved, d.id) }))
        // Hide inactive departments with nothing to show
        .filter((s, i) => departments[i].isActive || s.created.some(Boolean) || s.resolved.some(Boolean));

      const total = {
        created: buckets.map((_, i) => series.reduce((n, s) => n + s.created[i], 0)),
        resolved: buckets.map((_, i) => series.reduce((n, s) => n + s.resolved[i], 0)),
      };
      return { range: this.view(q.range), granularity: q.granularity, buckets, series, total };
    });
  }

  /** Level 2: one department broken down by status, priority, category and officer */
  async departmentBreakdown(actor: StaffPrincipal, departmentId: string, q: BreakdownQuery) {
    const scope = this.scope(actor);
    if (scope !== null && !scope.includes(departmentId)) throw new NotFoundException('Department not found');
    const department = await this.repo.findDepartment(departmentId);
    if (!department) throw new NotFoundException('Department not found');

    return this.cached(`breakdown:${departmentId}`, actor, q, async () => {
      const [[statusRows, priorityRows], categories, officers] = await Promise.all([
        this.repo.statusAndPriority(q.range, departmentId),
        this.repo.categories(q.range, departmentId),
        this.repo.officers(q.range, departmentId),
      ]);
      const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as StatusCounts;
      for (const r of statusRows) byStatus[r.status] = r._count._all;
      const byPriority = Object.fromEntries(PRIORITIES.map((p) => [p, 0])) as PriorityCounts;
      for (const r of priorityRows) byPriority[r.priority] = r._count._all;

      return {
        range: this.view(q.range),
        department,
        total: Object.values(byStatus).reduce((a, b) => a + b, 0),
        byStatus,
        byPriority,
        byCategory: categories.map((c) => ({
          category: c.category,
          total: c.total,
          open: c.open,
          resolved: c.resolved,
          overdue: c.overdue,
          avgResolutionHours: round1(c.avgHours),
        })),
        officers: officers.map((o) => ({
          id: o.id,
          name: o.name,
          email: o.email,
          isActive: o.isActive,
          open: o.open,
          overdue: o.overdue,
          resolvedInRange: o.resolvedInRange,
          slaCompliancePct: pct(o.resolvedWithinSla, o.resolvedInRange),
          avgResolutionHours: round1(o.avgHours),
        })),
      };
    });
  }

  /** Points for the heatmap / map view (only complaints that have coordinates) */
  map(actor: StaffPrincipal, q: MapQuery) {
    let scope = this.scope(actor);
    if (q.departmentId) {
      if (scope !== null && !scope.includes(q.departmentId)) scope = [];
      else scope = [q.departmentId];
    }
    return this.cached('map', actor, q, async () => {
      const rows = await this.repo.mapPoints(
        q.range,
        scope,
        { categories: q.category, statuses: q.status, priorities: q.priority },
        MAP_LIMIT + 1,
      );
      return {
        range: this.view(q.range),
        truncated: rows.length > MAP_LIMIT,
        points: rows.slice(0, MAP_LIMIT),
      };
    });
  }

  // ─── helpers ───

  private scope(actor: StaffPrincipal): DeptScope {
    if (actor.role === 'SUPER_ADMIN') return null;
    return actor.departmentId ? [actor.departmentId] : [];
  }

  private view(r: DateRange): RangeView {
    return { from: r.fromDay, to: r.toDay, days: r.days, timezone: 'Asia/Kolkata' };
  }

  /** Every bucket label in the range: each IST day, or each Monday (ISO week start) */
  private buckets(r: DateRange, granularity: 'day' | 'week'): string[] {
    const out: string[] = [];
    if (granularity === 'day') {
      for (let d = r.fromDay; d <= r.toDay; d = addDays(d, 1)) out.push(d);
      return out;
    }
    const dow = (new Date(`${r.fromDay}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    for (let d = addDays(r.fromDay, -dow); d <= r.toDay; d = addDays(d, 7)) out.push(d);
    return out;
  }

  /** 60s cache per caller scope + query, so dashboards don't hammer Postgres */
  private async cached<T>(name: string, actor: StaffPrincipal, q: unknown, compute: () => Promise<T>): Promise<T> {
    const scopeKey = actor.role === 'SUPER_ADMIN' ? 'all' : `dept:${actor.departmentId}`;
    const key = `analytics:${name}:${scopeKey}:${JSON.stringify(q)}`;
    const hit = await this.cache.get<T>(key);
    if (hit) return hit;
    const value = await compute();
    await this.cache.set(key, value, CACHE_SECONDS);
    return value;
  }
}
