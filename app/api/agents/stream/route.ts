import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { validateBody } from '@/lib/middleware/validation';
import { checkRateLimit } from '@/lib/middleware/rate-limit';
import { AgentCoordinator } from '@/lib/agents/coordinator';
import type { ThinkingEvent } from '@/lib/agents/coordinator';
import { createClient } from '@/lib/supabase/server';
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
import type { AIMessage } from '@/lib/ai/types';
import { formatMemoryForPrompt, filterActiveMemories, rowToMemoryEntry, type MemoryRow } from '@/lib/ai/developer-memory';
import { ContextEngine } from '@/lib/ai/context-engine';
import type { FileContext } from '@/lib/types/agent';
import { trimHistory } from '@/lib/ai/history-window';
import { enforceRequestBudget } from '@/lib/ai/request-budget';

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
  mode: z.enum(['orchestrated', 'solo']).optional(),
  domContext: z.string().optional(),
  intentMode: z.enum(['code', 'ask', 'plan', 'debug']).optional(),
});

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
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    checkRateLimit(request, { windowMs: 60000, maxRequests: 10 });

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

    // Load project files for context
    const { data: files } = await supabase
      .from('files')
      .select('id, name, path, file_type, content')
      .eq('project_id', body.projectId);

    // Load user preferences
    const { data: preferences } = await supabase
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

    const fileContexts = (files ?? []).map((f) => ({
      fileId: f.id,
      fileName: f.name,
      fileType: f.file_type as 'liquid' | 'javascript' | 'css' | 'other',
      content: f.content ?? '',
      path: f.path ?? undefined,
    }));

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
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // PLAN / CODE / DEBUG: Coordinator pipeline with thinking events
    // ══════════════════════════════════════════════════════════════════

    const isSoloMode = body.mode === 'solo';

    // The stream starts immediately so thinking events can be sent in real time.
    const responseStream = new ReadableStream<string>({
      async start(controller) {
        try {
          // ── Run coordinator with real-time progress ────────────────
          const coordinator = new AgentCoordinator();
          const action = body.action as AIAction | undefined ?? toAction(intentMode);

          const coordinatorOptions = {
            action,
            model: body.model,
            mode: body.mode,
            domContext: body.domContext,
            memoryContext,
            planOnly: intentMode === 'plan',
            onProgress: (event: ThinkingEvent) => {
              try { controller.enqueue(formatSSEThinking(event)); } catch { /* stream closed */ }
            },
          };

          const result = isSoloMode
            ? await coordinator.executeSolo(
                executionId,
                body.projectId,
                userId,
                body.request,
                fileContexts,
                preferences ?? [],
                coordinatorOptions,
              )
            : await coordinator.execute(
                executionId,
                body.projectId,
                userId,
                body.request,
                fileContexts,
                preferences ?? [],
                coordinatorOptions,
              );

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

          // ── Build and stream summary ────────────────────────────────
          const summaryMessages = buildSummaryMessages(
            body.request,
            result,
            body.history as HistoryMessage[],
            summaryMode
          );

          const summaryModel = MODELS.CLAUDE_HAIKU;
          const provider = getAIProvider('anthropic');

          // Apply total budget enforcement before streaming
          const budgetedSummary = enforceRequestBudget(summaryMessages);

          let summaryStream: ReadableStream<string>;
          let summaryGetUsage: () => Promise<{ inputTokens: number; outputTokens: number }>;
          try {
            const streamResult = await provider.stream(budgetedSummary.messages, {
              model: summaryModel,
              maxTokens: 1024,
              temperature: 0.3,
            });
            summaryStream = streamResult.stream;
            summaryGetUsage = streamResult.getUsage;
          } catch (streamError) {
            console.error('[stream] summary stream failed to start:', streamError);
            const sseError = streamError instanceof AIProviderError
              ? streamError
              : new AIProviderError('PROVIDER_ERROR', String(streamError), 'anthropic');
            controller.enqueue(formatSSEError(sseError));
            controller.close();
            return;
          }

          // Pipe summary stream to the response
          const reader = summaryStream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } catch (midStreamError) {
            console.error('[stream] mid-stream error:', midStreamError);
            const sseError = midStreamError instanceof AIProviderError
              ? midStreamError
              : new AIProviderError('PROVIDER_ERROR', String(midStreamError), 'anthropic');
            controller.enqueue(formatSSEError(sseError));
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
                  provider: getProviderForModel(summaryModel),
                  model: summaryModel,
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
          console.error('[stream] pipeline error:', error);
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

    return new Response(responseStream, { headers: SSE_HEADERS });
  } catch (error) {
    // Unhandled exceptions before the stream starts
    console.error('[stream] unhandled error:', error);
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
}

function handleAskMode({ body, fileContexts, executionId, userId, orgId, usageCheck, memoryContext }: AskModeParams) {
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
        askContextEngine.indexFiles(fileContexts);

        // Build context with all files; ContextEngine handles token budgeting
        const allFileIds = fileContexts.map((f) => f.fileId);
        const contextResult = askContextEngine.buildContext(allFileIds);
        const includedFiles = contextResult.files;

        // Build file content summaries from prioritized files
        const fileSummaries = includedFiles
          .slice(0, 30)
          .map((f) => `### ${f.path ?? f.fileName}\n\`\`\`${f.fileType}\n${f.content}\n\`\`\``)
          .join('\n\n');

        const contextBlock = fileSummaries
          ? `\n\n[Project file contents for reference]:\n${fileSummaries}`
          : '';

        const messages: AIMessage[] = [
          { role: 'system', content: systemPrompt },
        ];

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

        // Stream directly from the provider (no coordinator)
        const askModel = MODELS.CLAUDE_SONNET;
        const provider = getAIProvider('anthropic');

        const { stream, getUsage } = await provider.stream(finalMessages, {
          model: askModel,
          maxTokens: 2048,
          temperature: 0.5,
        });

        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }

        // Record usage
        if (orgId) {
          const capturedOrgId = orgId;
          getUsage()
            .then((u) =>
              recordUsage({
                organizationId: capturedOrgId,
                userId,
                projectId: body.projectId,
                executionId,
                provider: getProviderForModel(askModel),
                model: askModel,
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
        console.error('[stream:ask] error:', error);
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
