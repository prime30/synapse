/**
 * Idempotency middleware (Fix 3: System Design Hardening).
 *
 * Function-based pattern matching requireAuth() style.
 * Uses Redis SETNX + SHA-256 body hash for duplicate detection.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createNamespacedCache, type CacheAdapter } from '@/lib/cache/cache-adapter';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const HEADER_NAME = 'idempotency-key';

interface IdempotencyRecord {
  bodyHash: string;
  status: 'processing' | 'done';
  createdAt: number;
}

interface CachedResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

let _cache: CacheAdapter | null = null;

function getCache(): CacheAdapter {
  if (!_cache) {
    _cache = createNamespacedCache('idem');
  }
  return _cache;
}

function recordKey(key: string): string {
  return key + ':record';
}

function responseKey(key: string): string {
  return key + ':response';
}

async function hashBody(body: string): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(body);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(function(b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }
  // Fallback: simple hash for environments without crypto.subtle
  let hash = 0;
  for (let i = 0; i < body.length; i++) {
    const char = body.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return 'fallback-' + Math.abs(hash).toString(16);
}

/**
 * Check if a request is a duplicate based on Idempotency-Key header.
 * Call at the START of your route handler.
 *
 * Returns:
 * - { isDuplicate: false } — proceed with handler
 * - { isDuplicate: true, cachedResponse } — return the cached response
 * - Throws 409 if key reused with different body or request is still processing
 */
export async function checkIdempotency(
  request: NextRequest,
  options?: { ttlMs?: number }
): Promise<{ isDuplicate: false } | { isDuplicate: true; cachedResponse: NextResponse }> {
  const key = request.headers.get(HEADER_NAME);
  if (!key) {
    return { isDuplicate: false }; // No idempotency key — pass through
  }

  const ttl = options?.ttlMs ?? DEFAULT_TTL_MS;
  const cache = getCache();

  // Read request body and compute hash
  const bodyText = await request.clone().text();
  const bodyH = await hashBody(bodyText);

  // Try to claim the key (SETNX-like: only set if not exists)
  const existing = await cache.get<IdempotencyRecord>(recordKey(key));

  if (existing === null) {
    // Key doesn't exist — claim it
    const record: IdempotencyRecord = {
      bodyHash: bodyH,
      status: 'processing',
      createdAt: Date.now(),
    };
    await cache.set(recordKey(key), record, ttl);
    return { isDuplicate: false };
  }

  // Key exists — check body hash
  if (existing.bodyHash !== bodyH) {
    // Different request body with same key
    return {
      isDuplicate: true,
      cachedResponse: NextResponse.json(
        { error: 'Idempotency key reused with different request body' },
        { status: 409 }
      ),
    };
  }

  if (existing.status === 'processing') {
    // Same request is still being processed
    return {
      isDuplicate: true,
      cachedResponse: NextResponse.json(
        { error: 'Request is already being processed' },
        { status: 409 }
      ),
    };
  }

  // Status is 'done' — return cached response
  const cached = await cache.get<CachedResponse>(responseKey(key));
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set('x-idempotent-replay', 'true');
    return {
      isDuplicate: true,
      cachedResponse: new NextResponse(cached.body, {
        status: cached.status,
        headers,
      }),
    };
  }

  // Cached response expired but record exists — allow re-execution
  return { isDuplicate: false };
}

/**
 * Record a response for an idempotency key.
 * Call AFTER your route handler completes successfully.
 */
export async function recordIdempotencyResponse(
  request: NextRequest,
  response: NextResponse,
  options?: { ttlMs?: number }
): Promise<void> {
  const key = request.headers.get(HEADER_NAME);
  if (!key) return;

  const ttl = options?.ttlMs ?? DEFAULT_TTL_MS;
  const cache = getCache();
  const bodyText = await request.clone().text();
  const bodyH = await hashBody(bodyText);

  // Update record status to 'done'
  const record: IdempotencyRecord = {
    bodyHash: bodyH,
    status: 'done',
    createdAt: Date.now(),
  };
  await cache.set(recordKey(key), record, ttl);

  // Cache the response
  const responseBody = await response.clone().text();
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach(function(value, headerKey) {
    responseHeaders[headerKey] = value;
  });

  const cached: CachedResponse = {
    status: response.status,
    body: responseBody,
    headers: responseHeaders,
  };
  await cache.set(responseKey(key), cached, ttl);
}
