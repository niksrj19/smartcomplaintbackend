import { z } from 'zod';
import { isoDaySchema } from '../../../../common/dates/date-range.js';

const status = z.enum(['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED']);
const priority = z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

/** Comma-separated lists in the query string, e.g. ?status=SUBMITTED,ASSIGNED */
const csv = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .string()
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(item).min(1));

export const complaintIdSchema = z.uuid({ message: 'Invalid complaint id' });

export const listStaffComplaintsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: csv(status).optional(),
  priority: csv(priority).optional(),
  /** Super admin only — others are already scoped */
  departmentId: z.uuid().optional(),
  assignedOfficerId: z.uuid().optional(),
  unassigned: bool.optional(),
  overdue: bool.optional(),
  escalated: bool.optional(),
  /** Ticket number or words in the title */
  search: z.string().trim().min(2).max(100).optional(),
  /** Exact category names, case-insensitive (drill-down from analytics charts) */
  category: csv(z.string().trim().min(1).max(60)).optional(),
  /** Created on or after this IST day */
  createdFrom: isoDaySchema.optional(),
  /** Created on or before this IST day */
  createdTo: isoDaySchema.optional(),
  sort: z.enum(['newest', 'oldest', 'priority', 'sla']).default('newest'),
});

export const assignComplaintSchema = z.object({
  officerId: z.uuid(),
  remark: z.string().trim().max(500).optional(),
});

export const updateStatusSchema = z.object({
  status: status.exclude(['SUBMITTED', 'ASSIGNED']),
  remark: z.string().trim().max(1000).optional(),
});

export type ListStaffComplaintsQuery = z.infer<typeof listStaffComplaintsQuerySchema>;
export type AssignComplaintDto = z.infer<typeof assignComplaintSchema>;
export type UpdateStatusDto = z.infer<typeof updateStatusSchema>;
