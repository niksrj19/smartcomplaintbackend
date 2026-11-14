import type { StaffRole } from '../../generated/prisma/client.js';

/**
 * Two separate kinds of identity share one token system.
 * The kind is stamped into every token as its JWT audience, so a token of one kind
 * is rejected everywhere the other kind is expected.
 */
export type PrincipalKind = 'staff' | 'citizen';

/** A logged-in staff member (request.user on staff routes) */
export interface StaffPrincipal {
  id: string;
  email: string;
  role: StaffRole;
  departmentId: string | null;
}

/** A signed-in citizen (request.citizen on @CitizenAuth() routes) */
export interface CitizenPrincipal {
  id: string;
  email: string;
  name: string;
}

export interface PrincipalByKind {
  staff: StaffPrincipal;
  citizen: CitizenPrincipal;
}

export interface RefreshTokenPayload {
  sub: string;
  /** Token family — every rotation of one login shares it */
  fid: string;
  /** Unique id so two tokens issued in the same second never collide */
  jti: string;
}

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  familyId: string;
}
