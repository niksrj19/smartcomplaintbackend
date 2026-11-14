import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { StaffPrincipal } from '../auth-core/auth-core.types.js';
import { CurrentUser, Roles } from '../auth-core/decorators/auth.decorators.js';
import {
  type CreateStaffDto,
  type ListStaffQuery,
  type StaffResponse,
  createStaffSchema,
  listStaffQuerySchema,
} from './dto/auth.schemas.js';
import { StaffService } from './staff.service.js';

@Controller('staff')
@Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Post()
  create(
    @CurrentUser() actor: StaffPrincipal,
    @Body(new ZodValidationPipe(createStaffSchema)) dto: CreateStaffDto,
  ): Promise<StaffResponse> {
    return this.staff.create(actor, dto);
  }

  @Get()
  list(
    @CurrentUser() actor: StaffPrincipal,
    @Query(new ZodValidationPipe(listStaffQuerySchema)) query: ListStaffQuery,
  ): Promise<StaffResponse[]> {
    return this.staff.list(actor, query);
  }
}
