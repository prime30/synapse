import { createNamespacedCache, type CacheAdapter } from '@/lib/cache/cache-adapter';
import type { AIErrorCode } from '@/lib/ai/errors';

// Errors that indicate provider infrastructure is down
const CIRCUIT_OPENING_ERRORS: Set<string> = new Set([
  'NETWORK_ERROR',
  'PROVIDER_ERROR',
  'TIMEOUT',
]);

interface CircuitState {
  status: 'closed' | 'open' | 'half_open';
  failures: number;
  lastFailureAt: number;
  lastSuccessAt: number;
  openedAt: number;
}

const DEFAULT_STATE: CircuitState = {
  status: 'closed',
  failures: 0,
  lastFailureAt: 0,
  lastSuccessAt: 0,
  openedAt: 0,
};

const FAILURE_THRESHOLD = 5;
const RESET_TIMEOUT_MS = 60000; // 60s cooldown before half-open
const STATE_TTL_MS = 5 * 60 * 1000; // 5 min TTL in Redis
const PROBE_LOCK_TTL_MS = 10000; // 10s lock for half-open probe

function stateKey(provider: string): string {
  return 'state:' + provider;
}

function probeLockKey(provider: string): string {
  return 'probe:' + provider;
}

let cache: CacheAdapter | null = null;

function getCache(): CacheAdapter {
  if (!cache) {
    cache = createNamespacedCache('cb');
  }
  return cache;
}

export function shouldOpenCircuit(errorCode: string): boolean {
  return CIRCUIT_OPENING_ERRORS.has(errorCode);
}

export async function getCircuitState(provider: string): Promise<CircuitState> {
  const c = getCache();
  const state = await c.get<CircuitState>(stateKey(provider));
  if (!state) return { ...DEFAULT_STATE };

  // Check if open circuit has cooled down -> half_open
  if (state.status === 'open') {
    const elapsed = Date.now() - state.openedAt;
    if (elapsed >= RESET_TIMEOUT_MS) {
      return { ...state, status: 'half_open' };
    }
  }
  return state;
}

export async function isCircuitOpen(provider: string): Promise<boolean> {
  const state = await getCircuitState(provider);
  return state.status === 'open';
}

export async function canMakeRequest(provider: string): Promise<'allowed' | 'blocked' | 'probe'> {
  const state = await getCircuitState(provider);

  if (state.status === 'closed') return 'allowed';

  if (state.status === 'half_open') {
    // Try to acquire probe lock via SETNX-like behavior
    const c = getCache();
    const existing = await c.get<string>(probeLockKey(provider));
    if (existing) {
      return 'blocked'; // Another request is already probing
    }
    await c.set(probeLockKey(provider), 'locked', PROBE_LOCK_TTL_MS);
    return 'probe';
  }

  return 'blocked'; // OPEN state
}

export async function recordSuccess(provider: string): Promise<void> {
  const c = getCache();
  const newState: CircuitState = {
    status: 'closed',
    failures: 0,
    lastSuccessAt: Date.now(),
    lastFailureAt: 0,
    openedAt: 0,
  };
  await c.set(stateKey(provider), newState, STATE_TTL_MS);
  // Clear probe lock if exists
  await c.delete(probeLockKey(provider));
}

export async function recordFailure(provider: string, errorCode: string): Promise<void> {
  if (!shouldOpenCircuit(errorCode)) return; // Only circuit-opening errors count

  const c = getCache();
  const state = await getCircuitState(provider);
  const newFailures = state.failures + 1;

  if (state.status === 'half_open') {
    // Probe failed -> reopen
    const newState: CircuitState = {
      status: 'open',
      failures: newFailures,
      lastFailureAt: Date.now(),
      lastSuccessAt: state.lastSuccessAt,
      openedAt: Date.now(),
    };
    await c.set(stateKey(provider), newState, STATE_TTL_MS);
    await c.delete(probeLockKey(provider));
    console.warn('[CircuitBreaker] ' + provider + ' circuit REOPENED after probe failure');
    return;
  }

  if (newFailures >= FAILURE_THRESHOLD) {
    // Open the circuit
    const newState: CircuitState = {
      status: 'open',
      failures: newFailures,
      lastFailureAt: Date.now(),
      lastSuccessAt: state.lastSuccessAt,
      openedAt: Date.now(),
    };
    await c.set(stateKey(provider), newState, STATE_TTL_MS);
    console.warn('[CircuitBreaker] ' + provider + ' circuit OPENED after ' + newFailures + ' failures');
  } else {
    // Increment failure count
    const newState: CircuitState = {
      ...state,
      failures: newFailures,
      lastFailureAt: Date.now(),
    };
    await c.set(stateKey(provider), newState, STATE_TTL_MS);
  }
}

export async function areAllProvidersDown(): Promise<boolean> {
  const providers = ['anthropic', 'openai', 'google'];
  const states = await Promise.all(providers.map(function(p) { return getCircuitState(p); }));
  return states.every(function(s) { return s.status === 'open'; });
}

/** Get status of all providers (for UI) */
export async function getProviderStatuses(): Promise<Record<string, 'available' | 'unavailable' | 'degraded'>> {
  const providers = ['anthropic', 'openai', 'google'];
  const result: Record<string, 'available' | 'unavailable' | 'degraded'> = {};
  const states = await Promise.all(providers.map(function(p) { return getCircuitState(p); }));
  for (let i = 0; i < providers.length; i++) {
    const s = states[i];
    if (s.status === 'open') {
      result[providers[i]] = 'unavailable';
    } else if (s.status === 'half_open') {
      result[providers[i]] = 'degraded';
    } else {
      result[providers[i]] = 'available';
    }
  }
  return result;
}
