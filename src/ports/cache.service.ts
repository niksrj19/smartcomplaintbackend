export const CACHE_SERVICE = Symbol('CACHE_SERVICE');

export interface CacheService {
  readonly name: string;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Atomic counter — used for rate limiting. TTL is set when the key is first created. */
  increment(key: string, ttlSeconds?: number): Promise<number>;
}
