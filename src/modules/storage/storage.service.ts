import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OBJECT_STORAGE, type ObjectStorage, type PresignedUrl } from '../../ports/object-storage.js';
import {
  ALLOWED_PHOTO_TYPES,
  type ConfirmedPhoto,
  type CreateUploadUrlDto,
  MAX_PHOTO_BYTES,
  PHOTO_KEY_PATTERN,
  type UploadUrlResponse,
} from './dto/storage.schemas.js';

/**
 * Upload flow (the file never passes through our server):
 *  1. createUploadUrl → short-lived presigned PUT URL + key
 *  2. browser PUTs the file straight to R2
 *  3. confirmUpload → we check the object really exists, with an allowed type and size
 *  4. complaint creation calls verifyPhotos again before attaching keys
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  async createUploadUrl(dto: CreateUploadUrlDto): Promise<UploadUrlResponse> {
    const now = new Date();
    const ext = ALLOWED_PHOTO_TYPES[dto.contentType];
    const key = `complaints/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;

    const presigned = await this.storage.createUploadUrl({ key, contentType: dto.contentType });
    return { key, uploadUrl: presigned.url, expiresAt: presigned.expiresAt };
  }

  /**
   * A presigned URL can't stop someone uploading a 50 MB file or the wrong type,
   * so we check after the upload and delete anything that breaks the rules.
   */
  async confirmUpload(key: string): Promise<ConfirmedPhoto> {
    this.assertOurKey(key);
    const info = await this.storage.headObject(key);
    if (!info.exists) {
      throw new NotFoundException('Photo not found. The upload may have failed — please try again.');
    }

    const allowedType = !!info.contentType && info.contentType in ALLOWED_PHOTO_TYPES;
    const allowedSize = (info.sizeBytes ?? 0) > 0 && (info.sizeBytes ?? 0) <= MAX_PHOTO_BYTES;
    if (!allowedType || !allowedSize) {
      await this.storage.deleteObject(key);
      this.logger.warn(`Rejected upload ${key}: type=${info.contentType} size=${info.sizeBytes}`);
      throw new BadRequestException('Photo must be a JPEG, PNG, WEBP or HEIC image under 5 MB.');
    }

    return { key, contentType: info.contentType!, sizeBytes: info.sizeBytes! };
  }

  /** Used by the complaints module right before saving — never trust keys from the client or LLM */
  async verifyPhotos(keys: string[]): Promise<ConfirmedPhoto[]> {
    return Promise.all([...new Set(keys)].map((k) => this.confirmUpload(k)));
  }

  /** Short-lived link for staff dashboards to display a photo */
  createViewUrl(key: string): Promise<PresignedUrl> {
    this.assertOurKey(key);
    return this.storage.createDownloadUrl(key);
  }

  private assertOurKey(key: string): void {
    if (!PHOTO_KEY_PATTERN.test(key)) {
      throw new BadRequestException('Invalid photo key');
    }
  }
}
