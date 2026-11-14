import { Module } from '@nestjs/common';
import { SessionManager } from '../auth-core/session-manager.js';
import { TokenService } from '../auth-core/token.service.js';
import { CitizenAuthController } from './citizen-auth.controller.js';
import { CITIZEN_SESSIONS, CitizenAuthService } from './citizen-auth.service.js';
import { CitizenRefreshTokenStore } from './repositories/citizen-refresh-token.store.js';
import { CitizenRepository } from './repositories/citizen.repository.js';
import { GoogleLoginStrategy } from './strategies/google-login.strategy.js';

/** Citizen identity: self-service Google sign-in, created on first login */
@Module({
  controllers: [CitizenAuthController],
  providers: [
    CitizenAuthService,
    GoogleLoginStrategy,
    CitizenRepository,
    CitizenRefreshTokenStore,
    {
      // The shared session logic, wired to the citizen token table and citizen loader
      provide: CITIZEN_SESSIONS,
      inject: [TokenService, CitizenRefreshTokenStore, CitizenRepository],
      useFactory: (tokens: TokenService, store: CitizenRefreshTokenStore, citizens: CitizenRepository) =>
        new SessionManager('citizen', tokens, store, async (id) => {
          const c = await citizens.findById(id);
          return c ? { id: c.id, email: c.email, name: c.name } : null;
        }),
    },
  ],
})
export class CitizenAuthModule {}
