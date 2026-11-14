import { Logger, UnauthorizedException } from '@nestjs/common';
import type { IssuedTokens, PrincipalByKind, PrincipalKind } from './auth-core.types.js';
import type { RefreshTokenStore } from './refresh-token.store.js';
import type { TokenService } from './token.service.js';

/**
 * Login sessions for ONE kind of user: start, refresh (rotation + reuse detection), logout.
 * Each auth module creates its own instance with its own token store and principal loader,
 * so the logic is written once and the two kinds stay fully separated.
 */
export class SessionManager<K extends PrincipalKind> {
  private readonly logger: Logger;

  constructor(
    private readonly kind: K,
    private readonly tokens: TokenService,
    private readonly store: RefreshTokenStore,
    /** Reloads the user on refresh. Return null if the account is gone or disabled. */
    private readonly loadPrincipal: (id: string) => Promise<PrincipalByKind[K] | null>,
  ) {
    this.logger = new Logger(`SessionManager:${kind}`);
  }

  async start(principal: PrincipalByKind[K]): Promise<IssuedTokens> {
    const issued = await this.tokens.issue(this.kind, principal);
    await this.store.create({
      principalId: principal.id,
      tokenHash: this.tokens.hashRefreshToken(issued.refreshToken),
      familyId: issued.familyId,
      expiresAt: issued.refreshTokenExpiresAt,
    });
    return issued;
  }

  /**
   * Each refresh token works ONCE and returns a new pair.
   * If an already-used token shows up again it was probably stolen,
   * so the whole session (token family) is revoked.
   */
  async refresh(refreshToken: string | undefined): Promise<IssuedTokens> {
    if (!refreshToken) throw new UnauthorizedException('Please sign in again.');

    const payload = await this.tokens.verifyRefresh(this.kind, refreshToken);
    const stored = await this.store.findByHash(this.tokens.hashRefreshToken(refreshToken));
    if (!stored || stored.principalId !== payload.sub) {
      throw new UnauthorizedException('Please sign in again.');
    }

    if (stored.revokedAt) {
      this.logger.warn(`Refresh token reuse detected for ${stored.principalId}; revoking session`);
      await this.store.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    const principal = await this.loadPrincipal(stored.principalId);
    if (!principal) {
      await this.store.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Account not found or disabled.');
    }

    const issued = await this.tokens.issue(this.kind, principal, stored.familyId);
    const rotated = await this.store.rotate(stored.id, {
      principalId: principal.id,
      tokenHash: this.tokens.hashRefreshToken(issued.refreshToken),
      familyId: stored.familyId,
      expiresAt: issued.refreshTokenExpiresAt,
    });
    if (!rotated) {
      // Another request used this token at the same moment — treat it as reuse
      await this.store.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }
    return issued;
  }

  /** Revokes the whole session. Always succeeds, even with a bad or missing token. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const stored = await this.store.findByHash(this.tokens.hashRefreshToken(refreshToken));
    if (stored) await this.store.revokeFamily(stored.familyId);
  }
}
