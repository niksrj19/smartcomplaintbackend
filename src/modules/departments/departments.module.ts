import { Module } from '@nestjs/common';
import { DepartmentEmbeddingSync } from './department-embedding.sync.js';
import { DepartmentsController } from './departments.controller.js';
import { DepartmentsRepository } from './departments.repository.js';
import { DepartmentsService } from './departments.service.js';

@Module({
  controllers: [DepartmentsController],
  providers: [DepartmentsRepository, DepartmentsService, DepartmentEmbeddingSync],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
