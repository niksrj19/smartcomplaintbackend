import type { Request, Response } from 'express';
import type { PrincipalKind } from './auth-core.types.js';

const COOKIES: Record<PrincipalKind, { name: string; path: string }> = {
  staff: { name: 'refresh_token', path: '/api/v1/auth' },
  citizen: { name: 'citizen_refresh_token', path: '/api/v1/auth/citizen' },
};

/**
 * The refresh token lives in an httpOnly cookie — page scripts can't read it, so XSS can't steal it.
 * It's only sent to that kind's /auth routes. Each kind has its own cookie name.
 */
export class RefreshCookie {
  private readonly name: string;
  private readonly path: string;

  constructor(
    kind: PrincipalKind,
    private readonly secure: boolean,
  ) {
    ({ name: this.name, path: this.path } = COOKIES[kind]);
  }

  set(res: Response, token: string, expiresAt: Date): void {
    res.cookie(this.name, token, {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'strict',
      path: this.path,
      expires: expiresAt,
    });
  }

  clear(res: Response): void {
    res.clearCookie(this.name, { path: this.path });
  }

  /** Small parser so we don't need the cookie-parser package */
  read(req: Request): string | undefined {
    for (const part of (req.headers.cookie ?? '').split(';')) {
      const [key, ...rest] = part.trim().split('=');
      if (key === this.name) return decodeURIComponent(rest.join('='));
    }
    return undefined;
  }
}
