import { z } from 'zod';

export const listMyComplaintsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED']).optional(),
});

export const ticketNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^SC-\d{4}-\d{5}$/, 'Ticket number looks like SC-2026-00123');

export type ListMyComplaintsQuery = z.infer<typeof listMyComplaintsQuerySchema>;
