import { z } from 'zod';

/**
 * What the LLM must produce to create a draft (the create_draft tool's arguments).
 * Shared with the Next.js frontend for the draft card.
 * No .transform() here — this schema is converted to JSON Schema for the LLM tool definition.
 */
export const complaintPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);

export const complaintDraftSchema = z.object({
  citizenName: z.string().trim().min(2).max(100).describe("Citizen's full name"),
  citizenEmail: z.email().describe("Citizen's email address"),
  citizenPhone: z
    .string()
    .regex(/^\+?[0-9][0-9\s-]{8,15}$/, 'Phone must be 10–13 digits, optionally starting with +')
    .optional()
    .describe("Citizen's phone number"),
  departmentCode: z
    .string()
    .min(2)
    .max(40)
    .describe('Code of the department from the provided list, e.g. ROADS'),
  // Trimmed so analytics groups and list filters always agree on the category name
  category: z.string().trim().min(2).max(60).describe('Short issue category, e.g. "Pothole"'),
  priority: complaintPrioritySchema.describe('CRITICAL = danger to life, HIGH = urgent, NORMAL, LOW'),
  title: z.string().min(5).max(120).describe('One-line summary of the issue'),
  description: z.string().min(10).max(2000).describe('Full description in the citizen\'s words'),
  address: z.string().min(5).max(300).describe('Where the issue is'),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  photoKeys: z.array(z.string()).max(5).optional().describe('Uploaded photo keys, if any'),
});

export type ComplaintDraftInput = z.infer<typeof complaintDraftSchema>;
export type ComplaintPriority = z.infer<typeof complaintPrioritySchema>;
