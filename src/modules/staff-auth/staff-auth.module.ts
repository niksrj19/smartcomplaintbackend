import { Module } from '@nestjs/common';
import { SessionManager } from '../auth-core/session-manager.js';
import { TokenService } from '../auth-core/token.service.js';
import { DepartmentsModule } from '../departments/departments.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService, STAFF_SESSIONS } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { StaffRefreshTokenStore } from './repositories/staff-refresh-token.store.js';
import { StaffRepository } from './repositories/staff.repository.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';
import { PasswordLoginStrategy } from './strategies/password-login.strategy.js';

/** Staff identity: accounts created by admins, email + password login, roles and departments */
@Module({
  imports: [DepartmentsModule],
  controllers: [AuthController, StaffController],
  providers: [
    AuthService,
    StaffService,
    PasswordService,
    PasswordLoginStrategy,
    StaffRepository,
    StaffRefreshTokenStore,
    {
      // The shared session logic, wired to the staff token table and staff loader
      provide: STAFF_SESSIONS,
      inject: [TokenService, StaffRefreshTokenStore, StaffRepository],
      useFactory: (tokens: TokenService, store: StaffRefreshTokenStore, staff: StaffRepository) =>
        new SessionManager('staff', tokens, store, async (id) => {
          const u = await staff.findById(id);
          return u?.isActive ? { id: u.id, email: u.email, role: u.role, departmentId: u.departmentId } : null;
        }),
    },
  ],
})
export class StaffAuthModule {}
