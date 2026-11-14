import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import type { StaffPrincipal } from '../../auth-core/auth-core.types.js';
import { CurrentUser, Roles } from '../../auth-core/decorators/auth.decorators.js';
import {
  type AssignComplaintDto,
  type ListStaffComplaintsQuery,
  type UpdateStatusDto,
  assignComplaintSchema,
  complaintIdSchema,
  listStaffComplaintsQuerySchema,
  updateStatusSchema,
} from './dto/staff-complaints.schemas.js';
import { StaffComplaintsService } from './staff-complaints.service.js';

/**
 * Staff-only (any role). What each person sees is scoped in the repository:
 * super admin → all, department admin → their department, officer → assigned to them.
 */
@Controller('staff/complaints')
export class StaffComplaintsController {
  constructor(private readonly complaints: StaffComplaintsService) {}

  @Get()
  list(
    @CurrentUser() actor: StaffPrincipal,
    @Query(new ZodValidationPipe(listStaffComplaintsQuerySchema)) query: ListStaffComplaintsQuery,
  ) {
    return this.complaints.list(actor, query);
  }

  @Get(':id')
  detail(@CurrentUser() actor: StaffPrincipal, @Param('id', new ZodValidationPipe(complaintIdSchema)) id: string) {
    return this.complaints.detail(actor, id);
  }

  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN')
  @Patch(':id/assign')
  assign(
    @CurrentUser() actor: StaffPrincipal,
    @Param('id', new ZodValidationPipe(complaintIdSchema)) id: string,
    @Body(new ZodValidationPipe(assignComplaintSchema)) dto: AssignComplaintDto,
  ) {
    return this.complaints.assign(actor, id, dto);
  }

  /** Rules (who may move what where, when a remark is needed) live in complaint-workflow.ts */
  @Patch(':id/status')
  changeStatus(
    @CurrentUser() actor: StaffPrincipal,
    @Param('id', new ZodValidationPipe(complaintIdSchema)) id: string,
    @Body(new ZodValidationPipe(updateStatusSchema)) dto: UpdateStatusDto,
  ) {
    return this.complaints.changeStatus(actor, id, dto);
  }
}
