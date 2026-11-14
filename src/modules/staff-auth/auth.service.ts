import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { IssuedTokens } from '../auth-core/auth-core.types.js';
import type { SessionManager } from '../auth-core/session-manager.js';
import type { LoginDto, StaffResponse } from './dto/auth.schemas.js';
import { StaffRepository } from './repositories/staff.repository.js';
import { toStaffResponse } from './staff.mapper.js';
import { PasswordLoginStrategy } from './strategies/password-login.strategy.js';

export const STAFF_SESSIONS = Symbol('STAFF_SESSIONS');

/** Staff login = PasswordLoginStrategy + the shared SessionManager */
@Injectable()
export class AuthService {
  constructor(
    private readonly passwordLogin: PasswordLoginStrategy,
    @Inject(STAFF_SESSIONS) private readonly sessions: SessionManager<'staff'>,
    private readonly staff: StaffRepository,
  ) {}

  async login(dto: LoginDto): Promise<IssuedTokens & { user: StaffResponse }> {
    const principal = await this.passwordLogin.authenticate(dto);
    const user = await this.staff.touchLastLogin(principal.id);
    const tokens = await this.sessions.start(principal);
    return { ...tokens, user: toStaffResponse(user) };
  }

  refresh(refreshToken: string | undefined): Promise<IssuedTokens> {
    return this.sessions.refresh(refreshToken);
  }

  logout(refreshToken: string | undefined): Promise<void> {
    return this.sessions.logout(refreshToken);
  }

  async me(userId: string): Promise<StaffResponse> {
    const user = await this.staff.findById(userId);
    if (!user?.isActive) throw new UnauthorizedException('Account not found or disabled');
    return toStaffResponse(user);
  }
}
