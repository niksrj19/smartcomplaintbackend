import { HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { CACHE_SERVICE, type CacheService } from '../../../ports/cache.service.js';
import type { StaffPrincipal } from '../../auth-core/auth-core.types.js';
import type { LoginStrategy } from '../../auth-core/login-strategy.js';
import type { LoginDto } from '../dto/auth.schemas.js';
import { PasswordService } from '../password.service.js';
import { StaffRepository } from '../repositories/staff.repository.js';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_SECONDS = 15 * 60;

/** Staff prove who they are with email + password. Locks the email for 15 min after 5 failures. */
@Injectable()
export class PasswordLoginStrategy implements LoginStrategy<'staff', LoginDto> {
  readonly kind = 'staff' as const;

  constructor(
    private readonly staff: StaffRepository,
    private readonly passwords: PasswordService,
    @Inject(CACHE_SERVICE) private readonly cache: CacheService,
  ) {}

  async authenticate({ email, password }: LoginDto): Promise<StaffPrincipal> {
    const failKey = `auth:login-fail:${email}`;
    if (((await this.cache.get<number>(failKey)) ?? 0) >= MAX_FAILED_LOGINS) {
      throw new HttpException('Too many failed attempts. Try again in 15 minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.staff.findByEmail(email);
    // Always run bcrypt, even when the user doesn't exist, so timing doesn't reveal registered emails
    const passwordOk = await this.passwords.verify(password, user?.passwordHash);

    if (!user || !passwordOk || !user.isActive) {
      await this.cache.increment(failKey, LOCKOUT_SECONDS);
      // Same message for every case — don't reveal which part was wrong
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.cache.del(failKey);
    return { id: user.id, email: user.email, role: user.role, departmentId: user.departmentId };
  }
}
