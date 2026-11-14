import { createHash, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { AppConfigService } from '../../config/app-config.service.js';
import type { IssuedTokens, PrincipalByKind, PrincipalKind, RefreshTokenPayload } from './auth-core.types.js';

/**
 * ONE token implementation for both kinds of user.
 *  - access and refresh tokens use DIFFERENT secrets (a refresh token can't be used as an access token)
 *  - the kind is the JWT audience (a citizen token can't open a staff route, and vice versa)
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async issue<K extends PrincipalKind>(
    kind: K,
    principal: PrincipalByKind[K],
    familyId: string = randomUUID(),
  ): Promise<IssuedTokens> {
    const { accessSecret, accessExpiresIn, refreshSecret, refreshExpiresIn } = this.config.jwt;
    const { id, ...claims } = principal;
    const refreshPayload: RefreshTokenPayload = { sub: id, fid: familyId, jti: randomUUID() };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { ...claims, sub: id },
        { secret: accessSecret, audience: kind, expiresIn: accessExpiresIn as JwtSignOptions['expiresIn'] },
      ),
      this.jwt.signAsync(refreshPayload, {
        secret: refreshSecret,
        audience: kind,
        expiresIn: refreshExpiresIn as JwtSignOptions['expiresIn'],
      }),
    ]);

    return {
      accessToken,
      accessTokenExpiresAt: this.expiryOf(accessToken),
      refreshToken,
      refreshTokenExpiresAt: this.expiryOf(refreshToken),
      familyId,
    };
  }

  /** Returns the principal stored in the token, or throws 401 with the SPECIFIC reason */
  async verifyAccess<K extends PrincipalKind>(kind: K, token: string): Promise<PrincipalByKind[K]> {
    try {
      const { sub, aud: _aud, iat: _iat, exp: _exp, ...claims } = await this.jwt.verifyAsync<Record<string, unknown>>(
        token,
        { secret: this.config.jwt.accessSecret, audience: kind },
      );
      return { id: sub, ...claims } as PrincipalByKind[K];
    } catch (err) {
      throw new UnauthorizedException(this.reason(kind, err));
    }
  }

  /** Turns a jsonwebtoken error into a message that says what to do */
  private reason(kind: PrincipalKind, err: unknown): string {
    const refreshPath = kind === 'citizen' ? 'POST /auth/citizen/refresh' : 'POST /auth/refresh';
    const name = (err as { name?: string })?.name;
    const message = (err as { message?: string })?.message ?? '';
    if (name === 'TokenExpiredError') {
      return `Access token expired. Get a new one with ${refreshPath} (or sign in again).`;
    }
    if (message.includes('audience')) {
      const other = kind === 'citizen' ? 'staff' : 'citizen';
      return `This is a ${other} token. This route needs a ${kind} access token.`;
    }
    if (message.includes('signature')) {
      return 'Access token signature is invalid (issued by a different server or secret).';
    }
    return 'Access token is malformed. Send only the accessToken value, without quotes.';
  }

  async verifyRefresh(kind: PrincipalKind, token: string): Promise<RefreshTokenPayload> {
    try {
      return await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.jwt.refreshSecret,
        audience: kind,
      });
    } catch {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }
  }

  /** Only a SHA-256 hash of refresh tokens is stored — a DB leak doesn't leak usable tokens */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private expiryOf(token: string): Date {
    const { exp } = this.jwt.decode<{ exp: number }>(token);
    return new Date(exp * 1000);
  }
}