import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { checkIdempotency } from '@/lib/middleware/idempotency';
import { validateBody } from '@/lib/middleware/validation';
import { checkRateLimit } from '@/lib/middleware/rate-limit';
import { checkUsageAllowance } from '@/lib/billing/usage-guard';
import { recordUsageBatch } from '@/lib/billing/usage-recorder';
import { AIProviderError, formatSSEError, formatSSEDone } from '@/lib/ai/errors';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { loadProjectFiles } from '@/lib/supabase/file-loader';
import { formatMemoryForPrompt, filterActiveMemories, rowToMemoryEntry, type MemoryRow } from '@/lib/ai/developer-memory';
import { buildDiagnosticContext } from '@/lib/agents/diagnostic-context';
import type { UserPreference } from '@/lib/types/agent';
import { streamV2 } from '@/lib/agents/coordinator-v2';
import type { V2CoordinatorOptions } from '@/lib/agents/coordinator-v2';
import { trimHistory } from '@/lib/ai/history-window';
import { isCircuitOpen } from '@/lib/ai/circuit-breaker';
import { MODELS, getProviderForModel } from '@/lib/agents/model-router';
import { AgentCoordinator } from '@/lib/agents/coordinator';
import type { ThinkingEvent, AgentToolEvent } from '@/lib/agents/coordinator';
import { startTrace } from '@/lib/observability/tracer';
import { incrementCounter, recordHistogram } from '@/lib/observability/metrics';
import { createModuleLogger } from '@/lib/observability/logger';

export const maxDuration = 300;

const streamLog = createModuleLogger('agents/stream-v2');

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
} as const;

const streamSchema = z.object({
  projectId: z.string().uuid(),
  request: z.string().min(1, 'Request is required'),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
  model: z.string().optional(),
  domContext: z.string().optional(),
  intentMode: z.enum(['code', 'ask', 'plan', 'debug']).optional(),
  activeFilePath: z.string().optional(),
  explicitFiles: z.array(z.string()).optional(),
  openTabs: z.array(z.string()).optional(),
  elementHint: z.object({
    sectionId: z.string().optional(),
    sectionType: z.string().optional(),
    blockId: z.string().optional(),
    elementId: z.string().optional(),
    cssClasses: z.array(z.string()).optional(),
    selector: z.string().optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  const tracer = startTrace();
  const requestStart = Date.now();

  try {
    // ── Auth ──────────────────────────────────────────────────────────
    let userId: string;
    try {
      userId = await requireAuth(req);
      tracer.setContext(userId, null);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Idempotency check (EPIC 3a) ──────────────────────────────────
    const idempotencyCheck = await checkIdempotency(req);
    if (idempotencyCheck.isDuplicate) return idempotencyCheck.cachedResponse;

    // ── Validation ───────────────────────────────────────────────────
    let body: z.infer<typeof streamSchema>;
    try {
      body = await validateBody(streamSchema)(req);
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // ── Rate limiting ────────────────────────────────────────────────
    const rateCheck = await checkRateLimit(req);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // ── Usage guard ──────────────────────────────────────────────────
    let usageCheck: Awaited<ReturnType<typeof checkUsageAllowance>>;
    try {
      usageCheck = await checkUsageAllowance(userId);
    } catch {
      usageCheck = {
        allowed: true,
        isIncluded: true,
        currentCount: 0,
        organizationId: '',
        plan: 'starter',
        isByok: false,
      };
    }
    if (!usageCheck.allowed) {
      return NextResponse.json(
        { error: 'usage_limit', message: usageCheck.reason, upgradeUrl: '/account/billing' },
        { status: 402 },
      );
    }

    const executionId = crypto.randomUUID();
    const orgId = usageCheck.organizationId || null;
    const encoder = new TextEncoder();

    // ── Circuit breaker + model fallback chain (EPIC 3b) ─────────────
    const userModel = body.model || MODELS.CLAUDE_SONNET;
    let fallbackChain = [
      userModel,
      MODELS.CLAUDE_SONNET,
      MODELS.CLAUDE_HAIKU,
      MODELS.GEMINI_3_FLASH,
      MODELS.GEMINI_3_PRO,
    ].filter((m, i, arr) => arr.indexOf(m) === i);

    const circuitChecks = await Promise.all(
      fallbackChain.map(async (m) => ({
        model: m,
        open: await isCircuitOpen(getProviderForModel(m)),
      })),
    );
    const healthyModels = circuitChecks.filter((c) => !c.open).map((c) => c.model);
    if (healthyModels.length > 0) {
      fallbackChain = healthyModels;
    }

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (text: string) => {
          try { controller.enqueue(encoder.encode(text)); } catch { /* stream closed */ }
        };
        const emitEvent = (event: Record<string, unknown>) => {
          emit(`data: ${JSON.stringify(event)}\n\n`);
        };

        // ── Heartbeat keepalive (EPIC 3c) ────────────────────────────
        const heartbeatId = setInterval(() => {
          try {
            emitEvent({ type: 'thinking', phase: 'analyzing', label: 'Still working...' });
          } catch { /* stream closed */ }
        }, 45_000);

        try {
          emitEvent({ type: 'thinking', phase: 'analyzing', label: 'Loading project files...' });

          const supabase = await createClient();
          const serviceClient = createServiceClient();

          const [fileResult, prefResult, memoryContext] = await Promise.all([
            loadProjectFiles(body.projectId, serviceClient),
            serviceClient
              .from('user_preferences')
              .select('id, user_id, category, key, value, file_type, confidence, first_observed, last_reinforced, observation_count, metadata, created_at, updated_at')
              .eq('user_id', userId)
              .then((r) => (r.data ?? []) as UserPreference[]),
            (async () => {
              try {
                const { data: memoryRows } = await supabase
                  .from('developer_memory')
                  .select('id, project_id, user_id, type, content, confidence, feedback, created_at, updated_at')
                  .eq('project_id', body.projectId)
                  .eq('user_id', userId);
                if (memoryRows?.length) {
                  const entries = (memoryRows as MemoryRow[]).map(rowToMemoryEntry);
                  return formatMemoryForPrompt(filterActiveMemories(entries));
                }
              } catch { /* developer_memory table may not exist yet */ }
              return '';
            })(),
          ]);

          const { allFiles: fileContexts, loadContent } = fileResult;

          let diagnosticContext = '';
          try {
            diagnosticContext = buildDiagnosticContext(fileContexts).formatted;
          } catch { /* never block agent execution */ }

          emitEvent({
            type: 'thinking',
            phase: 'analyzing',
            label: 'Context ready',
            detail: `${fileContexts.length} files, ${prefResult.length} prefs`,
          });

          const trimmed = trimHistory(
            body.history.map((h) => ({ role: h.role, content: h.content })),
          );
          const recentMessages = trimmed.messages.map((m) => m.content);

          const coordinatorOptions: V2CoordinatorOptions = {
            intentMode: body.intentMode ?? 'code',
            model: fallbackChain[0],
            domContext: body.domContext,
            memoryContext,
            diagnosticContext,
            activeFilePath: body.activeFilePath,
            openTabs: body.openTabs,
            recentMessages,
            loadContent,
            elementHint: body.elementHint,
            onProgress: (event) => emitEvent(event),
            onContentChunk: (chunk) => emit(chunk),
            onToolEvent: (event) => emitEvent(event),
            onReasoningChunk: (agent, chunk) => {
              emitEvent({ type: 'reasoning', agent, text: chunk });
            },
          };

          let result = await streamV2(
            executionId,
            body.projectId,
            userId,
            body.request,
            fileContexts,
            prefResult,
            coordinatorOptions,
          );

          // ── Model fallback on MODEL_UNAVAILABLE or RATE_LIMITED (EPIC 3b) ──────────
          const modelFallbackCodes = ['MODEL_UNAVAILABLE', 'RATE_LIMITED'] as const;
          const fallbackCode = !result.success && result.error?.code && modelFallbackCodes.includes(result.error.code as (typeof modelFallbackCodes)[number])
            ? (result.error.code as (typeof modelFallbackCodes)[number])
            : null;
          if (fallbackCode) {
            for (let fi = 1; fi < fallbackChain.length; fi++) {
              const fallbackModel = fallbackChain[fi];
              emitEvent({
                type: 'thinking',
                phase: 'analyzing',
                label: fallbackCode === 'RATE_LIMITED'
                  ? `Rate limited — trying ${fallbackModel}`
                  : `Model unavailable — trying ${fallbackModel}`,
              });
              const retryOpts = { ...coordinatorOptions, model: fallbackModel };
              result = await streamV2(
                executionId + `-fb${fi}`,
                body.projectId,
                userId,
                body.request,
                fileContexts,
                prefResult,
                retryOpts,
              );
              if (result.success || !result.error?.code || !modelFallbackCodes.includes(result.error.code as (typeof modelFallbackCodes)[number])) break;
            }
          }

          // ── CONTEXT_TOO_LARGE auto-retry (EPIC 3d) ─────────────────
          if (!result.success && result.error?.code === 'CONTEXT_TOO_LARGE') {
            emitEvent({
              type: 'thinking',
              phase: 'analyzing',
              label: 'Reducing context and retrying...',
            });
            const reducedOpts = {
              ...coordinatorOptions,
              openTabs: (body.openTabs ?? []).slice(0, 3),
            };
            result = await streamV2(
              executionId + '-retry',
              body.projectId,
              userId,
              body.request,
              fileContexts,
              prefResult,
              reducedOpts,
            );
          }

          // ── Graceful degradation to v1 (EPIC 3f) ───────────────────
          if (
            !result.success &&
            result.error?.code !== 'MODEL_UNAVAILABLE' &&
            result.error?.code !== 'CONTEXT_TOO_LARGE'
          ) {
            try {
              emitEvent({
                type: 'thinking',
                phase: 'analyzing',
                label: 'Falling back to standard pipeline...',
              });
              const v1Coordinator = new AgentCoordinator();
              result = await v1Coordinator.streamAgentLoop(
                executionId + '-v1fb',
                body.projectId,
                userId,
                body.request,
                fileContexts,
                prefResult,
                {
                  intentMode: body.intentMode ?? 'code',
                  model: body.model,
                  domContext: body.domContext,
                  memoryContext,
                  diagnosticContext,
                  activeFilePath: body.activeFilePath,
                  openTabs: body.openTabs,
                  recentMessages,
                  loadContent,
                  elementHint: body.elementHint,
                  onProgress: (event: ThinkingEvent) => emitEvent(event as unknown as Record<string, unknown>),
                  onContentChunk: (chunk: string) => emit(chunk),
                  onToolEvent: (event: AgentToolEvent) => emitEvent(event as unknown as Record<string, unknown>),
                  onReasoningChunk: (agent: string, chunk: string) => {
                    emitEvent({ type: 'reasoning', agent, text: chunk });
                  },
                },
              );
            } catch (v1Err) {
              console.error('[V2 Stream] v1 fallback also failed:', v1Err);
            }
          }

          // ── Token usage recording (EPIC 1c) ────────────────────────
          if (orgId && result.usage) {
            const capturedOrgId = orgId;
            recordUsageBatch([{
              organizationId: capturedOrgId,
              userId,
              projectId: body.projectId,
              executionId,
              provider: result.usage.provider,
              model: result.usage.model,
              inputTokens: result.usage.totalInputTokens,
              outputTokens: result.usage.totalOutputTokens,
              isByok: usageCheck.isByok,
              isIncluded: usageCheck.isIncluded,
              requestType: 'agent' as const,
            }]).catch((err) =>
              console.error('[V2 Stream] usage recording failed:', err),
            );
          }

          emitEvent({
            type: 'context_stats',
            loadedFiles: fileContexts.filter((f) => !f.content.startsWith('[')).length,
            totalFiles: fileContexts.length,
          });

          emit(formatSSEDone());
        } catch (error) {
          console.error('[V2 Stream] Error:', error);
          if (error instanceof AIProviderError) {
            emit(formatSSEError(error));
          } else {
            emit(formatSSEError(
              new AIProviderError('UNKNOWN', String(error), 'v2-coordinator'),
            ));
          }
        } finally {
          clearInterval(heartbeatId);
          try { controller.close(); } catch { /* already closed */ }
        }
      },
    });

    // ── Observability (EPIC 3e) ──────────────────────────────────────
    incrementCounter('agent.v2.requests').catch(() => {});
    recordHistogram('agent.latency_ms', Date.now() - requestStart).catch(() => {});
    tracer.endTrace().catch(() => {});
    streamLog.info(
      { traceId: tracer.traceId, durationMs: Date.now() - requestStart },
      'V2 stream started',
    );

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error) {
    incrementCounter('agent.v2.errors').catch(() => {});
    tracer.endTrace().catch(() => {});
    streamLog.error(
      { traceId: tracer.traceId, error: error instanceof Error ? error.message : String(error) },
      'V2 stream failed',
    );
    console.error('[V2 Stream] unhandled pre-stream error:', error);
    const sseError = error instanceof AIProviderError
      ? error
      : new AIProviderError('UNKNOWN', String(error), 'server');
    const errorStream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue(formatSSEError(sseError));
        controller.close();
      },
    });
    return new Response(errorStream, { headers: SSE_HEADERS });
  }
}
