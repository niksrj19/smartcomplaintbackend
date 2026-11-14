import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { CACHE_SERVICE, type CacheService } from '../../ports/cache.service.js';

export interface RateLimitRule {
  /** e.g. "upload-url" — groups the counter */
  name: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Fixed-window rate limiter on top of the cache port (Redis in prod, memory in tests).
 * Reused by storage now and the chat endpoint later.
 */
@Injectable()
export class RateLimitService {
  constructor(@Inject(CACHE_SERVICE) private readonly cache: CacheService) {}

  /** Counts one request for `identity` (usually the IP). Throws 429 when over the limit. */
  async consume(rule: RateLimitRule, identity: string): Promise<void> {
    const count = await this.cache.increment(`ratelimit:${rule.name}:${identity}`, rule.windowSeconds);
    if (count > rule.limit) {
      throw new HttpException(
        `Too many requests. Please wait a while and try again.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
