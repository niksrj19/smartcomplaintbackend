import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './guards/auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { TokenService } from './token.service.js';

/**
 * Shared authentication infrastructure: tokens, the global guards and the decorators.
 * Knows nothing about passwords, Google, or which tables users live in —
 * that's the job of staff-auth and citizen-auth.
 */
@Global()
@Module({
  // Secrets are passed per call in TokenService (different for access vs refresh)
  imports: [JwtModule.register({})],
  providers: [
    TokenService,
    // Order matters: authenticate first, then check roles
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [TokenService],
})
export class AuthCoreModule {}
