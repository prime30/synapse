import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { getAIProvider } from '@/lib/ai/get-provider';
import { MODELS } from '@/lib/agents/model-router';
import type { AIProvider } from '@/lib/ai/types';

interface ProviderStatus {
  configured: boolean;
  status: 'ok' | 'error' | 'skipped';
  model: string | null;
  latencyMs: number | null;
  error: string | null;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  providers: Record<string, ProviderStatus>;
  timestamp: string;
}

/** Cheapest model per provider, used for the health ping. */
const HEALTH_MODELS: Record<string, { provider: AIProvider; model: string; envKey: string }> = {
  anthropic: {
    provider: 'anthropic',
    model: MODELS.CLAUDE_HAIKU,
    envKey: 'ANTHROPIC_API_KEY',
  },
  openai: {
    provider: 'openai',
    model: MODELS.GPT_4O_MINI,
    envKey: 'OPENAI_API_KEY',
  },
  google: {
    provider: 'google',
    model: MODELS.GEMINI_FLASH,
    envKey: 'GOOGLE_AI_API_KEY',
  },
};

const TIMEOUT_MS = 5_000;

/**
 * GET /api/agents/health
 *
 * Tests each configured AI provider with a minimal completion call
 * and returns the overall health status plus per-provider details.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const providerResults: Record<string, ProviderStatus> = {};

  const checks = Object.entries(HEALTH_MODELS).map(
    async ([name, { provider: providerName, model, envKey }]) => {
      const apiKey = process.env[envKey];

      if (!apiKey) {
        providerResults[name] = {
          configured: false,
          status: 'skipped',
          model: null,
          latencyMs: null,
          error: null,
        };
        return;
      }

      const start = Date.now();
      try {
        const provider = getAIProvider(providerName);

        // Race between the actual completion and a timeout
        const result = await Promise.race([
          provider.complete(
            [
              { role: 'system', content: 'Say hi' },
              { role: 'user', content: 'Hi' },
            ],
            { model, maxTokens: 5 },
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS),
          ),
        ]);

        const latency = Date.now() - start;

        providerResults[name] = {
          configured: true,
          status: result ? 'ok' : 'error',
          model,
          latencyMs: latency,
          error: null,
        };
      } catch (err) {
        const latency = Date.now() - start;
        providerResults[name] = {
          configured: true,
          status: 'error',
          model,
          latencyMs: latency,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  // Run all provider checks in parallel
  await Promise.allSettled(checks);

  // Determine overall status
  const configuredProviders = Object.values(providerResults).filter((p) => p.configured);
  const okCount = configuredProviders.filter((p) => p.status === 'ok').length;

  let overallStatus: HealthResponse['status'];
  if (configuredProviders.length === 0) {
    overallStatus = 'down';
  } else if (okCount === configuredProviders.length) {
    overallStatus = 'ok';
  } else if (okCount === 0) {
    overallStatus = 'down';
  } else {
    overallStatus = 'degraded';
  }

  const response: HealthResponse = {
    status: overallStatus,
    providers: providerResults,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(response);
}
