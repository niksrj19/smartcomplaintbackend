import { Controller, Get, Param, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { CitizenPrincipal } from '../auth-core/auth-core.types.js';
import { CitizenAuth, CurrentCitizen } from '../auth-core/decorators/auth.decorators.js';
import { ComplaintsService } from './complaints.service.js';
import {
  type ListMyComplaintsQuery,
  listMyComplaintsQuerySchema,
  ticketNumberSchema,
} from './dto/citizen-complaints.schemas.js';

/** "My complaints" for the signed-in citizen. Every query is scoped to their own account. */
@CitizenAuth()
@Controller('citizen/complaints')
export class CitizenComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  list(
    @CurrentCitizen() citizen: CitizenPrincipal,
    @Query(new ZodValidationPipe(listMyComplaintsQuerySchema)) query: ListMyComplaintsQuery,
  ) {
    return this.complaints.listForCitizen(citizen.id, query);
  }

  @Get(':ticketNumber')
  detail(
    @CurrentCitizen() citizen: CitizenPrincipal,
    @Param('ticketNumber', new ZodValidationPipe(ticketNumberSchema)) ticketNumber: string,
  ) {
    return this.complaints.getForCitizen(citizen.id, ticketNumber);
  }
}
