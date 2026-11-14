import { z } from 'zod';

const slaHours = z.number().int().min(1).max(24 * 60);

export const departmentIdSchema = z.uuid({ message: 'Invalid department id' });

export const createDepartmentSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Code must be 2–40 characters: letters, digits, underscores'),
  name: z.string().trim().min(2).max(100),
  // Used for embeddings — a richer description means better complaint matching
  description: z.string().trim().min(20, 'Describe the issues this department handles (20+ characters)').max(1000),
  contactEmail: z.email(),
  slaHoursCritical: slaHours.optional(),
  slaHoursHigh: slaHours.optional(),
  slaHoursNormal: slaHours.optional(),
  slaHoursLow: slaHours.optional(),
});

export const updateDepartmentSchema = createDepartmentSchema
  .omit({ code: true })
  .extend({ isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

export const listDepartmentsQuerySchema = z.object({
  // Query strings arrive as text, so "false" must not become true
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export type CreateDepartmentDto = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentDto = z.infer<typeof updateDepartmentSchema>;
export type ListDepartmentsQuery = z.infer<typeof listDepartmentsQuerySchema>;

/** What the API returns — never the embedding */
export interface DepartmentResponse {
  id: string;
  code: string;
  name: string;
  description: string;
  contactEmail: string;
  sla: { criticalHours: number; highHours: number; normalHours: number; lowHours: number };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Result of matching a complaint's text against department embeddings */
export interface DepartmentMatch {
  id: string;
  code: string;
  name: string;
  /** Cosine similarity, 0–1 (higher = closer) */
  similarity: number;
}
