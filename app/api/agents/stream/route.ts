import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { checkIdempotency } from '@/lib/middleware/idempotency';
import { validateBody } from '@/lib/middleware/validation';
import { checkRateLimit } from '@/lib/middleware/rate-limit';
import { AgentCoordinator, findFilesFromElementHint } from '@/lib/agents/coordinator';
import type { ThinkingEvent } from '@/lib/agents/coordinator';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { loadProjectFiles } from '@/lib/supabase/file-loader';
import { getAIProvider } from '@/lib/ai/get-provider';
import { buildSummaryMessages } from '@/lib/agents/summary-prompt';
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
import type { FileContext, ElementHint } from '@/lib/types/agent';
import { trimHistory } from '@/lib/ai/history-window';
import { enforceRequestBudget } from '@/lib/ai/request-budget';
import { buildDiagnosticContext } from '@/lib/agents/diagnostic-context';
import { selectToolsForRequest } from '@/lib/agents/tools/definitions';
import { AI_FEATURES } from '@/lib/ai/feature-flags';
import { startTrace } from '@/lib/observability/tracer';
import { incrementCounter, recordHistogram } from '@/lib/observability/metrics';
import { createModuleLogger } from '@/lib/observability/logger';

const streamSchema = z.object({
  projectId: z.string().uuid(),
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
  mode: z.enum(['orchestrated', 'solo', 'auto']).optional(),
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

// ── Ask Mode System Prompt ──────────────────────────────────────────────

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

    const supabase = await createClient();
    // Service client bypasses RLS — needed when requests arrive with a
    // Bearer token (e.g. MCP server) instead of browser cookies.
    const serviceClient = createServiceClient();

    // Load project files: stubs for all files + loadContent hydrator for on-demand content
    const { allFiles: fileContexts_, loadContent } = await loadProjectFiles(body.projectId, serviceClient);

    // Load user preferences
    const { data: preferences } = await serviceClient
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId);

    // Load developer memory (EPIC 14) — fail silently if table doesn't exist
    let memoryContext = '';
    try {
      const { data: memoryRows } = await supabase
        .from('developer_memory')
        .select('*')
        .eq('project_id', body.projectId)
        .eq('user_id', userId);
      if (memoryRows && memoryRows.length > 0) {
        const entries = (memoryRows as MemoryRow[]).map(rowToMemoryEntry);
        const active = filterActiveMemories(entries);
        memoryContext = formatMemoryForPrompt(active);
      }
    } catch {
      // developer_memory table may not exist yet — silently skip
    }

    const fileContexts = fileContexts_;

    // ── Build diagnostic context (EPIC V2) ────────────────────────────
    // Run Liquid validation pipeline on files with real content to give
    // agents awareness of existing issues in the codebase.
    let diagnosticContext = '';
    try {
      const diagResult = buildDiagnosticContext(fileContexts);
      diagnosticContext = diagResult.formatted;
    } catch {
      // Diagnostic pipeline should never block agent execution
    }

    const executionId = crypto.randomUUID();
    const orgId = usageCheck.organizationId || null;

    // ══════════════════════════════════════════════════════════════════
    // ASK MODE: Direct LLM chat — skip coordinator entirely
    // ══════════════════════════════════════════════════════════════════
    if (intentMode === 'ask') {
      return handleAskMode({
        body,
        fileContexts,
        executionId,
        userId,
        orgId,
        memoryContext,
        usageCheck,
        loadContent,
        elementHint: body.elementHint as ElementHint | undefined,
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // PLAN / CODE / DEBUG: Coordinator pipeline with thinking events
    // ══════════════════════════════════════════════════════════════════

    const isAutoMode = body.mode === 'auto' || !body.mode;
    const isSoloMode = body.mode === 'solo';

    // The stream starts immediately so thinking events can be sent in real time.
    const responseStream = new ReadableStream<string>({
      async start(controller) {
        try {
          // ── Run coordinator with real-time progress ────────────────
          const coordinator = new AgentCoordinator();
          const action = body.action as AIAction | undefined ?? toAction(intentMode);

          const recentMessages = body.history?.slice(-5).map((m: { content: string }) => m.content) ?? [];
          // Plan/code/debug: coordinator merges openTabs + explicitFiles into context.
          const coordinatorOptions = {
            action,
            model: body.model,
            mode: body.mode === 'auto' ? undefined : body.mode,
            domContext: body.domContext,
            memoryContext,
            diagnosticContext,
            planOnly: intentMode === 'plan',
            activeFilePath: body.activeFilePath,
            openTabs: body.openTabs,
            recentMessages,
            loadContent,
            elementHint: body.elementHint as ElementHint | undefined,
            autoRoute: isAutoMode, // enable smart routing for auto/default mode
            clarificationRound: body.clarificationRound,
            clarificationHistory: body.clarificationHistory,
            explicitFiles: body.explicitFiles,
            onProgress: (event: ThinkingEvent) => {
              try { controller.enqueue(formatSSEThinking(event)); } catch { /* stream closed */ }
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
          const executeCoordinator = async (opts: typeof coordinatorOptions) => {
            return isSoloMode
              ? coordinator.executeSolo(executionId, body.projectId, userId, body.request, fileContexts, preferences ?? [], opts)
              : coordinator.execute(executionId, body.projectId, userId, body.request, fileContexts, preferences ?? [], opts);
          };

          // Build deduplicated model fallback chain for coordinator
          const coordUserModel = body.model || MODELS.CLAUDE_SONNET;
          const coordFallbackChain = [coordUserModel, MODELS.CLAUDE_SONNET, MODELS.CLAUDE_HAIKU]
            .filter((m, i, arr) => arr.indexOf(m) === i);

          let result = await executeCoordinator(coordinatorOptions);

          // Model fallback: if MODEL_UNAVAILABLE, try next model in chain
          if (!result.success && result.error?.code === 'MODEL_UNAVAILABLE') {
            for (let fi = 1; fi < coordFallbackChain.length; fi++) {
              const fallbackModel = coordFallbackChain[fi];
              controller.enqueue(formatSSEThinking({
                type: 'thinking',
                phase: 'analyzing' as const,
                label: `Model unavailable — trying ${fallbackModel}`,
              }));
              const fallbackCoord = new AgentCoordinator();
              const fallbackOpts = { ...coordinatorOptions, model: fallbackModel };
              result = isSoloMode
                ? await fallbackCoord.executeSolo(executionId + `-fb${fi}`, body.projectId, userId, body.request, fileContexts, preferences ?? [], fallbackOpts)
                : await fallbackCoord.execute(executionId + `-fb${fi}`, body.projectId, userId, body.request, fileContexts, preferences ?? [], fallbackOpts);
              if (result.success || result.error?.code !== 'MODEL_UNAVAILABLE') break;
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

          // ── Fast-path: Clarification needed — skip summary stream ──
          // The clarification text was already sent to the client via the
          // onProgress -> formatSSEThinking(phase:'clarification') callback.
          // We only need to close the stream.
          if (result.needsClarification) {
            controller.enqueue(formatSSEDone());
            controller.close();
            return;
          }

          // ── Build and stream summary ────────────────────────────────
          const summaryMessages = buildSummaryMessages(
            body.request,
            result,
            body.history as HistoryMessage[],
            summaryMode
          );

          // Mark system message for prompt caching
          if (AI_FEATURES.promptCaching) {
            const sysMsg = summaryMessages.find(m => m.role === 'system');
            if (sysMsg) sysMsg.cacheControl = { type: 'ephemeral' };
          }

          const provider = getAIProvider('anthropic');

          // Apply total budget enforcement before streaming
          const budgetedSummary = enforceRequestBudget(summaryMessages);

          // Select summary-phase tools when streaming tool use is enabled
          const selectedTools = AI_FEATURES.streamingToolUse && intentMode !== 'ask'
            ? selectToolsForRequest(intentMode, body.request, !!body.domContext)
            : [];

          const debugTools = process.env.DEBUG_TOOLS === 'true';

          // Summary model fallback: Haiku → Sonnet
          const summaryFallbackChain = [MODELS.CLAUDE_HAIKU, MODELS.CLAUDE_SONNET];
          let actualSummaryModel = summaryFallbackChain[0];
          let summaryGetUsage: () => Promise<{ inputTokens: number; outputTokens: number }>;
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

// ══════════════════════════════════════════════════════════════════════════
// Ask Mode Handler
// ══════════════════════════════════════════════════════════════════════════

interface AskModeParams {
  body: z.infer<typeof streamSchema>;
  fileContexts: FileContext[];
  executionId: string;
  userId: string;
  orgId: string | null;
  usageCheck: { isByok: boolean; isIncluded: boolean };
  memoryContext?: string;
  loadContent: (fileIds: string[]) => FileContext[];
  elementHint?: ElementHint;
}

function handleAskMode({ body, fileContexts, executionId, userId, orgId, usageCheck, memoryContext, loadContent, elementHint }: AskModeParams) {
  const responseStream = new ReadableStream<string>({
    async start(controller) {
      try {
        // Send a minimal thinking event
        controller.enqueue(formatSSEThinking({
          type: 'thinking',
          phase: 'analyzing',
          label: 'Reading your project files',
          detail: `${fileContexts.length} files in context`,
        }));

        // Build messages for direct LLM call
        const systemPrompt = buildAskSystemPrompt(fileContexts) + (memoryContext || '');

        // Use ContextEngine for smarter file selection within token budget
        const askContextEngine = new ContextEngine(12_000);
        askContextEngine.indexFiles(fileContexts); // Indexes stubs (skip ref detection)

        // Select relevant files via fuzzy matching, then hydrate with real content
        const askSelection = askContextEngine.selectRelevantFiles(
          body.request,
          body.history?.slice(-3).map(m => m.content) ?? [],
          body.activeFilePath,
          12_000,
        );
        const selectedIds = new Set(askSelection.files.map(f => f.fileId));

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
          ? loadContent([...selectedIds])
          : loadContent(fileContexts.slice(0, 15).map(f => f.fileId));

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
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
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
