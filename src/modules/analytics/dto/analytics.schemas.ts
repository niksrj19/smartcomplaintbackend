import { z } from 'zod';
import { type DateRange, isoDaySchema, resolveRange } from '../../../common/dates/date-range.js';

const status = z.enum(['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED']);
const priority = z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);
const csv = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .string()
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(item).min(1).max(20));

/** Every analytics query: optional ?from=YYYY-MM-DD&to=YYYY-MM-DD (IST days), default last 30 days */
const rangeFields = { from: isoDaySchema.optional(), to: isoDaySchema.optional() };

function withRange<T extends { from?: string; to?: string }>(maxDays: number) {
  return (q: T, ctx: z.RefinementCtx) => {
    const range = resolveRange(q.from, q.to, 30, maxDays);
    if (typeof range === 'string') {
      ctx.addIssue({ code: 'custom', path: ['from'], message: range });
      return z.NEVER;
    }
    const { from: _from, to: _to, ...rest } = q;
    return { ...rest, range };
  };
}

export const departmentIdParamSchema = z.uuid({ message: 'Invalid department id' });

export const departmentsQuerySchema = z.object(rangeFields).transform(withRange(366));

export const trendQuerySchema = z
  .object({
    ...rangeFields,
    granularity: z.enum(['day', 'week']).default('day'),
    /** Super admin only: limit the series to these departments */
    departmentIds: csv(z.uuid()).optional(),
  })
  .transform(withRange(366))
  .refine((q) => q.granularity === 'week' || q.range.days <= 120, {
    message: 'Daily trend supports up to 120 days; use granularity=week for longer ranges',
    path: ['granularity'],
  });

export const breakdownQuerySchema = z.object(rangeFields).transform(withRange(366));

export const mapQuerySchema = z
  .object({
    ...rangeFields,
    departmentId: z.uuid().optional(),
    category: csv(z.string().trim().min(1).max(60)).optional(),
    status: csv(status).optional(),
    priority: csv(priority).optional(),
  })
  .transform(withRange(366));

export type DepartmentsQuery = z.infer<typeof departmentsQuerySchema>;
export type TrendQuery = z.infer<typeof trendQuerySchema>;
export type BreakdownQuery = z.infer<typeof breakdownQuerySchema>;
export type MapQuery = z.infer<typeof mapQuerySchema>;
export type { DateRange };

export interface RangeView {
  from: string;
  to: string;
  days: number;
  timezone: 'Asia/Kolkata';
}

export const STATUSES = ['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED'] as const;
export const PRIORITIES = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] as const;
export type StatusCounts = Record<(typeof STATUSES)[number], number>;
export type PriorityCounts = Record<(typeof PRIORITIES)[number], number>;

export interface DepartmentMetrics {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  /** Complaints created in the range */
  total: number;
  byStatus: StatusCounts;
  open: number;
  /** Created in range, still open and past the SLA deadline right now */
  overdue: number;
  escalated: number;
  /** Resolved (resolved_at) within the range, whenever they were created */
  resolvedInRange: number;
  resolvedWithinSla: number;
  /** resolvedWithinSla / resolvedInRange as 0–100, null when nothing was resolved */
  slaCompliancePct: number | null;
  avgResolutionHours: number | null;
}
