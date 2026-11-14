import { Controller, Get, Param, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { StaffPrincipal } from '../auth-core/auth-core.types.js';
import { CurrentUser, Roles } from '../auth-core/decorators/auth.decorators.js';
import { AnalyticsService } from './analytics.service.js';
import {
  type BreakdownQuery,
  type DepartmentsQuery,
  type MapQuery,
  type TrendQuery,
  breakdownQuerySchema,
  departmentIdParamSchema,
  departmentsQuerySchema,
  mapQuerySchema,
  trendQuerySchema,
} from './dto/analytics.schemas.js';

/**
 * Admin analytics. All routes accept ?from=YYYY-MM-DD&to=YYYY-MM-DD (IST days, default last 30 days).
 * Drill-down to individual complaints uses GET /staff/complaints with the same filters.
 */
@Roles('SUPER_ADMIN', 'DEPARTMENT_ADMIN')
@Controller('staff/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('departments')
  departments(
    @CurrentUser() actor: StaffPrincipal,
    @Query(new ZodValidationPipe(departmentsQuerySchema)) query: DepartmentsQuery,
  ) {
    return this.analytics.departments(actor, query);
  }

  @Get('departments/:id')
  breakdown(
    @CurrentUser() actor: StaffPrincipal,
    @Param('id', new ZodValidationPipe(departmentIdParamSchema)) id: string,
    @Query(new ZodValidationPipe(breakdownQuerySchema)) query: BreakdownQuery,
  ) {
    return this.analytics.departmentBreakdown(actor, id, query);
  }

  @Get('trend')
  trend(@CurrentUser() actor: StaffPrincipal, @Query(new ZodValidationPipe(trendQuerySchema)) query: TrendQuery) {
    return this.analytics.trend(actor, query);
  }

  @Get('map')
  map(@CurrentUser() actor: StaffPrincipal, @Query(new ZodValidationPipe(mapQuerySchema)) query: MapQuery) {
    return this.analytics.map(actor, query);
  }
}
