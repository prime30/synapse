/**
 * Provider health monitor -- EPIC E
 *
 * Tracks request success/failure per provider.
 * Auto-degrades after 3 consecutive failures.
 * Auto-heals after 5 minutes.
 */

interface ProviderHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  consecutiveFailures: number;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  recentResults: boolean[]; // last 10 results (true=success)
}

const CONSECUTIVE_FAILURE_THRESHOLD = 3;
const AUTO_HEAL_MS = 5 * 60 * 1000; // 5 minutes

const healthMap = new Map<string, ProviderHealth>();

function getOrCreate(name: string): ProviderHealth {
  let h = healthMap.get(name);
  if (!h) {
    h = { name, status: 'healthy', consecutiveFailures: 0, lastFailureAt: null, lastSuccessAt: null, recentResults: [] };
    healthMap.set(name, h);
  }
  return h;
}

export function recordSuccess(providerName: string): void {
  const h = getOrCreate(providerName);
  h.consecutiveFailures = 0;
  h.lastSuccessAt = Date.now();
  h.recentResults.push(true);
  if (h.recentResults.length > 10) h.recentResults.shift();
  h.status = 'healthy';
}

export function recordFailure(providerName: string): void {
  const h = getOrCreate(providerName);
  h.consecutiveFailures++;
  h.lastFailureAt = Date.now();
  h.recentResults.push(false);
  if (h.recentResults.length > 10) h.recentResults.shift();
  if (h.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
    h.status = 'down';
  } else if (h.consecutiveFailures >= 1) {
    h.status = 'degraded';
  }
}

export function getHealth(providerName: string): ProviderHealth {
  const h = getOrCreate(providerName);
  // Auto-heal: if provider was down but last failure was > 5 minutes ago
  if (h.status === 'down' && h.lastFailureAt && Date.now() - h.lastFailureAt > AUTO_HEAL_MS) {
    h.status = 'degraded'; // allow one more try
    h.consecutiveFailures = CONSECUTIVE_FAILURE_THRESHOLD - 1;
  }
  return { ...h };
}

export function isHealthy(providerName: string): boolean {
  return getHealth(providerName).status !== 'down';
}

/**
 * Get a healthy provider from a preference list.
 * Returns the first healthy one, or the preferred one if all are down.
 */
export function getHealthyProvider(preferred: string, fallbacks: string[]): string {
  if (isHealthy(preferred)) return preferred;
  for (const fb of fallbacks) {
    if (isHealthy(fb)) return fb;
  }
  return preferred; // all down, try preferred anyway
}

export function getAllHealth(): ProviderHealth[] {
  return Array.from(healthMap.values()).map(h => getHealth(h.name));
}