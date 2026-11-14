import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1, 'Password is required').max(128),
});

const strongPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/[0-9]/, 'Password needs a number');

export const createStaffSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.email().trim().toLowerCase(),
    password: strongPassword,
    role: z.enum(['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'OFFICER']),
    departmentId: z.uuid().optional(),
  })
  .refine((v) => (v.role === 'SUPER_ADMIN' ? !v.departmentId : !!v.departmentId), {
    message: 'Super admins have no department; department admins and officers must have one',
    path: ['departmentId'],
  });

export const listStaffQuerySchema = z.object({
  departmentId: z.uuid().optional(),
  role: z.enum(['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'OFFICER']).optional(),
});

export type LoginDto = z.infer<typeof loginSchema>;
export type CreateStaffDto = z.infer<typeof createStaffSchema>;
export type ListStaffQuery = z.infer<typeof listStaffQuerySchema>;

export interface StaffResponse {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'DEPARTMENT_ADMIN' | 'OFFICER';
  departmentId: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface LoginResponse {
  accessToken: string;
  accessTokenExpiresAt: Date;
  user: StaffResponse;
}
