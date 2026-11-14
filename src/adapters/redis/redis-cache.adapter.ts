import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ProviderError } from '../../common/errors/provider.error.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { CacheService } from '../../ports/cache.service.js';

export class RedisCacheAdapter implements CacheService, OnModuleDestroy {
  readonly name = 'redis';
  private readonly logger = new Logger(RedisCacheAdapter.name);
  private readonly client: Redis;

  constructor(config: AppConfigService) {
    this.client = new Redis(config.redis.url, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });
    this.client.on('connect', () => this.logger.log('Connected to Redis'));
    this.client.on('error', (err: Error) => this.logger.error(`Redis error: ${err.message}`));
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (err) {
      throw new ProviderError(this.name, 'get', err);
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const raw = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.set(key, raw, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, raw);
      }
    } catch (err) {
      throw new ProviderError(this.name, 'set', err);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err) {
      throw new ProviderError(this.name, 'del', err);
    }
  }

  async increment(key: string, ttlSeconds?: number): Promise<number> {
    try {
      const value = await this.client.incr(key);
      if (value === 1 && ttlSeconds) {
        await this.client.expire(key, ttlSeconds);
      }
      return value;
    } catch (err) {
      throw new ProviderError(this.name, 'increment', err);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
