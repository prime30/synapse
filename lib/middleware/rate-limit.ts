/**
 * Rate limiter -- EPIC D
 *
 * Uses the CacheAdapter for distributed rate limiting (Upstash Redis in prod,
 * in-memory Map in dev).  Returns a result object instead of throwing, and
 * provides a helper to set X-RateLimit-* response headers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createNamespacedCache } from '@/lib/cache/cache-adapter';

// -- Types --------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

// -- Defaults -----------------------------------------------------------------

const DEFAULT_OPTIONS: RateLimitOptions = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,      // 60 requests per minute
};

// Namespaced cache: all keys prefixed with "synapse:ratelimit:"
const cache = createNamespacedCache('ratelimit');

// -- Core ---------------------------------------------------------------------

/**
 * Check whether the request is within its rate limit.
 *
 * Identifier priority:
 * 1. Authenticated user ID (x-supabase-auth header)
 * 2. Forwarded IP (x-forwarded-for)
 * 3. Real IP (x-real-ip)
 * 4. "unknown"
 */
export async function checkRateLimit(
  request: NextRequest,
  options: RateLimitOptions = DEFAULT_OPTIONS,
): Promise<RateLimitResult> {
  const identifier =
    request.headers.get('x-supabase-auth') ??
    request.headers.get('x-forwarded-for') ??
    request.headers.get('x-real-ip') ??
    'unknown';

  const key = `${identifier}:${request.nextUrl.pathname}`;
  const now = Date.now();

  try {
    const entry = await cache.get<RateLimitEntry>(key);

    if (!entry || now > entry.resetAt) {
      // New window
      const newEntry: RateLimitEntry = { count: 1, resetAt: now + options.windowMs };
      await cache.set(key, newEntry, options.windowMs);
      return {
        allowed: true,
        limit: options.maxRequests,
        remaining: options.maxRequests - 1,
        resetAt: newEntry.resetAt,
      };
    }

    // Increment within existing window
    const updated: RateLimitEntry = { count: entry.count + 1, resetAt: entry.resetAt };
    const remainingTtl = entry.resetAt - now;
    await cache.set(key, updated, remainingTtl > 0 ? remainingTtl : options.windowMs);

    const remaining = Math.max(0, options.maxRequests - updated.count);

    return {
      allowed: updated.count <= options.maxRequests,
      limit: options.maxRequests,
      remaining,
      resetAt: entry.resetAt,
    };
  } catch {
    // Fail-open: if cache is unavailable, allow the request
    return {
      allowed: true,
      limit: options.maxRequests,
      remaining: options.maxRequests,
      resetAt: now + options.windowMs,
    };
  }
}

// -- Headers helper -----------------------------------------------------------

/**
 * Set standard X-RateLimit-* headers on a response.
 */
export function setRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult,
): void {
  response.headers.set('X-RateLimit-Limit', String(result.limit));
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  response.headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
}
