import { z } from 'zod';

export const googleLoginSchema = z.object({
  /** The `credential` string from Google Identity Services on the frontend */
  idToken: z.string().min(100, 'Invalid Google token').max(4096),
});

export type GoogleLoginDto = z.infer<typeof googleLoginSchema>;

export interface CitizenProfileResponse {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface CitizenLoginResponse {
  accessToken: string;
  accessTokenExpiresAt: Date;
  citizen: CitizenProfileResponse;
}
