import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_CITIZEN_ROUTE_KEY, IS_PUBLIC_KEY } from '../decorators/auth.decorators.js';
import { TokenService } from '../token.service.js';

/**
 * Global guard. Every route is one of three kinds:
 *  - @Public()       → no token
 *  - @CitizenAuth()  → citizen token only   (sets request.citizen)
 *  - everything else → staff token only     (sets request.user; RolesGuard then checks @Roles())
 * Secure by default: a route someone forgets to mark is staff-only.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const isCitizenRoute = !!this.reflector.getAllAndOverride<boolean>(IS_CITIZEN_ROUTE_KEY, targets);
    const request = context.switchToHttp().getRequest<Request & { user?: unknown; citizen?: unknown }>();
    const header = request.headers.authorization?.trim();

    if (!header) {
      throw new UnauthorizedException(
        isCitizenRoute ? 'Please sign in with Google to continue' : 'Missing access token',
      );
    }
    const parts = header.split(/\s+/);
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedException('Malformed Authorization header. Use exactly: Bearer <accessToken>');
    }
    const token = parts[1];

    if (isCitizenRoute) {
      request.citizen = await this.tokens.verifyAccess('citizen', token);
    } else {
      request.user = await this.tokens.verifyAccess('staff', token);
    }
    return true;
  }
}