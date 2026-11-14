import { Inject, Injectable } from '@nestjs/common';
import { CACHE_SERVICE, type CacheService } from '../../ports/cache.service.js';
import type { StaffPrincipal } from '../auth-core/auth-core.types.js';
import { DashboardRepository } from './dashboard.repository.js';

const CACHE_SECONDS = 60;
const STATUSES = ['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED'] as const;
const PRIORITIES = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] as const;

export interface DashboardSummary {
  scope: 'ALL' | 'DEPARTMENT' | 'MINE';
  totals: {
    total: number;
    open: number;
    overdue: number;
    escalated: number;
    createdLast7Days: number;
    resolvedLast7Days: number;
  };
  byStatus: Record<(typeof STATUSES)[number], number>;
  openByPriority: Record<(typeof PRIORITIES)[number], number>;
  avgResolutionHours: number | null;
  trend: { date: string; created: number; resolved: number }[];
  byDepartment?: Awaited<ReturnType<DashboardRepository['byDepartment']>>;
  generatedAt: string;
}

/**
 * Read model for the dashboards. Aggregates come straight from Postgres
 * and are cached in Redis for 60s per scope, so a busy dashboard doesn't hammer the database.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly repo: DashboardRepository,
    @Inject(CACHE_SERVICE) private readonly cache: CacheService,
  ) {}

  async summary(actor: StaffPrincipal): Promise<DashboardSummary> {
    const scopeKey =
      actor.role === 'SUPER_ADMIN' ? 'all' : actor.role === 'DEPARTMENT_ADMIN' ? `dept:${actor.departmentId}` : `officer:${actor.id}`;
    const cacheKey = `dashboard:summary:${scopeKey}`;
    const cached = await this.cache.get<DashboardSummary>(cacheKey);
    if (cached) return cached;

    const [counts, avgResolutionHours, trend, byDepartment] = await Promise.all([
      this.repo.counts(actor),
      this.repo.avgResolutionHours(actor),
      this.repo.trend(actor),
      actor.role === 'SUPER_ADMIN' ? this.repo.byDepartment() : Promise.resolve(undefined),
    ]);

    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as DashboardSummary['byStatus'];
    for (const r of counts.byStatus) byStatus[r.status] = r._count._all;
    const openByPriority = Object.fromEntries(PRIORITIES.map((p) => [p, 0])) as DashboardSummary['openByPriority'];
    for (const r of counts.byPriorityOpen) openByPriority[r.priority] = r._count._all;

    const summary: DashboardSummary = {
      scope: actor.role === 'SUPER_ADMIN' ? 'ALL' : actor.role === 'DEPARTMENT_ADMIN' ? 'DEPARTMENT' : 'MINE',
      totals: {
        total: Object.values(byStatus).reduce((a, b) => a + b, 0),
        open: byStatus.SUBMITTED + byStatus.ASSIGNED + byStatus.IN_PROGRESS,
        overdue: counts.overdue,
        escalated: counts.escalatedOpen,
        createdLast7Days: counts.createdLast7Days,
        resolvedLast7Days: counts.resolvedLast7Days,
      },
      byStatus,
      openByPriority,
      avgResolutionHours,
      trend,
      ...(byDepartment ? { byDepartment } : {}),
      generatedAt: new Date().toISOString(),
    };
    await this.cache.set(cacheKey, summary, CACHE_SECONDS);
    return summary;
  }

  /** Department admins always see their own department; super admins can pick one (or see all) */
  workload(actor: StaffPrincipal, departmentId?: string) {
    const dept = actor.role === 'DEPARTMENT_ADMIN' ? actor.departmentId : (departmentId ?? null);
    return this.repo.officerWorkload(dept);
  }
}
