import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { StaffPrincipal } from '../auth-core/auth-core.types.js';
import { CurrentUser, Roles } from '../auth-core/decorators/auth.decorators.js';
import { type DashboardSummary, DashboardService } from './dashboard.service.js';

const workloadQuerySchema = z.object({ departmentId: z.uuid().optional() });

/** Same endpoint for every role — the numbers are automatically scoped to what the caller can see */
@Controller('staff/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@CurrentUser() actor: StaffPrincipal): Promise<DashboardSummary> {
    return this.dashboard.summary(actor);
  }

  @Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN')
  @Get('workload')
  workload(
    @CurrentUser() actor: StaffPrincipal,
    @Query(new ZodValidationPipe(workloadQuerySchema)) query: { departmentId?: string },
  ) {
    return this.dashboard.workload(actor, query.departmentId);
  }
}
