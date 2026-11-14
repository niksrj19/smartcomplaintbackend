import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { StaffRole } from '../../../generated/prisma/client.js';
import type { CitizenPrincipal, StaffPrincipal } from '../auth-core.types.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const IS_CITIZEN_ROUTE_KEY = 'isCitizenRoute';
export const ROLES_KEY = 'roles';

/** No token needed (health check, logins, reading the department list) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Citizen token required (chat, uploads, My complaints). Staff tokens are rejected. */
export const CitizenAuth = () => SetMetadata(IS_CITIZEN_ROUTE_KEY, true);

/** Staff route restricted to roles, e.g. @Roles('SUPER_ADMIN'). Without it, any staff role is allowed. */
export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES_KEY, roles);

/** The logged-in staff member: `me(@CurrentUser() user: StaffPrincipal)` */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): StaffPrincipal =>
    ctx.switchToHttp().getRequest<{ user: StaffPrincipal }>().user,
);

/** The signed-in citizen: `send(@CurrentCitizen() citizen: CitizenPrincipal)` */
export const CurrentCitizen = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CitizenPrincipal =>
    ctx.switchToHttp().getRequest<{ citizen: CitizenPrincipal }>().citizen,
);
