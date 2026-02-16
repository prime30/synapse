/**
 * Metrics aggregator via Redis -- EPIC B
 *
 * Counters stored in CacheAdapter with TTL-based bucketing.
 */

import { createNamespacedCache, type CacheAdapter } from '@/lib/cache/cache-adapter';

export interface MetricsSummary {
  'agent.requests': number;
  'agent.errors': number;
  'agent.tokens': number;
  'agent.latency_ms_sum': number;
  'agent.latency_ms_count': number;
  'cache.hits': number;
  'cache.misses': number;
  'agent.verification.pass': number;
  'agent.verification.fail': number;
}

const METRICS_TTL_MS = 5 * 60 * 1000;

let metricsCache: CacheAdapter | null = null;

function getMetricsCache(): CacheAdapter {
  if (!metricsCache) metricsCache = createNamespacedCache('metrics');
  return metricsCache;
}

export async function incrementCounter(name: string, amount = 1): Promise<void> {
  const cache = getMetricsCache();
  const current = (await cache.get<number>(name)) ?? 0;
  await cache.set(name, current + amount, METRICS_TTL_MS);
}

export async function recordHistogram(namePrefix: string, value: number): Promise<void> {
  const cache = getMetricsCache();
  const sumKey = namePrefix + '_sum';
  const countKey = namePrefix + '_count';
  const currentSum = (await cache.get<number>(sumKey)) ?? 0;
  const currentCount = (await cache.get<number>(countKey)) ?? 0;
  await cache.set(sumKey, currentSum + value, METRICS_TTL_MS);
  await cache.set(countKey, currentCount + 1, METRICS_TTL_MS);
}

export async function getMetrics(): Promise<MetricsSummary> {
  const cache = getMetricsCache();
  const keys: Array<keyof MetricsSummary> = [
    'agent.requests', 'agent.errors', 'agent.tokens',
    'agent.latency_ms_sum', 'agent.latency_ms_count',
    'cache.hits', 'cache.misses',
    'agent.verification.pass', 'agent.verification.fail',
  ];
  const result: Record<string, number> = {};
  for (const key of keys) result[key] = (await cache.get<number>(key)) ?? 0;
  return result as unknown as MetricsSummary;
}

export async function getAverageLatency(): Promise<number> {
  const cache = getMetricsCache();
  const sum = (await cache.get<number>('agent.latency_ms_sum')) ?? 0;
  const count = (await cache.get<number>('agent.latency_ms_count')) ?? 0;
  return count > 0 ? sum / count : 0;
}