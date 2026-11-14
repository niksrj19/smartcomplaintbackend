import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { StaffPrincipal } from '../auth-core/auth-core.types.js';
import { CurrentUser, Public } from '../auth-core/decorators/auth.decorators.js';
import { RefreshCookie } from '../auth-core/refresh-cookie.js';
import { AuthService } from './auth.service.js';
import { type LoginDto, type LoginResponse, type StaffResponse, loginSchema } from './dto/auth.schemas.js';

/** Staff login: access token in the body (frontend keeps it in memory), refresh token in an httpOnly cookie */
@Controller('auth')
export class AuthController {
  private readonly cookie: RefreshCookie;

  constructor(
    private readonly auth: AuthService,
    config: AppConfigService,
  ) {
    this.cookie = new RefreshCookie('staff', config.app.isProduction);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt, user } = await this.auth.login(dto);
    this.cookie.set(res, refreshToken, refreshTokenExpiresAt);
    return { accessToken, accessTokenExpiresAt, user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; accessTokenExpiresAt: Date }> {
    try {
      const issued = await this.auth.refresh(this.cookie.read(req));
      this.cookie.set(res, issued.refreshToken, issued.refreshTokenExpiresAt);
      return { accessToken: issued.accessToken, accessTokenExpiresAt: issued.accessTokenExpiresAt };
    } catch (err) {
      this.cookie.clear(res);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(this.cookie.read(req));
    this.cookie.clear(res);
  }

  @Get('me')
  me(@CurrentUser() user: StaffPrincipal): Promise<StaffResponse> {
    return this.auth.me(user.id);
  }
}
