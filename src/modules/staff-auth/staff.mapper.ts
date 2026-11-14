import type { StaffUser } from '../../generated/prisma/client.js';
import type { StaffResponse } from './dto/auth.schemas.js';

/** Never returns the password hash */
export function toStaffResponse(u: StaffUser): StaffResponse {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    departmentId: u.departmentId,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}
