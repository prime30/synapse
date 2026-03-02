import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireProjectAccess } from '@/lib/middleware/auth';
import { checkIdempotency } from '@/lib/middleware/idempotency';
import { validateBody } from '@/lib/middleware/validation';
import { checkRateLimit } from '@/lib/middleware/rate-limit';
import { checkUsageAllowance } from '@/lib/billing/usage-guard';
import { recordUsageBatch } from '@/lib/billing/usage-recorder';
import { AIProviderError, formatSSEError, formatSSEDone, classifyNetworkError } from '@/lib/ai/errors';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { loadProjectFiles } from '@/lib/supabase/file-loader';
import { formatMemoryForPrompt, filterActiveMemories, rowToMemoryEntry, type MemoryRow } from '@/lib/ai/developer-memory';
import { buildDiagnosticContext } from '@/lib/agents/diagnostic-context';
import type { UserPreference } from '@/lib/types/agent';
import { streamV2 } from '@/lib/agents/coordinator-v2';
import { streamFlat } from '@/lib/agents/coordinator-flat';
import type { V2CoordinatorOptions } from '@/lib/agents/coordinator-v2';
import { trimHistory } from '@/lib/ai/history-window';
import { loadHistoryForCoordinator, recallFromPastSessions } from '@/lib/ai/message-persistence';
import { compressHistoryForBudget } from '@/lib/ai/message-compression';
import type { MessageMetadata } from '@/lib/types/database';
import { updateFile } from '@/lib/services/files';
import { invalidateFileContent } from '@/lib/supabase/file-loader';
import { schedulePushForProject } from '@/lib/shopify/push-queue';
import { isCircuitOpen } from '@/lib/ai/circuit-breaker';
import { MODELS, getProviderForModel } from '@/lib/agents/model-router';
import { startTrace } from '@/lib/observability/tracer';
import { incrementCounter, recordHistogram } from '@/lib/observability/metrics';
import { createModuleLogger } from '@/lib/observability/logger';
import { resolveReferentialArtifactsFromExecutions } from '@/lib/agents/referential-artifact-ledger';
import { getCachedPreferences, getCachedMemoryContext } from '@/lib/cache/agent-context-cache';

export const maxDuration = 300;

const streamLog = createModuleLogger('agents/stream-v2');

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
} as const;

const streamSchema = z.object({
  projectId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  request: z.string().min(1, 'Request is required'),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
  images: z.array(z.object({
    base64: z.string(),
    mimeType: z.string(),
  })).optional(),
  model: z.string().optional(),
  domContext: z.string().optional(),
  intentMode: z.enum(['code', 'ask', 'plan', 'debug']).optional(),
  activeFilePath: z.string().optional(),
  explicitFiles: z.array(z.string()).optional(),
  openTabs: z.array(z.string()).optional(),
  isReferentialCodePrompt: z.boolean().optional(),
  referentialArtifacts: z.array(
    z.object({
      filePath: z.string().min(1),
      newContent: z.string(),
      reasoning: z.string().optional(),
      capturedAt: z.string().optional(),
    }),
  ).optional(),
  elementHint: z.object({
    sectionId: z.string().optional(),
    sectionType: z.string().optional(),
    blockId: z.string().optional(),
    elementId: z.string().optional(),
    cssClasses: z.array(z.string()).optional(),
    selector: z.string().optional(),
  }).optional(),
  subagentCount: z.number().int().min(1).max(4).optional(),
  maxQuality: z.boolean().optional(),
  cleanStart: z.boolean().optional(),
  useFlatPipeline: z.boolean().optional(),
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

    // ── Project access ────────────────────────────────────────────────
    try {
      await requireProjectAccess(req, body.projectId);
    } catch {
      return NextResponse.json({ error: 'No access to this project' }, { status: 403 });
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

    const SSE_HIGH_WATER_MARK = 64 * 1024; // 64KB
    let pendingBytes = 0;

    const stream = new ReadableStream({
      pull() {
        pendingBytes = 0;
      },
      async start(controller) {
        const emit = (text: string) => {
          try {
            const encoded = encoder.encode(text);
            pendingBytes += encoded.byteLength;
            controller.enqueue(encoded);
          } catch { /* stream closed */ }
        };
        const emitEvent = (event: Record<string, unknown>) => {
          // Drop non-critical events when backpressure is high
          if (pendingBytes > SSE_HIGH_WATER_MARK) {
            const type = event.type as string;
            if (type === 'thinking' || type === 'reasoning') return;
          }
          emit(`event: synapse\ndata: ${JSON.stringify(event)}\n\n`);
        };

        // ── Heartbeat keepalive (EPIC 3c) ────────────────────────────
        const heartbeatId = setInterval(() => {
          try {
            emitEvent({ type: 'thinking', phase: 'analyzing', label: 'Still working...' });
          } catch { /* stream closed */ }
        }, 45_000);

        try {
          const supabase = await createClient();
          const serviceClient = createServiceClient();

          const contextLoadStart = Date.now();
          emitEvent({ type: 'thinking', phase: 'analyzing', label: 'Loading context...' });

          // Check if this session has clean_start enabled (suppresses cross-session recall)
          // Checked via request body flag OR database column (either is sufficient)
          let isCleanStart = Boolean(body.cleanStart);
          if (!isCleanStart && body.sessionId) {
            try {
              const { data: sessionRow } = await serviceClient
                .from('ai_sessions')
                .select('clean_start')
                .eq('id', body.sessionId)
                .maybeSingle();
              isCleanStart = Boolean(sessionRow?.clean_start);
            } catch { /* column may not exist yet */ }
          }

          const [fileResult, prefResult, memoryContext, crossSessionContext, shopifyInfo] = await Promise.all([
            (async () => {
              const t0 = Date.now();
              const result = await loadProjectFiles(body.projectId, serviceClient);
              recordHistogram('agent.project_files_load_ms', Date.now() - t0).catch(() => {});
              return result;
            })(),
            (async () => {
              const t0 = Date.now();
              const prefs = await getCachedPreferences<UserPreference[]>(userId, async () => {
                const r = await serviceClient
                  .from('user_preferences')
                  .select('id, user_id, category, key, value, file_type, confidence, first_observed, last_reinforced, observation_count, metadata, created_at, updated_at')
                  .eq('user_id', userId);
                return (r.data ?? []) as UserPreference[];
              });
              recordHistogram('agent.preferences_load_ms', Date.now() - t0).catch(() => {});
              return prefs;
            })(),
            (async () => {
              if (isCleanStart) return '';
              const t0 = Date.now();
              const mem = await getCachedMemoryContext(userId, body.projectId, async () => {
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
              });
              recordHistogram('agent.memory_load_ms', Date.now() - t0).catch(() => {});
              return mem;
            })(),
            (async () => {
              if (isCleanStart) return '';
              try {
                return await recallFromPastSessions(
                  body.projectId,
                  body.sessionId,
                  body.request,
                  5,
                );
              } catch { return ''; }
            })(),
            (async () => {
              try {
                const { data: project } = await serviceClient
                  .from('projects')
                  .select('shopify_connection_id, dev_theme_id, shopify_theme_id')
                  .eq('id', body.projectId)
                  .maybeSingle();
                return {
                  connectionId: project?.shopify_connection_id as string | undefined,
                  themeId: (project?.dev_theme_id ?? project?.shopify_theme_id) as string | undefined,
                };
              } catch { return { connectionId: undefined, themeId: undefined }; }
            })(),
          ]);

          recordHistogram('agent.context_load_total_ms', Date.now() - contextLoadStart).catch(() => {});
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

          const requestTrimmed = body.request.trim();
          const referentialCodePrompt =
            (body.intentMode ?? 'code') === 'code' &&
            (
              body.isReferentialCodePrompt === true ||
              // Direct approval patterns
              /^(yes|ok|do it|go ahead|apply|implement|make those changes|ship it|proceed|continue|build it|execute)[\s.!]*$/i.test(requestTrimmed) ||
              // "apply/implement/do that/those/the changes"
              /\b(apply|implement|create|make|write|use|do|try|fix|build)\b.*\b(that|the|those|this|previous|earlier|before|above|suggested|from before|again)\b/i.test(requestTrimmed) ||
              // "that/those/the code/changes/suggestions"
              /\b(that|the|those|this|previous|earlier|before|above)\b.*\b(code|changes?|suggestions?|edits?|snippet|approach|fix|plan)\b/i.test(requestTrimmed) ||
              // "same thing" / "like before" / "what you said"
              /\b(same|like|what you)\b.*\b(thing|before|said|suggested|showed|described|proposed)\b/i.test(requestTrimmed) ||
              // Short follow-ups that reference prior context
              requestTrimmed.length < 30 && /\b(again|too|also|and|but|still|yet)\b/i.test(requestTrimmed)
            );
          // Load structured history from DB if sessionId available; fall back to flat strings
          const historyBudget = referentialCodePrompt ? 60_000 : 30_000;
          let recentHistory: Awaited<ReturnType<typeof loadHistoryForCoordinator>> | undefined;
          let recentMessages: string[] | undefined;
          try {
            if (body.sessionId) {
              const structuredHistory = await loadHistoryForCoordinator(body.sessionId);
              if (structuredHistory.length > 0) {
                const compressed = compressHistoryForBudget(
                  structuredHistory.map((m) => ({
                    role: m.role,
                    content: m.content,
                    metadata: (m as unknown as Record<string, unknown>).__toolCalls
                      ? { toolCalls: (m as unknown as Record<string, unknown>).__toolCalls as MessageMetadata['toolCalls'] }
                      : (m as unknown as Record<string, unknown>).__toolResults
                        ? { toolResults: (m as unknown as Record<string, unknown>).__toolResults as MessageMetadata['toolResults'] }
                        : null,
                    created_at: new Date().toISOString(),
                  })),
                  historyBudget,
                );
                recentHistory = compressed.map((c) => {
                  const msg: Record<string, unknown> = { role: c.role, content: c.content };
                  if (c.metadata?.toolCalls) msg.__toolCalls = c.metadata.toolCalls;
                  if (c.metadata?.toolResults) msg.__toolResults = c.metadata.toolResults;
                  return msg as unknown as (typeof structuredHistory)[number];
                });
              }
            }
          } catch {
            // Fall back to flat history on any error
          }
          if (!recentHistory) {
            const trimmed = trimHistory(
              body.history.map((h) => ({ role: h.role, content: h.content })),
              { budget: historyBudget, keepRecent: referentialCodePrompt ? 30 : 20 },
            );
            recentMessages = trimmed.messages.map((m) => m.content);
          }
          const incomingArtifacts = body.referentialArtifacts ?? [];
          let resolvedArtifacts = incomingArtifacts;
          if (referentialCodePrompt && incomingArtifacts.length === 0) {
            try {
              resolvedArtifacts = await resolveReferentialArtifactsFromExecutions({
                projectId: body.projectId,
                userId,
                preferredPaths: body.explicitFiles,
                maxArtifacts: 8,
              });
            } catch {
              resolvedArtifacts = incomingArtifacts;
            }
          }

          let firstTokenRecorded = false;
          const pendingToolCalls = new Map<string, string>();
          const maxParallelSpecialists = Math.min(
            Math.max(Number(body.subagentCount) || 3, 1),
            4,
          );
          const coordinatorOptions: V2CoordinatorOptions = {
            sessionId: body.sessionId,
            intentMode: body.intentMode ?? 'code',
            maxParallelSpecialists,
            maxQuality: body.maxQuality ?? false,
            isReferentialCodePrompt: referentialCodePrompt,
            referentialArtifacts: resolvedArtifacts,
            model: fallbackChain[0],
            domContext: body.domContext,
            memoryContext: [memoryContext, crossSessionContext].filter(Boolean).join('\n\n') || undefined,
            diagnosticContext,
            activeFilePath: body.activeFilePath,
            openTabs: body.openTabs,
            recentMessages,
            recentHistory,
            loadContent,
            elementHint: body.elementHint,
            images: body.images,
            onProgress: (event) => emitEvent(event),
            onContentChunk: (chunk) => {
              if (!firstTokenRecorded) {
                firstTokenRecorded = true;
                recordHistogram('agent.first_token_ms', Date.now() - requestStart).catch(() => {});
              }
              emitEvent({ type: 'content_chunk', chunk });
            },
            onToolEvent: (event) => {
              if (event.type === 'tool_call' && event.id) {
                pendingToolCalls.set(event.id, event.name);
              }
              if ((event.type === 'tool_result') && event.id) {
                pendingToolCalls.delete(event.id);
              }
              emitEvent(event);
            },
            onReasoningChunk: (agent, chunk) => {
              emitEvent({ type: 'reasoning', agent, text: chunk });
            },
            shopifyConnectionId: shopifyInfo.connectionId,
            themeId: shopifyInfo.themeId,
            deadlineMs: requestStart,
            signal: req.signal,
          };

          const coordinatorFn = body.useFlatPipeline ? streamFlat : streamV2;

          if (!body.useFlatPipeline) {
            coordinatorOptions.strategy = 'GOD_MODE';
          }

          let result = await coordinatorFn(
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
              result = await coordinatorFn(
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
            result = await coordinatorFn(
              executionId + '-retry',
              body.projectId,
              userId,
              body.request,
              fileContexts,
              prefResult,
              reducedOpts,
            );
          }

          // Incomplete execution contract: checkpointed runs are continuing in background.
          // Do not emit terminal `done` for this stream.
          if (result.success && result.checkpointed) {
            emitEvent({
              type: 'checkpointed',
              phase: 'background',
              label: 'Continuing in background...',
              metadata: { executionId },
            });
            emitEvent({
              type: 'context_file_loaded',
              loadedFiles: fileContexts.filter((f) => !f.content.startsWith('[')).length,
              loadedTokens: Math.ceil(
                fileContexts
                  .filter((f) => !f.content.startsWith('['))
                  .reduce((sum, f) => sum + (f.content?.length ?? 0), 0) / 4,
              ),
              totalFiles: fileContexts.length,
            });
            return;
          }

          // Surface V2 errors directly — no silent fallback to a weaker pipeline.
          if (!result.success && result.error) {
            const code = (result.error.code ?? 'UNKNOWN') as import('@/lib/ai/errors').AIErrorCode;
            const msg = result.error.message ?? 'Agent execution failed';
            console.error(`[V2 Stream] Failed (${code}): ${msg}`);
            emit(formatSSEError(new AIProviderError(code, msg, 'server')));
            return;
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
              cacheReadInputTokens: result.usage.totalCacheReadTokens ?? 0,
              cacheCreationInputTokens: result.usage.totalCacheWriteTokens ?? 0,
            }]).catch((err) =>
              console.error('[V2 Stream] usage recording failed:', err),
            );
          }

          // ── Execution outcome summary for UI badges ─────────────────
          const changedFiles = result.changes?.length ?? 0;
          const blockedByPolicy =
            Boolean(result.needsClarification) &&
            /plan-first policy requires plan approval/i.test(result.analysis ?? '');
          // Only emit 'needs-input' when the agent explicitly asked for
          // clarification (via ask_clarification tool). All other no-change
          // code runs should surface as 'no-change' with the completion
          // summary already streamed in the content.
          const outcome: 'applied' | 'no-change' | 'blocked-policy' | 'needs-input' =
            blockedByPolicy
              ? 'blocked-policy'
              : changedFiles > 0
                ? 'applied'
                : (Boolean(result.needsClarification) && !blockedByPolicy)
                  ? 'needs-input'
                  : 'no-change';
          // Auto-apply changes to file records and push to Shopify
          if (outcome === 'applied' && result.changes && result.changes.length > 0) {
            emitEvent({
              type: 'change_preview',
              executionId,
              sessionId: body.sessionId ?? null,
              projectId: body.projectId,
              checkpointId: result.checkpointId,
              changes: result.changes.map((c) => ({
                fileId: c.fileId ?? '',
                fileName: c.fileName,
                originalContent: c.originalContent ?? '',
                proposedContent: c.proposedContent ?? '',
                reasoning: c.reasoning ?? '',
                changeType: (!c.originalContent || c.fileId?.startsWith('new_')) ? 'create' as const : 'edit' as const,
              })),
            });

            let appliedCount = 0;
            const skippedDestructive: string[] = [];
            for (const change of result.changes) {
              console.log(`[V2 Stream] Processing change: fileName=${change.fileName}, fileId=${change.fileId || '(empty)'}, proposedContent=${change.proposedContent?.length ?? 0} chars, originalContent=${(change.originalContent ?? '').length} chars`);
              if (!change.proposedContent) {
                console.warn(`[V2 Stream] Skipping ${change.fileName} — proposedContent is empty`);
                continue;
              }

              // Resolve fileId: if missing, look up by fileName/path in the DB
              let resolvedFileId = change.fileId;
              if (!resolvedFileId && change.fileName) {
                try {
                  const supabaseAdmin = createServiceClient();
                  // Try path match first, then name match
                  const { data: pathMatch } = await supabaseAdmin
                    .from('files')
                    .select('id')
                    .eq('project_id', body.projectId)
                    .eq('path', change.fileName)
                    .limit(1)
                    .maybeSingle();
                  if (pathMatch?.id) {
                    resolvedFileId = pathMatch.id;
                  } else {
                    const { data: nameMatch } = await supabaseAdmin
                      .from('files')
                      .select('id')
                      .eq('project_id', body.projectId)
                      .eq('name', change.fileName)
                      .limit(1)
                      .maybeSingle();
                    if (nameMatch?.id) {
                      resolvedFileId = nameMatch.id;
                    } else {
                      // Try partial match: fileName might be "snippets/file.liquid" but DB has "file.liquid"
                      const baseName = change.fileName.split('/').pop() ?? change.fileName;
                      const { data: baseMatch } = await supabaseAdmin
                        .from('files')
                        .select('id')
                        .eq('project_id', body.projectId)
                        .eq('name', baseName)
                        .limit(1)
                        .maybeSingle();
                      if (baseMatch?.id) resolvedFileId = baseMatch.id;
                    }
                  }
                } catch (err) {
                  console.warn(`[V2 Stream] fileId lookup error for ${change.fileName}:`, err);
                }
              }
              if (!resolvedFileId) {
                console.warn(`[V2 Stream] Cannot resolve fileId for "${change.fileName}" in project ${body.projectId} — skipping auto-apply`);
                emitEvent({
                  type: 'thinking',
                  phase: 'validating',
                  label: `Could not auto-apply ${change.fileName} — file not found in project`,
                });
                continue;
              }

              // Safeguard: reject changes that remove >50% of the file content.
              // This catches model truncation where propose_code_edit sends a
              // near-empty file to replace hundreds of lines.
              const origLen = (change.originalContent ?? '').length;
              const newLen = change.proposedContent.length;
              if (origLen > 200 && newLen < origLen * 0.5) {
                console.warn(
                  `[V2 Stream] BLOCKED destructive change to ${change.fileName}: ` +
                  `${origLen} chars → ${newLen} chars (${Math.round((1 - newLen / origLen) * 100)}% removed)`,
                );
                skippedDestructive.push(change.fileName);
                continue;
              }

              try {
                await updateFile(resolvedFileId, { content: change.proposedContent, userId });
                try { invalidateFileContent(resolvedFileId); } catch { /* non-blocking */ }
                appliedCount++;
                console.log(`[V2 Stream] Auto-applied ${change.fileName} (fileId=${resolvedFileId}, ${change.proposedContent.length} chars)`);
              } catch (err) {
                console.warn(`[V2 Stream] Auto-apply failed for ${change.fileName} (fileId=${resolvedFileId}):`, err);
                emitEvent({
                  type: 'thinking',
                  phase: 'validating',
                  label: `Failed to save ${change.fileName}: ${err instanceof Error ? err.message : 'unknown error'}`,
                });
              }
            }
            if (skippedDestructive.length > 0) {
              emitEvent({
                type: 'thinking',
                phase: 'validating',
                label: `Blocked ${skippedDestructive.length} destructive edit(s) — file(s) would lose >50% content`,
                detail: skippedDestructive.join(', '),
              });
            }
            if (appliedCount > 0) {
              schedulePushForProject(body.projectId);
              emitEvent({
                type: 'shopify_push',
                status: 'scheduled',
                appliedFiles: appliedCount,
              });
              console.log(`[V2 Stream] Auto-apply complete: ${appliedCount}/${result.changes.length} files saved, push scheduled`);
            } else {
              console.warn(`[V2 Stream] Auto-apply: 0/${result.changes.length} files saved — all skipped or failed`);
              emitEvent({
                type: 'thinking',
                phase: 'validating',
                label: `Changes tracked but not saved to files — check file IDs`,
              });
            }
          }

          // Build a concise change summary for the UI
          const changeSummaryLines: string[] = [];
          if (result.changes && result.changes.length > 0) {
            const fileNames = [...new Set(result.changes.map(c => c.fileName))];
            for (const name of fileNames.slice(0, 8)) {
              const change = result.changes.find(c => c.fileName === name);
              changeSummaryLines.push(change?.reasoning
                ? `${name}: ${change.reasoning}`
                : `Updated ${name}`);
            }
            if (fileNames.length > 8) changeSummaryLines.push(`...and ${fileNames.length - 8} more file(s)`);
          }

          // ── Token optimization tracking SSE ──────────────────────────
          if (result.usage) {
            const u = result.usage as Record<string, unknown>;
            const cacheHitRate = result.usage.totalInputTokens > 0
              ? (result.usage.totalCacheReadTokens ?? 0) / ((result.usage.totalInputTokens ?? 0) + (result.usage.totalCacheReadTokens ?? 0))
              : 0;
            emitEvent({
              type: 'token_optimization',
              microcompaction: {
                cold: (u.microcompactionColdCount as number) ?? 0,
                rereads: (u.microcompactionRereadCount as number) ?? 0,
                savedTokens: (u.microcompactionTokensSaved as number) ?? 0,
              },
              cache: { hitRate: Math.round(cacheHitRate * 100) / 100 },
              compaction: ((u.compactionEvents as number) ?? 0) > 0,
              activeFlags: (u.activeOptimizations as string[]) ?? [],
            });
          }

          emitEvent({
            type: 'execution_outcome',
            executionId,
            sessionId: body.sessionId ?? null,
            outcome,
            changedFiles,
            needsClarification: Boolean(result.needsClarification),
            changeSummary: changeSummaryLines.length > 0 ? changeSummaryLines.join('\n') : undefined,
            failureReason: result.failureReason ?? undefined,
            suggestedAction: result.suggestedAction ?? undefined,
            failedTool: result.failedTool ?? undefined,
            failedFilePath: result.failedFilePath ?? undefined,
            validationIssues: result.validationIssues ?? undefined,
            checkpointId: result.checkpointId ?? undefined,
            rolledBack: result.rolledBack ?? undefined,
          });

          emitEvent({
            type: 'context_file_loaded',
            loadedFiles: fileContexts.filter((f) => !f.content.startsWith('[')).length,
            loadedTokens: Math.ceil(
              fileContexts
                .filter((f) => !f.content.startsWith('['))
                .reduce((sum, f) => sum + (f.content?.length ?? 0), 0) / 4,
            ),
            totalFiles: fileContexts.length,
          });

          // Flush orphaned tool calls that never got results
          if (pendingToolCalls.size > 0) {
            for (const [toolId, toolName] of pendingToolCalls) {
              emitEvent({
                type: 'tool_result',
                name: toolName,
                id: toolId,
                result: 'Stream ended before tool result was received.',
                isError: true,
              });
            }
            pendingToolCalls.clear();
          }

          emit(formatSSEDone());
        } catch (error) {
          console.error('[V2 Stream] Error:', error);
          if (error instanceof AIProviderError) {
            emit(formatSSEError(error));
          } else {
            const message = error instanceof Error ? error.message : String(error);
            const lower = message.toLowerCase();
            const isTimeoutOrNetwork =
              lower.includes('abort') ||
              lower.includes('timeout') ||
              lower.includes('timed out') ||
              lower.includes('network') ||
              lower.includes('fetch');
            const classified = isTimeoutOrNetwork
              ? classifyNetworkError(error, 'v2-coordinator')
              : new AIProviderError(
                  'UNKNOWN',
                  message,
                  'v2-coordinator',
                  undefined,
                  message.length > 280 ? message.slice(0, 277) + '...' : message
                );
            emit(formatSSEError(classified));
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
