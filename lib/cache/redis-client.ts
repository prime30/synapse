/**
 * Upstash Redis client singleton -- EPIC D
 *
 * Uses @upstash/redis which communicates over HTTP (fetch),
 * making it fully compatible with Vercel serverless (no TCP pooling needed).
 *
 * Falls back gracefully when UPSTASH_REDIS_REST_URL is not set.
 */

import { Redis } from '@upstash/redis';

// -- Singleton ----------------------------------------------------------------

let _redis: Redis | null = null;

/**
 * Returns true if Upstash Redis environment variables are configured.
 */
export function isRedisAvailable(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

/**
 * Get the Upstash Redis singleton.
 *
 * Throws if Redis is not configured.  Callers should check
 * isRedisAvailable() first, or use the CacheAdapter factory
 * which handles fallback automatically.
 */
export function getRedisClient(): Redis {
  if (_redis) return _redis;

  if (!isRedisAvailable()) {
    throw new Error(
      'Redis not configured: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN'
    );
  }

  _redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    retry: {
      retries: 2,
      backoff: (retryCount: number) => Math.min(100 * 2 ** retryCount, 2000),
    },
  });

  return _redis;
}

/**
 * Replace the Redis singleton (useful for tests).
 */
export function setRedisClient(redis: Redis | null): void {
  _redis = redis;
}