import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Public } from './modules/auth-core/decorators/auth.decorators.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Health check — public */
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
