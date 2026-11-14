import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CitizenPrincipal } from '../auth-core/auth-core.types.js';
import { CitizenAuth, CurrentCitizen, Public } from '../auth-core/decorators/auth.decorators.js';
import { RefreshCookie } from '../auth-core/refresh-cookie.js';
import { CitizenAuthService } from './citizen-auth.service.js';
import {
  type CitizenLoginResponse,
  type CitizenProfileResponse,
  type GoogleLoginDto,
  googleLoginSchema,
} from './dto/citizen-auth.schemas.js';

/** Citizen sign-in with Google. Same token pattern as staff, separate cookie. */
@Controller('auth/citizen')
export class CitizenAuthController {
  private readonly cookie: RefreshCookie;

  constructor(
    private readonly auth: CitizenAuthService,
    private readonly rateLimit: RateLimitService,
    config: AppConfigService,
  ) {
    this.cookie = new RefreshCookie('citizen', config.app.isProduction);
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async google(
    @Ip() ip: string,
    @Body(new ZodValidationPipe(googleLoginSchema)) dto: GoogleLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CitizenLoginResponse> {
    await this.rateLimit.consume({ name: 'citizen-login', limit: 20, windowSeconds: 900 }, ip);
    const { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt, citizen } =
      await this.auth.loginWithGoogle(dto.idToken);
    this.cookie.set(res, refreshToken, refreshTokenExpiresAt);
    return { accessToken, accessTokenExpiresAt, citizen };
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

  @CitizenAuth()
  @Get('me')
  me(@CurrentCitizen() citizen: CitizenPrincipal): Promise<CitizenProfileResponse> {
    return this.auth.me(citizen.id);
  }
}
