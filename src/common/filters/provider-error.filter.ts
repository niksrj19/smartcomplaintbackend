import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ProviderError } from '../errors/provider.error.js';

/**
 * When Groq, Gemini, Redis, Kafka or R2 fails, the client gets a clean 503
 * instead of a 500 with vendor details. The full error is logged server-side.
 */
@Catch(ProviderError)
export class ProviderErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProviderErrorFilter.name);

  catch(error: ProviderError, host: ArgumentsHost): void {
    this.logger.error(error.message);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.SERVICE_UNAVAILABLE)
      .json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'A required service is temporarily unavailable. Please try again shortly.',
        provider: error.provider,
      });
  }
}
