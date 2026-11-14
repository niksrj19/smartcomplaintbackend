import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { Public, Roles } from '../auth-core/decorators/auth.decorators.js';
import { DepartmentsService } from './departments.service.js';
import {
  type CreateDepartmentDto,
  type DepartmentMatch,
  type DepartmentResponse,
  type ListDepartmentsQuery,
  type UpdateDepartmentDto,
  createDepartmentSchema,
  departmentIdSchema,
  listDepartmentsQuerySchema,
  updateDepartmentSchema,
} from './dto/department.schemas.js';

const matchQuerySchema = z.object({ text: z.string().trim().min(5).max(1000) });

/**
 * HTTP only: validate input → call service → return result.
 * Reading is public (the citizen chat needs it); changes are super-admin only.
 */
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Public()
  @Get()
  list(
    @Query(new ZodValidationPipe(listDepartmentsQuerySchema)) query: ListDepartmentsQuery,
  ): Promise<DepartmentResponse[]> {
    return this.departments.list(query.includeInactive);
  }

  /** Handy for testing the embeddings: GET /departments/match?text=big pothole on main road */
  @Public()
  @Get('match')
  match(@Query(new ZodValidationPipe(matchQuerySchema)) query: { text: string }): Promise<DepartmentMatch[]> {
    return this.departments.findBestMatches(query.text);
  }

  @Public()
  @Get(':id')
  getById(@Param('id', new ZodValidationPipe(departmentIdSchema)) id: string): Promise<DepartmentResponse> {
    return this.departments.getById(id);
  }

  @Roles('SUPER_ADMIN')
  @Post()
  create(@Body(new ZodValidationPipe(createDepartmentSchema)) dto: CreateDepartmentDto): Promise<DepartmentResponse> {
    return this.departments.create(dto);
  }

  @Roles('SUPER_ADMIN')
  @Patch(':id')
  update(
    @Param('id', new ZodValidationPipe(departmentIdSchema)) id: string,
    @Body(new ZodValidationPipe(updateDepartmentSchema)) dto: UpdateDepartmentDto,
  ): Promise<DepartmentResponse> {
    return this.departments.update(id, dto);
  }

  @Roles('SUPER_ADMIN')
  @Delete(':id')
  deactivate(@Param('id', new ZodValidationPipe(departmentIdSchema)) id: string): Promise<DepartmentResponse> {
    return this.departments.deactivate(id);
  }
}
