import { z } from 'zod';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

/** Allowed photo types → file extension used in the object key */
export const ALLOWED_PHOTO_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
} as const;

export type AllowedPhotoType = keyof typeof ALLOWED_PHOTO_TYPES;

/** Only keys we generated are accepted — stops clients pointing at arbitrary objects */
export const PHOTO_KEY_PATTERN =
  /^complaints\/\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic)$/;

export const photoKeySchema = z.string().regex(PHOTO_KEY_PATTERN, 'Invalid photo key');

export const createUploadUrlSchema = z.object({
  contentType: z.enum(Object.keys(ALLOWED_PHOTO_TYPES) as [AllowedPhotoType, ...AllowedPhotoType[]], {
    message: 'Only JPEG, PNG, WEBP or HEIC photos are allowed',
  }),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_PHOTO_BYTES, `Photo must be under ${MAX_PHOTO_BYTES / 1024 / 1024} MB`),
});

export const confirmUploadSchema = z.object({ key: photoKeySchema });
export const viewUrlQuerySchema = z.object({ key: photoKeySchema });

export type CreateUploadUrlDto = z.infer<typeof createUploadUrlSchema>;
export type ConfirmUploadDto = z.infer<typeof confirmUploadSchema>;

export interface UploadUrlResponse {
  key: string;
  /** Browser sends the file with: PUT uploadUrl, header Content-Type = contentType */
  uploadUrl: string;
  expiresAt: Date;
}

export interface ConfirmedPhoto {
  key: string;
  contentType: string;
  sizeBytes: number;
}
