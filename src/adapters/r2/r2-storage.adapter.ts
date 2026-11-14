import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ProviderError } from '../../common/errors/provider.error.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import type {
  CreateUploadUrlInput,
  ObjectInfo,
  ObjectStorage,
  PresignedUrl,
} from '../../ports/object-storage.js';

const DEFAULT_UPLOAD_EXPIRY = 5 * 60; // 5 minutes
const DEFAULT_DOWNLOAD_EXPIRY = 15 * 60; // 15 minutes

/** Cloudflare R2 is S3-compatible, so we use the AWS SDK pointed at R2's endpoint. */
export class R2StorageAdapter implements ObjectStorage {
  readonly name = 'r2';
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: AppConfigService) {
    const r2 = config.r2;
    this.bucket = r2.bucket;
    this.client = new S3Client({
      region: 'auto',
      endpoint: r2.endpoint,
      // R2 expects https://<account>.r2.cloudflarestorage.com/<bucket>/<key>
      forcePathStyle: true,
      credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
    });
  }

  async createUploadUrl({
    key,
    contentType,
    expiresInSeconds = DEFAULT_UPLOAD_EXPIRY,
  }: CreateUploadUrlInput): Promise<PresignedUrl> {
    try {
      const url = await getSignedUrl(
        this.client,
        new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
        { expiresIn: expiresInSeconds },
      );
      return { url, key, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
    } catch (err) {
      throw new ProviderError(this.name, 'createUploadUrl', err);
    }
  }

  async createDownloadUrl(key: string, expiresInSeconds = DEFAULT_DOWNLOAD_EXPIRY): Promise<PresignedUrl> {
    try {
      const url = await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: expiresInSeconds },
      );
      return { url, key, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
    } catch (err) {
      throw new ProviderError(this.name, 'createDownloadUrl', err);
    }
  }

  async headObject(key: string): Promise<ObjectInfo> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { exists: true, sizeBytes: res.ContentLength, contentType: res.ContentType };
    } catch (err) {
      if (err instanceof NotFound || (err as { name?: string }).name === 'NotFound') {
        return { exists: false };
      }
      throw new ProviderError(this.name, 'headObject', err);
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      throw new ProviderError(this.name, 'deleteObject', err);
    }
  }
}