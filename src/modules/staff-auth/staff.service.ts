import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { DepartmentsService } from '../departments/departments.service.js';
import type { StaffPrincipal } from '../auth-core/auth-core.types.js';
import type { CreateStaffDto, ListStaffQuery, StaffResponse } from './dto/auth.schemas.js';
import { PasswordService } from './password.service.js';
import { StaffRepository } from './repositories/staff.repository.js';
import { toStaffResponse } from './staff.mapper.js';

@Injectable()
export class StaffService {
  constructor(
    private readonly staff: StaffRepository,
    private readonly passwords: PasswordService,
    private readonly departments: DepartmentsService,
  ) {}

  /**
   * SUPER_ADMIN can create anyone.
   * DEPARTMENT_ADMIN can only create OFFICERs in their own department.
   */
  async create(actor: StaffPrincipal, dto: CreateStaffDto): Promise<StaffResponse> {
    if (actor.role === 'DEPARTMENT_ADMIN') {
      if (dto.role !== 'OFFICER' || dto.departmentId !== actor.departmentId) {
        throw new ForbiddenException('Department admins can only add officers to their own department');
      }
    }
    if (dto.departmentId) {
      // Throws 404 if it doesn't exist
      const dept = await this.departments.getById(dto.departmentId);
      if (!dept.isActive) throw new BadRequestException('Department is inactive');
    }

    try {
      const user = await this.staff.create({
        name: dto.name,
        email: dto.email,
        passwordHash: await this.passwords.hash(dto.password),
        role: dto.role,
        departmentId: dto.departmentId ?? null,
      });
      return toStaffResponse(user);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`A staff member with email ${dto.email} already exists`);
      }
      throw err;
    }
  }

  /** Department admins only ever see their own department's staff */
  async list(actor: StaffPrincipal, query: ListStaffQuery): Promise<StaffResponse[]> {
    const departmentId = actor.role === 'SUPER_ADMIN' ? query.departmentId : (actor.departmentId ?? undefined);
    const users = await this.staff.findMany({
      ...(departmentId ? { departmentId } : {}),
      ...(query.role ? { role: query.role } : {}),
    });
    return users.map(toStaffResponse);
  }
}
