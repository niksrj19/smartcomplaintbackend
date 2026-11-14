import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { ProviderErrorFilter } from './common/filters/provider-error.filter.js';
import { AppConfigService } from './config/app-config.service.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(AppConfigService);

  // In production the API sits behind Caddy (HTTPS). Trust its X-Forwarded-For header so
  // per-IP rate limits see each user's real address instead of the proxy's.
  if (config.app.isProduction) app.set('trust proxy', 1);

  app.use(helmet());
  // The Next.js frontend calls the API from another origin and needs the refresh-token cookie
  app.enableCors({
    origin: config.cors.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ProviderErrorFilter());
  app.enableShutdownHooks();

  await app.listen(config.app.port);
  Logger.log(`Server running on http://localhost:${config.app.port}/api/v1 (${config.app.env})`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  Logger.error(err instanceof Error ? err.message : err, 'Bootstrap');
  process.exit(1);
});
