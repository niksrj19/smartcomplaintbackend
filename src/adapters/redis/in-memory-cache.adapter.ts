import type { CacheService } from '../../ports/cache.service.js';

/** For tests and for running without Redis (CACHE_PROVIDER=memory). Single-process only. */
export class InMemoryCacheAdapter implements CacheService {
  readonly name = 'memory';
  private readonly store = new Map<string, { value: string; expiresAt?: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value: JSON.stringify(value),
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Atomic like Redis INCR: no await between read and write, so concurrent calls can't interleave */
  async increment(key: string, ttlSeconds?: number): Promise<number> {
    const now = Date.now();
    const entry = this.store.get(key);
    const live = entry && (!entry.expiresAt || entry.expiresAt > now) ? entry : undefined;
    const next = (live ? (JSON.parse(live.value) as number) : 0) + 1;
    this.store.set(key, {
      value: JSON.stringify(next),
      expiresAt: live?.expiresAt ?? (ttlSeconds ? now + ttlSeconds * 1000 : undefined),
    });
    return next;
  }
}
