export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface CreateUploadUrlInput {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}

export interface PresignedUrl {
  url: string;
  key: string;
  expiresAt: Date;
}

export interface ObjectInfo {
  exists: boolean;
  sizeBytes?: number;
  contentType?: string;
}

export interface ObjectStorage {
  readonly name: string;
  /** Browser uploads the photo straight to storage with this URL (HTTP PUT) */
  createUploadUrl(input: CreateUploadUrlInput): Promise<PresignedUrl>;
  createDownloadUrl(key: string, expiresInSeconds?: number): Promise<PresignedUrl>;
  /** Used to confirm an upload really happened before attaching it to a complaint */
  headObject(key: string): Promise<ObjectInfo>;
  deleteObject(key: string): Promise<void>;
}
