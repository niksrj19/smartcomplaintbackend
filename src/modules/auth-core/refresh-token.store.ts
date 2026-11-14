/**
 * Where a kind of user keeps its refresh tokens. Staff and citizens each have their own table,
 * but the session logic only talks to this interface.
 */
export interface StoredRefreshToken {
  id: string;
  principalId: string;
  familyId: string;
  revokedAt: Date | null;
}

export interface NewRefreshToken {
  principalId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
}

export interface RefreshTokenStore {
  create(token: NewRefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<StoredRefreshToken | null>;
  /**
   * In one transaction: revoke the old token (only if not already revoked) and store the new one.
   * Returns false if the old token was already used — two simultaneous refreshes can't both win.
   */
  rotate(oldId: string, next: NewRefreshToken): Promise<boolean>;
  /** Revokes every token of one login session (logout, or reuse detected) */
  revokeFamily(familyId: string): Promise<void>;
}
