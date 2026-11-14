import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Citizen } from '../../generated/prisma/client.js';
import type { IssuedTokens } from '../auth-core/auth-core.types.js';
import type { SessionManager } from '../auth-core/session-manager.js';
import type { CitizenProfileResponse } from './dto/citizen-auth.schemas.js';
import { CitizenRepository } from './repositories/citizen.repository.js';
import { GoogleLoginStrategy } from './strategies/google-login.strategy.js';

export const CITIZEN_SESSIONS = Symbol('CITIZEN_SESSIONS');

/** Citizen login = GoogleLoginStrategy + the shared SessionManager */
@Injectable()
export class CitizenAuthService {
  constructor(
    private readonly googleLogin: GoogleLoginStrategy,
    @Inject(CITIZEN_SESSIONS) private readonly sessions: SessionManager<'citizen'>,
    private readonly citizens: CitizenRepository,
  ) {}

  async loginWithGoogle(idToken: string): Promise<IssuedTokens & { citizen: CitizenProfileResponse }> {
    const principal = await this.googleLogin.authenticate({ idToken });
    const tokens = await this.sessions.start(principal);
    return { ...tokens, citizen: await this.me(principal.id) };
  }

  refresh(refreshToken: string | undefined): Promise<IssuedTokens> {
    return this.sessions.refresh(refreshToken);
  }

  logout(refreshToken: string | undefined): Promise<void> {
    return this.sessions.logout(refreshToken);
  }

  async me(citizenId: string): Promise<CitizenProfileResponse> {
    const citizen = await this.citizens.findById(citizenId);
    if (!citizen) throw new UnauthorizedException('Please sign in again.');
    return toProfile(citizen);
  }
}

function toProfile(c: Citizen): CitizenProfileResponse {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    avatarUrl: c.avatarUrl,
    createdAt: c.createdAt,
  };
}
