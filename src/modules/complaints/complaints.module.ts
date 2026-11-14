import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { CitizenComplaintsController } from './citizen-complaints.controller.js';
import { ComplaintsRepository } from './complaints.repository.js';
import { ComplaintsService } from './complaints.service.js';
import { StaffComplaintsController } from './staff/staff-complaints.controller.js';
import { StaffComplaintsRepository } from './staff/staff-complaints.repository.js';
import { StaffComplaintsService } from './staff/staff-complaints.service.js';

@Module({
  imports: [StorageModule],
  controllers: [CitizenComplaintsController, StaffComplaintsController],
  providers: [ComplaintsRepository, ComplaintsService, StaffComplaintsRepository, StaffComplaintsService],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}
