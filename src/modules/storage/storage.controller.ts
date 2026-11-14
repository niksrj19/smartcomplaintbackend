import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { type RateLimitRule, RateLimitService } from '../../common/rate-limit/rate-limit.service.js';
import type { PresignedUrl } from '../../ports/object-storage.js';
import type { CitizenPrincipal } from '../auth-core/auth-core.types.js';
import { CitizenAuth, CurrentCitizen } from '../auth-core/decorators/auth.decorators.js';
import {
  type ConfirmUploadDto,
  type ConfirmedPhoto,
  type CreateUploadUrlDto,
  type UploadUrlResponse,
  confirmUploadSchema,
  createUploadUrlSchema,
  viewUrlQuerySchema,
} from './dto/storage.schemas.js';
import { StorageService } from './storage.service.js';

/** Uploads are for signed-in citizens only, rate-limited per citizen */
const UPLOAD_LIMIT: RateLimitRule = { name: 'photo-upload', limit: 20, windowSeconds: 60 * 60 };

@Controller('storage')
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @CitizenAuth()
  @Post('upload-url')
  async createUploadUrl(
    @CurrentCitizen() citizen: CitizenPrincipal,
    @Body(new ZodValidationPipe(createUploadUrlSchema)) dto: CreateUploadUrlDto,
  ): Promise<UploadUrlResponse> {
    await this.rateLimit.consume(UPLOAD_LIMIT, citizen.id);
    return this.storage.createUploadUrl(dto);
  }

  @CitizenAuth()
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Body(new ZodValidationPipe(confirmUploadSchema)) dto: ConfirmUploadDto): Promise<ConfirmedPhoto> {
    return this.storage.confirmUpload(dto.key);
  }

  /** Staff only (any logged-in role) */
  @Get('view-url')
  viewUrl(@Query(new ZodValidationPipe(viewUrlQuerySchema)) query: { key: string }): Promise<PresignedUrl> {
    return this.storage.createViewUrl(query.key);
  }
}
