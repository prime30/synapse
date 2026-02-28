import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { checkIdempotency } from '@/lib/middleware/idempotency';
import { validateBody } from '@/lib/middleware/validation';
import { checkRateLimit } from '@/lib/middleware/rate-limit';
import { AgentCoordinator, findFilesFromElementHint } from '@/lib/agents/coordinator';
import type { ThinkingEvent, AgentToolEvent } from '@/lib/agents/coordinator';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { loadProjectFiles } from '@/lib/supabase/file-loader';
import { appendConversation, type ConversationTurn } from '@/lib/cache/conversation-history-cache';
import { getAIProvider } from '@/lib/ai/get-provider';
import { buildSummaryMessages, buildThinSummaryMessages } from '@/lib/agents/summary-prompt';
import type { SummaryMode } from '@/lib/agents/summary-prompt';
import { MODELS, getProviderForModel } from '@/lib/agents/model-router';
import { recordUsage, recordUsageBatch } from '@/lib/billing/usage-recorder';
import { checkUsageAllowance } from '@/lib/billing/usage-guard';
import { AIProviderError, formatSSEError, formatSSEDone, getUserMessage } from '@/lib/ai/errors';
import type { AIErrorCode } from '@/lib/ai/errors';
import type { AIAction } from '@/lib/agents/model-router';
import type { HistoryMessage } from '@/lib/agents/summary-prompt';
import type { AIMessage, AIToolProviderInterface } from '@/lib/ai/types';
import { formatMemoryForPrompt, filterActiveMemories, rowToMemoryEntry, type MemoryRow } from '@/lib/ai/developer-memory';
import { ContextEngine } from '@/lib/ai/context-engine';
import { estimateTokens } from '@/lib/ai/token-counter';
import type { FileContext, ElementHint, UserPreference } from '@/lib/types/agent';
import { trimHistory } from '@/lib/ai/history-window';
import { enforceRequestBudget } from '@/lib/ai/request-budget';
import { buildDiagnosticContext } from '@/lib/agents/diagnostic-context';
import { selectToolsForRequest } from '@/lib/agents/tools/definitions';
import { AI_FEATURES } from '@/lib/ai/feature-flags';
import { isCircuitOpen } from '@/lib/ai/circuit-breaker';
import { enqueueAgentJob, pollExecutionProgress, triggerDispatch } from '@/lib/tasks/agent-job-queue';
import { startTrace } from '@/lib/observability/tracer';
import { incrementCounter, recordHistogram } from '@/lib/observability/metrics';
import { createModuleLogger } from '@/lib/observability/logger';

/** Yield to the event loop so timers (e.g. prep heartbeat) can run during long sync work. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const streamSchema = z.object({
  projectId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  request: z.string().min(1, 'Request is required'),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional()
    .default([]),
  action: z.enum([
    'analyze', 'generate', 'review', 'summary', 'fix',
    'explain', 'refactor', 'document', 'plan', 'chat',
  ] as const).optional(),
  model: z.string().optional(),
  mode: z.enum(['orchestrated', 'solo', 'auto']).optional(), // deprecated, kept for backward compat
  subagentCount: z.number().int().min(1).max(4).optional().default(1),
  specialistMode: z.boolean().optional().default(false),
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
  /** EPIC V4: Current clarification round (0 = no prior clarification). */
  clarificationRound: z.number().int().min(0).max(2).optional(),
  /** EPIC V4: Prior clarification Q&A pairs for multi-round dialogue. */
  clarificationHistory: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })).optional(),
  /** Fix 4: If true, enqueue execution as a background job instead of running inline. */
  async: z.boolean().optional(),
});

// Allow up to 5 minutes for streaming responses (Vercel Pro default is 60s)
export const maxDuration = 300;

// ── SSE helpers ─────────────────────────────────────────────────────────

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
} as const;

function formatSSEThinking(event: ThinkingEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Map intentMode to the SummaryMode used by buildSummaryMessages. */
function toSummaryMode(intentMode?: string): SummaryMode {
  switch (intentMode) {
    case 'ask': return 'chat';
    case 'plan': return 'plan';
    case 'debug': return 'fix';
    case 'code':
    default: return 'generate';
  }
}

/** Map intentMode to the AIAction used for model routing. */
function toAction(intentMode?: string): AIAction | undefined {
  switch (intentMode) {
    case 'ask': return 'chat';
    case 'plan': return 'plan';
    case 'debug': return 'fix';
    case 'code': return 'generate';
    default: return undefined;
  }
}

// ── Stream Context Loader ───────────────────────────────────────────────
// Moves heavy setup (file loading, preferences, memory, diagnostics)
// inside the SSE stream so the user gets thinking events immediately.

interface StreamContext {
  fileContexts: FileContext[];
  loadContent: (fileIds: string[]) => Promise<FileContext[]>;
  preferences: UserPreference[];
  memoryContext: string;
  diagnosticContext: string;
}

async function loadStreamContext(
  projectId: string,
  userId: string,
  emit: (event: ThinkingEvent) => void,
): Promise<StreamContext> {
  emit({ type: 'thinking', phase: 'analyzing', label: 'Loading project files…' });

  const supabase = await createClient();
  const serviceClient = createServiceClient();

  // Start all independent queries in parallel for faster context assembly
  const filePromise = loadProjectFiles(projectId, serviceClient);
  const prefPromise = serviceClient
    .from('user_preferences')
    .select('id, user_id, category, key, value, file_type, confidence, first_observed, last_reinforced, observation_count, metadata, created_at, updated_at')
    .eq('user_id', userId)
    .then((r) => (r.data ?? []) as UserPreference[]);
  const memoryPromise = (async () => {
    try {
      const { data: memoryRows } = await supabase
        .from('developer_memory')
        .select('id, project_id, user_id, type, content, confidence, feedback, created_at, updated_at')
        .eq('project_id', projectId)
        .eq('user_id', userId);
      if (memoryRows && memoryRows.length > 0) {
        const entries = (memoryRows as MemoryRow[]).map(rowToMemoryEntry);
        return formatMemoryForPrompt(filterActiveMemories(entries));
      }
    } catch { /* developer_memory table may not exist yet */ }
    return '';
  })();

  // File loading must complete before diagnostic context (depends on fileContexts)
  const { allFiles: fileContexts, loadContent } = await filePromise;

  emit({
    type: 'thinking',
    phase: 'analyzing',
    label: 'Reading preferences & memory…',
    detail: `${fileContexts.length} files indexed`,
  });

  // Preferences + memory may already be resolved; diagnostic context runs immediately
  const [prefResult, memoryContext] = await Promise.all([prefPromise, memoryPromise]);

  let diagnosticContext = '';
  try {
    diagnosticContext = buildDiagnosticContext(fileContexts).formatted;
  } catch { /* never block agent execution */ }

  emit({
    type: 'thinking',
    phase: 'analyzing',
    label: 'Context ready — starting agent…',
    detail: `${fileContexts.length} files, ${prefResult.length} prefs`,
  });

  return { fileContexts, loadContent, preferences: prefResult, memoryContext, diagnosticContext };
}

// ── Ask Mode System Prompt (DEPRECATED — now handled by ASK_MODE_OVERLAY in prompts.ts) ──

function buildAskSystemPrompt(
  fileContexts: Array<{ fileName: string; fileType: string; path?: string }>
): string {
  const fileList = fileContexts
    .slice(0, 60)
    .map((f) => `- ${f.path ?? f.fileName} (${f.fileType})`)
    .join('\n');

  return `You are an AI coding assistant embedded in Synapse, a Shopify theme IDE.
You are in Ask mode — the user wants to ask questions about their code, get explanations, and have a conversation. Do NOT generate code changes or file modifications.

Guidelines:
- Be concise, helpful, and conversational.
- Reference specific file names using backticks.
- Use code examples when explaining concepts.
- If the user asks you to make changes, remind them to switch to Code mode.
- You receive full contents for: files relevant to the request, the user's open editor tabs, and any pinned files. If you need another file that isn't in the contents below, say: "Open that file in the editor and send your message again so I can see it," or "Switch to Code mode so I can read and edit files directly."

Project files in context:
${fileList}${fileContexts.length > 60 ? `\n... and ${fileContexts.length - 60} more files` : ''}`;
}

/**
 * POST /api/agents/stream
 *
 * Runs the agent coordinator (or direct chat for Ask mode), then streams
 * a conversational summary using Server-Sent Events.
 *
 * SSE event types:
 *   - thinking: Real-time progress events from the coordinator
 *   - error:    Structured error events
 *   - done:     Stream completed successfully
 *   - (raw text): Response content chunks
 */
const streamLog = createModuleLogger('agents/stream');

export async function POST(request: NextRequest) {
  const tracer = startTrace();
  const requestStart = Date.now();

  try {
    const userId = await requireAuth(request);
    tracer.setContext(userId, null);
    const idempotencyCheck = await checkIdempotency(request);
    if (idempotencyCheck.isDuplicate) return idempotencyCheck.cachedResponse;

    const rateLimit = await checkRateLimit(request, { windowMs: 60000, maxRequests: 10 });
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'X-RateLimit-Limit': String(rateLimit.limit), 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetAt / 1000)) },
      });
    }

    // ── Usage guard (B4): enforce plan limits before running agents ──
    let usageCheck: Awaited<ReturnType<typeof checkUsageAllowance>>;
    try {
      usageCheck = await checkUsageAllowance(userId);
    } catch {
      // Fail open — billing infrastructure issues should never block agent requests
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
        {
          error: 'usage_limit',
          message: usageCheck.reason,
          upgradeUrl: '/account/billing',
        },
        { status: 402 },
      );
    }

    const body = await validateBody(streamSchema)(request);
    const intentMode = body.intentMode ?? 'code';
    const summaryMode = toSummaryMode(intentMode);
    const executionId = crypto.randomUUID();
    const orgId = usageCheck.organizationId || null;

    // ── Fast path: ASK mode opens the stream and loads context inside ──
    // ── Code/Plan/Debug: open stream immediately, load context inside ──
    // Auth, rate limit, and body validation (above) must return HTTP errors.
    // Everything below (file loading, prefs, memory) moves INSIDE the stream
    // so the user sees thinking events instantly instead of staring at nothing.

    // ══════════════════════════════════════════════════════════════════
    // ALL MODES: Coordinator pipeline with thinking events.
    // Intent mode (ask/code/plan/debug) shapes agent behavior as a
    // prompt-level preference, not a capability gate.
    // ══════════════════════════════════════════════════════════════════

    // Ask mode forces solo (1x) and skips specialist dispatch — it's conversational
    const isAskMode = intentMode === 'ask';

    // Resolve subagent count and specialist mode (backward compat with old mode field)
    // Ask mode always runs solo (1x) — it's conversational, no need for multi-agent
    const subagentCount = isAskMode ? 1 : (body.subagentCount ?? (body.mode === 'solo' ? 1 : undefined) ?? 1);
    const specialistMode = isAskMode ? false : (body.specialistMode ?? (body.mode === 'orchestrated'));
    const isSoloMode = subagentCount === 1;
    const isAutoMode = body.mode === 'auto' || (!body.mode && !body.subagentCount);

    // ══════════════════════════════════════════════════════════════════
    // ASYNC MODE (Fix 4): Enqueue job + poll-loop instead of inline
    // ══════════════════════════════════════════════════════════════════
    if (body.async) {
      const asyncStream = new ReadableStream<string>({
        async start(controller) {
          try {
            controller.enqueue(formatSSEThinking({
              type: 'thinking',
              phase: 'analyzing',
              label: 'Queuing execution...',
            }));

            // Enqueue as a background job
            await enqueueAgentJob({
              executionId,
              projectId: body.projectId,
              userId,
              userRequest: body.request,
              options: {
                action: body.action,
                model: body.model,
                mode: body.mode,
                intentMode,
              },
            });

            // Fire self-dispatch for immediate pickup
            const baseUrl = request.nextUrl.origin;
            triggerDispatch(baseUrl);

            controller.enqueue(formatSSEThinking({
              type: 'thinking',
              phase: 'executing',
              label: 'Execution queued — streaming progress...',
            }));

            // Poll loop: check execution progress every 2s for up to 180s
            const POLL_INTERVAL_MS = 2_000;
            const MAX_POLL_MS = 180_000;
            const pollStart = Date.now();
            let lastStatus = '';

            while (Date.now() - pollStart < MAX_POLL_MS) {
              await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

              const state = await pollExecutionProgress(executionId);
              if (!state) continue;

              // Emit status changes
              if (state.status !== lastStatus) {
                lastStatus = state.status;
                controller.enqueue(formatSSEThinking({
                  type: 'thinking',
                  phase: state.status === 'in_progress' ? 'executing' : 'complete',
                  label: state.status === 'completed' ? 'Execution complete'
                    : state.status === 'failed' ? 'Execution failed'
                    : `Status: ${state.status}`,
                }));
              }

              // Terminal states
              if (state.status === 'completed' || state.status === 'failed') {
                controller.enqueue(formatSSEDone());
                controller.close();
                return;
              }
            }

            // Timeout — execution didn't finish within poll window
            controller.enqueue(formatSSEThinking({
              type: 'thinking',
              phase: 'complete',
              label: 'Execution is still running in the background. Check back shortly.',
            }));
            controller.enqueue(formatSSEDone());
            controller.close();
          } catch (error) {
            const sseError = error instanceof AIProviderError
              ? error
              : new AIProviderError('UNKNOWN', String(error), 'server');
            try {
              controller.enqueue(formatSSEError(sseError));
              controller.close();
            } catch { /* stream closed */ }
          }
        },
      });

      return new Response(asyncStream, { headers: SSE_HEADERS });
    }

    // The stream starts immediately so thinking events can be sent in real time.
    const responseStream = new ReadableStream<string>({
      async start(controller) {
        try {
          const emit = (event: ThinkingEvent) => {
            try { controller.enqueue(formatSSEThinking(event)); } catch { /* stream closed */ }
          };

          // ── Load context inside the stream for instant first chunk ──
          const { fileContexts, loadContent, preferences, memoryContext, diagnosticContext } =
            await loadStreamContext(body.projectId, userId, emit);

          // ── Run coordinator with real-time progress ────────────────
          const coordinator = new AgentCoordinator();
          const action = body.action as AIAction | undefined ?? toAction(intentMode);

          const recentMessages = (body.history ?? []).map((m: { content: string }) => m.content);
          // Plan/code/debug: coordinator merges openTabs + explicitFiles into context.
          const coordinatorOptions = {
            sessionId: body.sessionId,
            action,
            model: body.model,
            mode: body.mode === 'auto' ? undefined : body.mode,
            subagentMode: specialistMode ? 'specialist' as const : 'general' as const,
            maxAgents: subagentCount,
            domContext: body.domContext,
            memoryContext,
            diagnosticContext,
            planOnly: intentMode === 'plan',
            intentMode: intentMode as 'code' | 'ask' | 'plan' | 'debug' | undefined,
            activeFilePath: body.activeFilePath,
            openTabs: body.openTabs,
            recentMessages,
            loadContent,
            elementHint: body.elementHint as ElementHint | undefined,
            autoRoute: isAutoMode,
            clarificationRound: body.clarificationRound,
            clarificationHistory: body.clarificationHistory,
            explicitFiles: body.explicitFiles,
            onProgress: emit,
            onReasoningChunk: (agent: string, chunk: string) => {
              try {
                controller.enqueue(`data: ${JSON.stringify({
                  type: 'reasoning',
                  agent,
                  text: chunk,
                })}\n\n`);
              } catch { /* stream closed */ }
            },
            onContentChunk: (chunk: string) => {
              try { controller.enqueue(chunk); } catch { /* stream closed */ }
            },
            onToolEvent: (event: AgentToolEvent) => {
              try {
                controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
              } catch { /* stream closed */ }
            },
          };

          // Emit context_stats SSE event for accurate ContextMeter in the UI
          try {
            controller.enqueue(`data: ${JSON.stringify({
              type: 'context_stats',
              loadedFiles: 0,
              loadedTokens: 0,
              totalFiles: fileContexts.length,
            })}\n\n`);
          } catch { /* stream closed */ }

          // Execute coordinator with model fallback + auto-retry on CONTEXT_TOO_LARGE
          // Solo non-specialist mode uses the streaming agent loop (Cursor-like architecture)
          const useAgentLoop = isSoloMode && !specialistMode;
          const executeCoordinator = async (opts: typeof coordinatorOptions) => {
            if (useAgentLoop) {
              return coordinator.streamAgentLoop(executionId, body.projectId, userId, body.request, fileContexts, preferences ?? [], opts);
            }
            return isSoloMode
              ? coordinator.executeSolo(executionId, body.projectId, userId, body.request, fileContexts, preferences ?? [], opts)
              : coordinator.execute(executionId, body.projectId, userId, body.request, fileContexts, preferences ?? [], opts);
          };

          // Heartbeat: send a thinking event every 45s so the client never hits the 60s "Taking longer than expected" stall
          const HEARTBEAT_INTERVAL_MS = 45_000;
          const heartbeatId = setInterval(() => {
            try {
              controller.enqueue(formatSSEThinking({
                type: 'thinking',
                phase: 'analyzing',
                label: 'Still working...',
              }));
            } catch { /* stream closed */ }
          }, HEARTBEAT_INTERVAL_MS);

          // ── Circuit breaker: skip providers whose circuit is open ──────
          const coordUserModel = body.model || MODELS.CLAUDE_SONNET;
          let coordFallbackChain = [
            coordUserModel,
            MODELS.CLAUDE_SONNET,
            MODELS.CLAUDE_HAIKU,
            MODELS.GEMINI_3_FLASH,
            MODELS.GEMINI_3_PRO,
          ].filter((m, i, arr) => arr.indexOf(m) === i);

          // Filter out models whose provider circuit is open
          const circuitChecks = await Promise.all(
            coordFallbackChain.map(async (m) => ({
              model: m,
              open: await isCircuitOpen(getProviderForModel(m)),
            }))
          );
          const healthyModels = circuitChecks.filter((c) => !c.open).map((c) => c.model);
          if (healthyModels.length > 0) {
            coordFallbackChain = healthyModels;
          }
          // If all are open, keep the full chain and let them fail-through naturally

          // Tell the UI which model we're starting with
          try {
            controller.enqueue(`data: ${JSON.stringify({ type: 'active_model', model: coordFallbackChain[0] })}\n\n`);
          } catch { /* stream closed */ }

          let result;
          try {
            result = await executeCoordinator(coordinatorOptions);
          } finally {
            clearInterval(heartbeatId);
          }

          // Model fallback: if MODEL_UNAVAILABLE or RATE_LIMITED (e.g. Opus 429), try next model in chain
          const modelFallbackCodes = ['MODEL_UNAVAILABLE', 'RATE_LIMITED'] as const;
          const fallbackCode = !result.success && result.error?.code && modelFallbackCodes.includes(result.error.code as (typeof modelFallbackCodes)[number])
            ? (result.error.code as (typeof modelFallbackCodes)[number])
            : null;
          if (fallbackCode) {
            for (let fi = 1; fi < coordFallbackChain.length; fi++) {
              const fallbackModel = coordFallbackChain[fi];
              // Notify UI of rate limit + model switch
              try {
                controller.enqueue(`data: ${JSON.stringify({
                  type: 'rate_limited',
                  originalModel: coordFallbackChain[0],
                  fallbackModel,
                })}\n\n`);
              } catch { /* stream closed */ }
              controller.enqueue(formatSSEThinking({
                type: 'thinking',
                phase: 'analyzing' as const,
                label: fallbackCode === 'RATE_LIMITED'
                  ? `Rate limited — trying ${fallbackModel}`
                  : `Model unavailable — trying ${fallbackModel}`,
              }));
              const fallbackCoord = new AgentCoordinator();
              const fallbackOpts = { ...coordinatorOptions, model: fallbackModel };
              result = isSoloMode
                ? await fallbackCoord.executeSolo(executionId + `-fb${fi}`, body.projectId, userId, body.request, fileContexts, preferences ?? [], fallbackOpts)
                : await fallbackCoord.execute(executionId + `-fb${fi}`, body.projectId, userId, body.request, fileContexts, preferences ?? [], fallbackOpts);
              if (result.success || !result.error?.code || !modelFallbackCodes.includes(result.error.code as (typeof modelFallbackCodes)[number])) break;
            }
          }

          // Auto-retry with reduced context if CONTEXT_TOO_LARGE
          if (!result.success && result.error?.code === 'CONTEXT_TOO_LARGE') {
            controller.enqueue(formatSSEThinking({
              type: 'thinking',
              phase: 'analyzing' as const,
              label: 'Context too large — retrying with reduced budget',
              detail: 'Reducing file context by 50% and retrying...',
            }));

            // Retry with a fresh coordinator (reset usage tracking)
            const retryCoordinator = new AgentCoordinator();
            // Reduce file budget by halving the open tabs to reduce files loaded
            const retryOptions = {
              ...coordinatorOptions,
              openTabs: (coordinatorOptions.openTabs ?? []).slice(0, 3),
            };

            result = isSoloMode
              ? await retryCoordinator.executeSolo(executionId + '-retry', body.projectId, userId, body.request, fileContexts, preferences ?? [], retryOptions)
              : await retryCoordinator.execute(executionId + '-retry', body.projectId, userId, body.request, fileContexts, preferences ?? [], retryOptions);
          }

          // ── Token usage recording (fire-and-forget) ────────────────
          try {
            if (orgId) {
              const usage = coordinator.getAccumulatedUsage();
              const records = usage.perAgent.map((entry) => ({
                organizationId: orgId,
                userId,
                projectId: body.projectId,
                executionId,
                provider: entry.provider,
                model: entry.model,
                inputTokens: entry.inputTokens,
                outputTokens: entry.outputTokens,
                isByok: usageCheck.isByok,
                isIncluded: usageCheck.isIncluded,
                requestType: entry.agentType === 'review' ? 'review' as const : 'agent' as const,
              }));
              recordUsageBatch(records).catch((err) =>
                console.error('[stream] coordinator usage recording failed:', err),
              );
            }
          } catch (err) {
            console.error('[stream] coordinator usage recording setup failed:', err);
          }

          // ── If coordinator returned an error, send SSE error ────────
          if (!result.success && result.error) {
            const errorCode = (result.error.code ?? 'UNKNOWN') as AIErrorCode;
            const errorMsg = result.error.message || getUserMessage(errorCode);
            const sseError = new AIProviderError(
              errorCode,
              errorMsg,
              result.error.agentType ?? 'coordinator'
            );
            controller.enqueue(formatSSEError(sseError));
            controller.close();
            return;
          }

          // ── Emit change_preview if the agent produced code changes ──
          if (result.changes && result.changes.length > 0) {
            // Fire-and-forget: capture "before" screenshot while the theme is unchanged
            captureBeforeScreenshot(executionId, body.projectId).catch(() => {});

            try {
              controller.enqueue(`data: ${JSON.stringify({
                type: 'change_preview',
                executionId,
                sessionId: body.sessionId ?? null,
                projectId: body.projectId,
                changes: result.changes.map((c) => ({
                  fileId: c.fileId,
                  fileName: c.fileName,
                  originalContent: c.originalContent,
                  proposedContent: c.proposedContent,
                  reasoning: c.reasoning,
                })),
              })}\n\n`);
            } catch { /* stream closed */ }
          }

          // ── Fast-path: Clarification needed — skip summary stream ──
          // The clarification text was already sent to the client via the
          // onProgress -> formatSSEThinking(phase:'clarification') callback.
          // We only need to close the stream.
          if (result.needsClarification) {
            controller.enqueue(formatSSEDone());
            controller.close();
            return;
          }

          // ── Direct-streamed: content was already sent token-by-token. Just close.
          if (result.directStreamed) {
            controller.enqueue(formatSSEDone());
            controller.close();
            return;
          }

          // ── Ask mode fast path (legacy): if the coordinator returned analysis
          // with no code changes AND didn't use exploration tools, emit
          // the analysis directly — skip the extra summary LLM call.
          // When exploration tools were used, the analysis is a raw technical
          // summary; let the summary model format it into a polished response.
          if (
            isAskMode &&
            result.analysis &&
            (!result.changes || result.changes.length === 0) &&
            !result.pmUsedTools
          ) {
            controller.enqueue(result.analysis);
            controller.enqueue(formatSSEDone());
            controller.close();
            return;
          }

          // ── Conditional summary skip: non-ask modes where PM already
          // explored and found no changes needed. The user saw the PM's
          // reasoning in real-time, so a summary adds little value.
          if (
            AI_FEATURES.conditionalSummary &&
            !isAskMode &&
            result.pmUsedTools &&
            result.analysis &&
            (!result.changes || result.changes.length === 0)
          ) {
            controller.enqueue(result.analysis);
            controller.enqueue(formatSSEDone());
            controller.close();
            return;
          }

          // ── Build and stream summary ────────────────────────────────
          // Use thin summary when PM already explored (user saw reasoning)
          // but specialists produced changes that need formatting.
          const useThinSummary = AI_FEATURES.conditionalSummary && result.pmUsedTools && result.changes && result.changes.length > 0;
          const summaryMessages = useThinSummary
            ? buildThinSummaryMessages(body.request, result, body.history as HistoryMessage[])
            : buildSummaryMessages(body.request, result, body.history as HistoryMessage[], summaryMode);

          // Mark system message for prompt caching
          if (AI_FEATURES.promptCaching) {
            const sysMsg = summaryMessages.find(m => m.role === 'system');
            if (sysMsg) sysMsg.cacheControl = { type: 'ephemeral' };
          }

          const provider = getAIProvider('anthropic');

          // Apply total budget enforcement before streaming
          const budgetedSummary = enforceRequestBudget(summaryMessages);

          // Select summary-phase tools when streaming tool use is enabled
          const selectedTools = AI_FEATURES.streamingToolUse
            ? selectToolsForRequest(intentMode, body.request, !!body.domContext)
            : [];

          const debugTools = process.env.DEBUG_TOOLS === 'true';

          // Summary model fallback: Haiku → Sonnet
          const summaryFallbackChain = [MODELS.CLAUDE_HAIKU, MODELS.CLAUDE_SONNET];
          let actualSummaryModel = summaryFallbackChain[0];
          let summaryGetUsage: () => Promise<{ inputTokens: number; outputTokens: number }> = async () => ({ inputTokens: 0, outputTokens: 0 });
          let summaryStarted = false;

          for (const candidateSummaryModel of summaryFallbackChain) {
            try {
              // Attempt streaming with tools if available
              if (selectedTools.length > 0) {
                const toolProvider = provider as AIToolProviderInterface;
                if (toolProvider.streamWithTools) {
                  try {
                    const toolStreamResult = await toolProvider.streamWithTools(
                      budgetedSummary.messages,
                      selectedTools,
                      { model: candidateSummaryModel, maxTokens: 1024, temperature: 0.3 },
                    );

                    // Consume ToolStreamEvent stream and translate to SSE
                    const toolReader = toolStreamResult.stream.getReader();
                    try {
                      while (true) {
                        const { done: toolDone, value: toolEvent } = await toolReader.read();
                        if (toolDone) break;

                        if (toolEvent.type === 'text_delta') {
                          controller.enqueue(toolEvent.text);
                        } else if (toolEvent.type === 'tool_start') {
                          if (debugTools) console.log(`[stream:tools] tool_start: ${toolEvent.name} (${toolEvent.id})`);
                          controller.enqueue(`data: ${JSON.stringify({ type: 'tool_start', name: toolEvent.name, id: toolEvent.id })}\n\n`);
                        } else if (toolEvent.type === 'tool_end') {
                          if (debugTools) console.log(`[stream:tools] tool_end: ${toolEvent.name} (${JSON.stringify(toolEvent.input).length} chars)`);
                          controller.enqueue(`data: ${JSON.stringify({ type: 'tool_call', name: toolEvent.name, input: toolEvent.input })}\n\n`);
                        }
                        // tool_delta events are not sent to the client (accumulation only)
                      }
                    } finally {
                      toolReader.releaseLock();
                    }

                    summaryGetUsage = toolStreamResult.getUsage;
                    actualSummaryModel = candidateSummaryModel;
                    summaryStarted = true;
                    break;
                  } catch (toolError) {
                    // Fall back to text-only stream if streamWithTools fails
                    console.error('[stream] streamWithTools failed, falling back to text stream:', {
                      error: toolError instanceof Error ? toolError.message : String(toolError),
                    });
                    controller.enqueue(formatSSEThinking({
                      type: 'thinking',
                      phase: 'analyzing' as const,
                      label: 'Tools unavailable, using text mode',
                    }));
                    // Fall through to regular stream() below
                  }
                }
              }

              // Regular text-only stream (no tools, or tool fallback)
              const streamResult = await provider.stream(budgetedSummary.messages, {
                model: candidateSummaryModel,
                maxTokens: 1024,
                temperature: 0.3,
              });

              // Pipe text stream
              const textReader = streamResult.stream.getReader();
              try {
                while (true) {
                  const { done: textDone, value: textValue } = await textReader.read();
                  if (textDone) break;
                  controller.enqueue(textValue);
                }
              } finally {
                textReader.releaseLock();
              }

              summaryGetUsage = streamResult.getUsage;
              actualSummaryModel = candidateSummaryModel;
              summaryStarted = true;
              break;
            } catch (streamError) {
              if (
                streamError instanceof AIProviderError &&
                streamError.code === 'MODEL_UNAVAILABLE' &&
                candidateSummaryModel !== summaryFallbackChain[summaryFallbackChain.length - 1]
              ) {
                console.error('[stream] summary model unavailable, trying fallback:', {
                  model: candidateSummaryModel,
                });
                controller.enqueue(formatSSEThinking({
                  type: 'thinking',
                  phase: 'analyzing' as const,
                  label: `Summary model ${candidateSummaryModel} unavailable — trying next`,
                }));
                continue;
              }
              console.error('[stream] summary stream failed:', {
                mode: intentMode,
                model: candidateSummaryModel,
                error: streamError instanceof AIProviderError ? streamError.code : 'UNKNOWN',
                message: streamError instanceof Error ? streamError.message : String(streamError),
              });
              const sseError = streamError instanceof AIProviderError
                ? streamError
                : new AIProviderError('PROVIDER_ERROR', String(streamError), 'anthropic');
              controller.enqueue(formatSSEError(sseError));
              controller.close();
              return;
            }
          }

          if (!summaryStarted) {
            controller.enqueue(formatSSEError(
              new AIProviderError('MODEL_UNAVAILABLE', 'All summary models unavailable', 'anthropic')
            ));
            controller.close();
            return;
          }

          // Record summary usage
          if (orgId) {
            const capturedOrgId = orgId;
            summaryGetUsage()
              .then((su) =>
                recordUsage({
                  organizationId: capturedOrgId,
                  userId,
                  projectId: body.projectId,
                  executionId,
                  provider: getProviderForModel(actualSummaryModel),
                  model: actualSummaryModel,
                  inputTokens: su.inputTokens,
                  outputTokens: su.outputTokens,
                  isByok: usageCheck.isByok,
                  isIncluded: usageCheck.isIncluded,
                  requestType: 'summary',
                }),
              )
              .catch((err) =>
                console.error('[stream] summary usage recording failed:', err),
              );
          }

          controller.enqueue(formatSSEDone());
          controller.close();
        } catch (error) {
          console.error('[stream] pipeline error:', {
            mode: intentMode,
            model: body.model ?? 'default',
            error: error instanceof AIProviderError ? error.code : 'UNKNOWN',
            message: error instanceof Error ? error.message : String(error),
          });
          const sseError = error instanceof AIProviderError
            ? error
            : new AIProviderError('UNKNOWN', String(error), 'server');
          try {
            controller.enqueue(formatSSEError(sseError));
            controller.close();
          } catch { /* stream already closed */ }
        }
      },
    });

    // EPIC B: Track request metrics (fire-and-forget)
    incrementCounter('agent.requests').catch(() => {});
    recordHistogram('agent.latency_ms', Date.now() - requestStart).catch(() => {});
    tracer.endTrace().catch(() => {});
    streamLog.info({ traceId: tracer.traceId, durationMs: Date.now() - requestStart }, 'Stream started');

    return new Response(responseStream, { headers: SSE_HEADERS });
  } catch (error) {
    // EPIC B: Track errors
    incrementCounter('agent.errors').catch(() => {});
    tracer.endTrace().catch(() => {});
    // Unhandled exceptions before the stream starts
    streamLog.error({ traceId: tracer.traceId, error: error instanceof Error ? error.message : String(error) }, 'Stream failed');
    console.error('[stream] unhandled pre-stream error:', {
      error: error instanceof AIProviderError ? error.code : 'UNKNOWN',
      message: error instanceof Error ? error.message : String(error),
    });
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

// ── Before-screenshot helper (fire-and-forget) ──────────────────────────

async function captureBeforeScreenshot(executionId: string, projectId: string): Promise<void> {
  try {
    const { storeScreenshot } = await import('@/lib/agents/execution-store');
    const supabase = await createServiceClient();
    const { data: project } = await supabase
      .from('projects')
      .select('shopify_connection_id, dev_theme_id')
      .eq('id', projectId)
      .maybeSingle();
    if (!project?.shopify_connection_id) return;

    const { data: connection } = await supabase
      .from('shopify_connections')
      .select('id, theme_id, store_domain')
      .eq('id', project.shopify_connection_id)
      .maybeSingle();
    if (!connection?.store_domain || !connection.theme_id) return;

    const themeId = String(project.dev_theme_id ?? connection.theme_id);
    const { generateThumbnail } = await import('@/lib/thumbnail/generator');
    const buffer = await generateThumbnail(connection.store_domain, themeId);
    if (!buffer) return;

    const { createClient: createStorageClient } = await import('@supabase/supabase-js');
    const storage = createStorageClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const path = `screenshots/${executionId}-before.jpg`;
    await storage.storage.from('project-files').upload(path, buffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    const { data: urlData } = storage.storage.from('project-files').getPublicUrl(path);
    if (urlData?.publicUrl) {
      storeScreenshot(executionId, 'beforeUrl', urlData.publicUrl);
    }
  } catch (err) {
    console.warn('[stream] before-screenshot capture failed (non-blocking):', err instanceof Error ? err.message : err);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Ask Mode Handler (DEPRECATED — kept for reference)
// Ask mode now runs through the coordinator like all other modes.
// This handler is no longer called and can be removed in a future cleanup.
// ══════════════════════════════════════════════════════════════════════════

interface AskModeParams {
  body: z.infer<typeof streamSchema>;
  executionId: string;
  userId: string;
  orgId: string | null;
  usageCheck: { isByok: boolean; isIncluded: boolean };
  elementHint?: ElementHint;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function handleAskMode({ body, executionId, userId, orgId, usageCheck, elementHint }: AskModeParams) {
  const responseStream = new ReadableStream<string>({
    async start(controller) {
      try {
        const emit = (event: ThinkingEvent) => {
          try { controller.enqueue(formatSSEThinking(event)); } catch { /* stream closed */ }
        };

        // Load context inside the stream so the user gets events immediately
        const { fileContexts, loadContent, memoryContext } = await loadStreamContext(
          body.projectId, userId, emit,
        );

        // Don't claim "607 files in context" — we select a bounded set first
        controller.enqueue(formatSSEThinking({
          type: 'thinking',
          phase: 'analyzing',
          label: 'Selecting relevant files',
          detail: 'Matching your question and open files to the project',
        }));

        // Send a heartbeat every 15s during file selection + load so the client doesn't hit 60s "Taking longer than expected"
        const PREP_HEARTBEAT_MS = 15_000;
        const prepHeartbeat = setInterval(() => {
          try {
            controller.enqueue(formatSSEThinking({
              type: 'thinking',
              phase: 'analyzing',
              label: 'Still preparing…',
            }));
          } catch { /* stream closed */ }
        }, PREP_HEARTBEAT_MS);
        await yieldToEventLoop();

        // Build messages for direct LLM call
        const systemPrompt = buildAskSystemPrompt(fileContexts) + (memoryContext || '');

        // Use ContextEngine for smarter file selection within token budget
        const askContextEngine = new ContextEngine(24_000);
        await askContextEngine.indexFiles(fileContexts, { every: 80, yieldFn: yieldToEventLoop });

        // Select relevant files via fuzzy matching (includes activeFilePath, open tabs, explicitFiles)
        const askSelection = askContextEngine.selectRelevantFiles(
          body.request,
          body.history?.slice(-3).map(m => m.content) ?? [],
          body.activeFilePath,
          24_000,
        );
        const selectedIds = new Set(askSelection.files.map(f => f.fileId));
        await yieldToEventLoop();

        // Element-driven file selection: prioritize section + related assets
        if (elementHint?.sectionId) {
          const elementFileIds = findFilesFromElementHint(elementHint, fileContexts);
          for (const id of elementFileIds) selectedIds.add(id);
          if (elementFileIds.length > 0) {
            console.log(`[stream:ask] element hint matched ${elementFileIds.length} file(s)`);
          }
        }

        // Always include open tabs so "open the file" works — user's open files get hydrated
        for (const id of body.openTabs ?? []) {
          if (fileContexts.some((f) => f.fileId === id)) selectedIds.add(id);
        }
        // Include explicitly requested file paths (e.g. user pinned or mentioned by path)
        for (const p of body.explicitFiles ?? []) {
          const norm = p.startsWith('/') ? p.slice(1) : p;
          const fc = fileContexts.find((f) => f.path === norm || f.path === p || (f.path && f.path.endsWith(norm)));
          if (fc) selectedIds.add(fc.fileId);
        }

        // Hydrate selected files via loadContent
        const includedFiles = selectedIds.size > 0
          ? await loadContent([...selectedIds])
          : await loadContent(fileContexts.slice(0, 15).map(f => f.fileId));

        clearInterval(prepHeartbeat);

        // Now report the actual bounded context (not the full project count)
        controller.enqueue(formatSSEThinking({
          type: 'thinking',
          phase: 'analyzing',
          label: 'Reading your project files',
          detail: `${includedFiles.length} files in context${fileContexts.length > includedFiles.length ? ` (from ${fileContexts.length} in project)` : ''}`,
        }));

        // Emit context_stats with actual bounded context for accurate UI meter
        const loadedTokens = includedFiles.reduce(
          (sum, f) => sum + estimateTokens(f.content ?? ''),
          0,
        );
        try {
          controller.enqueue(`data: ${JSON.stringify({
            type: 'context_stats',
            loadedFiles: includedFiles.length,
            loadedTokens,
            totalFiles: fileContexts.length,
          })}\n\n`);
        } catch { /* stream closed */ }

        // Build file content summaries from hydrated files
        const fileSummaries = includedFiles
          .slice(0, 30)
          .map((f) => `### ${f.path ?? f.fileName}\n\`\`\`${f.fileType}\n${f.content}\n\`\`\``)
          .join('\n\n');

        const contextBlock = fileSummaries
          ? `\n\n[Project file contents for reference]:\n${fileSummaries}`
          : '';

        const systemMsg: AIMessage = { role: 'system', content: systemPrompt };
        if (AI_FEATURES.promptCaching) {
          systemMsg.cacheControl = { type: 'ephemeral' };
        }
        const messages: AIMessage[] = [systemMsg];

        // Trim conversation history to fit budget
        const { messages: trimmedHistory, summary: historySummary } = trimHistory(
          body.history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
        );
        for (const msg of trimmedHistory) {
          messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
        }

        // Add current user message with file context (prepend summary if trimmed)
        const userContent = historySummary
          ? `[Context from earlier conversation]:\n${historySummary}\n\n${body.request}${contextBlock}`
          : body.request + contextBlock;
        messages.push({
          role: 'user',
          content: userContent,
        });

        controller.enqueue(formatSSEThinking({
          type: 'thinking',
          phase: 'complete',
          label: 'Ready',
        }));

        // Apply total budget enforcement before streaming
        const budgeted = enforceRequestBudget(messages);
        const finalMessages = budgeted.messages;

        // Stream directly from the provider with model fallback chain
        const userModel = body.model || MODELS.CLAUDE_SONNET;
        const provider = getAIProvider('anthropic');

        // Build deduplicated fallback chain: user pick → Sonnet → Haiku
        const askFallbackChain = [userModel, MODELS.CLAUDE_SONNET, MODELS.CLAUDE_HAIKU]
          .filter((m, i, arr) => arr.indexOf(m) === i);

        let actualAskModel = askFallbackChain[0];
        let askStream: ReadableStream<string> | null = null;
        let askGetUsage: (() => Promise<{ inputTokens: number; outputTokens: number }>) | null = null;

        for (const candidateModel of askFallbackChain) {
          try {
            const streamResult = await provider.stream(finalMessages, {
              model: candidateModel,
              maxTokens: 2048,
              temperature: 0.5,
              citationsEnabled: AI_FEATURES.citations,
            });
            askStream = streamResult.stream;
            askGetUsage = streamResult.getUsage;
            actualAskModel = candidateModel;
            break;
          } catch (modelError) {
            if (
              modelError instanceof AIProviderError &&
              modelError.code === 'MODEL_UNAVAILABLE' &&
              candidateModel !== askFallbackChain[askFallbackChain.length - 1]
            ) {
              controller.enqueue(formatSSEThinking({
                type: 'thinking',
                phase: 'analyzing',
                label: `Model ${candidateModel} unavailable — trying next model`,
              }));
              continue;
            }
            throw modelError;
          }
        }

        if (!askStream || !askGetUsage) {
          throw new AIProviderError('MODEL_UNAVAILABLE', 'All models in fallback chain are unavailable', 'anthropic');
        }

        const reader = askStream.getReader();
        const ASK_HEARTBEAT_MS = 15_000;
        while (true) {
          const readPromise = reader.read();
          const heartbeatPromise = new Promise<'heartbeat'>((resolve) =>
            setTimeout(() => resolve('heartbeat'), ASK_HEARTBEAT_MS)
          );
          const winner = await Promise.race([
            readPromise.then(() => 'read' as const),
            heartbeatPromise.then(() => 'heartbeat' as const),
          ]);
          if (winner === 'heartbeat') {
            try {
              controller.enqueue(formatSSEThinking({
                type: 'thinking',
                phase: 'analyzing',
                label: 'Still generating…',
              }));
            } catch { /* stream closed */ }
          }
          const { done, value } = await readPromise;
          if (done) break;
          if (value) controller.enqueue(value);
        }

        // Record usage with the actual model that succeeded
        if (orgId) {
          const capturedOrgId = orgId;
          askGetUsage()
            .then((u) =>
              recordUsage({
                organizationId: capturedOrgId,
                userId,
                projectId: body.projectId,
                executionId,
                provider: getProviderForModel(actualAskModel),
                model: actualAskModel,
                inputTokens: u.inputTokens,
                outputTokens: u.outputTokens,
                isByok: usageCheck.isByok,
                isIncluded: usageCheck.isIncluded,
                requestType: 'summary',
              }),
            )
            .catch((err) => console.error('[stream:ask] usage recording failed:', err));
        }

        controller.enqueue(formatSSEDone());
        controller.close();
      } catch (error) {
        console.error('[stream:ask] error:', {
          mode: 'ask',
          model: body.model ?? 'default',
          error: error instanceof AIProviderError ? error.code : 'UNKNOWN',
          message: error instanceof Error ? error.message : String(error),
        });
        const sseError = error instanceof AIProviderError
          ? error
          : new AIProviderError('UNKNOWN', String(error), 'server');
        try {
          controller.enqueue(formatSSEError(sseError));
          controller.close();
        } catch { /* stream closed */ }
      }
    },
  });

  return new Response(responseStream, { headers: SSE_HEADERS });
}
