/**
 * V2 Streaming Coordinator — single-stream iterative agent loop.
 *
 * Replaces the two-phase pipeline (PM analysis → Summary) with a single
 * tool-using agent loop: think → tool → observe → repeat.
 *
 * Key differences from v1 (streamAgentLoop in coordinator.ts):
 *   - Single streaming loop — no separate summary phase
 *   - Uses v2 tool definitions (includes `run_specialist` and `run_review`)
 *   - Uses v2 PM prompt (tool-enabled, natural-language output)
 *   - All request modes (ask, code, plan, debug) route through streamV2
 *   - Specialist delegation via `run_specialist` tool during the loop
 *   - Review via `run_review` tool during the loop
 */

import type {
  AgentResult,
  CodeChange,
  FileContext,
  UserPreference,
  ElementHint,
} from '@/lib/types/agent';
import type {
  AIMessage,
  AIToolCompletionResult,
  ToolStreamEvent,
  ToolStreamResult,
  ToolDefinition,
  ToolResult,
  ToolCall as AIToolCall,
} from '@/lib/ai/types';
import { AI_FEATURES } from '@/lib/ai/feature-flags';
import { AIProviderError } from '@/lib/ai/errors';
import { ContextEngine } from '@/lib/ai/context-engine';
import { getAIProvider } from '@/lib/ai/get-provider';
import { isToolProvider } from './base';
import type { AIAction } from './model-router';
import { getProviderForModel, resolveModel } from './model-router';
import { classifyRequest, escalateTier, type RoutingTier } from './classifier';
import { verifyChanges } from './verification';
import { validateChangeSet } from './validation/change-set-validator';
import { enforceRequestBudget } from '@/lib/ai/request-budget';
import {
  createExecution,
  updateExecutionStatus,
  persistExecution,
} from './execution-store';
import { learnFromExecution, extractQueryTerms } from '@/lib/ai/term-mapping-learner';
import { selectV2Tools } from './tools/v2-tool-definitions';
import { executeToolCall, type ToolExecutorContext } from './tools/tool-executor';
import { executeV2Tool, type V2ToolExecutorContext } from './tools/v2-tool-executor';
import {
  V2_PM_SYSTEM_PROMPT,
  V2_CODE_OVERLAY,
  V2_PLAN_OVERLAY,
  V2_DEBUG_OVERLAY,
  V2_ASK_OVERLAY,
} from './prompts/v2-pm-prompt';
import type { LoadContentFn } from '@/lib/supabase/file-loader';

// ── Constants ───────────────────────────────────────────────────────────────

/** Iteration limits per intent mode. Tightened to reduce exploration waste. */
const ITERATION_LIMITS: Record<string, number> = {
  ask: 3,
  code: 8,
  plan: 8,
  debug: 8,
};

/** Total timeout for the entire streamV2 execution. */
const TOTAL_TIMEOUT_MS = 300_000; // 5 minutes

/** Max characters for a single tool result before truncation. */
const MAX_TOOL_RESULT_CHARS = 6_000;

/** No-op — kept for backward compat with benchmark test imports. */
export function resetV2StreamHealth(): void { /* no-op */ }

/**
 * Tools executed server-side — results are fed back into the agent loop.
 * Client tools (propose_code_edit, search_replace, etc.) are forwarded to the UI.
 */
const V2_SERVER_TOOLS = new Set([
  'read_file',
  'search_files',
  'grep_content',
  'glob_files',
  'semantic_search',
  'list_files',
  'get_dependency_graph',
  'run_diagnostics',
  'check_lint',
  'validate_syntax',
  'fetch_url',
  'web_search',
  'theme_check',
  'inspect_element',
  'get_page_snapshot',
  'query_selector',
  'run_specialist',  // v2: specialist delegation is a server tool
  'run_review',      // v2: review is a server tool
]);

/** V2-only tools that require the V2ToolExecutorContext. */
const V2_ONLY_TOOLS = new Set(['run_specialist', 'run_review']);

// ── Module-level ContextEngine ──────────────────────────────────────────────

const contextEngine = new ContextEngine(16_000);

// ── Prompt file extraction ────────────────────────────────────────────────────

/**
 * Extract file references from the user's prompt and resolve them to FileContext.
 * Matches explicit paths (e.g., "product-thumbnail.liquid") and keyword fuzzy match.
 */
function extractPromptMentionedFiles(
  userRequest: string,
  files: FileContext[],
): FileContext[] {
  const matched: FileContext[] = [];
  const matchedIds = new Set<string>();

  // Explicit file paths: anything.liquid, .css, .js, .json, .scss
  const explicitRe = /[\w./-]+\.(liquid|css|js|json|scss)/gi;
  const explicitMatches = userRequest.match(explicitRe) ?? [];
  for (const ref of explicitMatches) {
    const normalized = ref.replace(/\\/g, '/').toLowerCase();
    const file = files.find(
      f =>
        f.fileName.toLowerCase() === normalized ||
        f.path?.toLowerCase() === normalized ||
        f.fileName.toLowerCase().endsWith(normalized),
    );
    if (file && !matchedIds.has(file.fileId)) {
      matched.push(file);
      matchedIds.add(file.fileId);
    }
  }

  // Keyword fuzzy match against file names (2+ keyword hits)
  const stopWords = new Set([
    'the', 'this', 'that', 'with', 'from', 'have', 'been', 'should',
    'would', 'could', 'when', 'what', 'where', 'which', 'their',
    'about', 'after', 'before', 'between', 'each', 'every', 'into',
    'through', 'during', 'using', 'make', 'like', 'also', 'just',
    'only', 'some', 'them', 'than', 'then', 'very', 'well', 'here',
    'there', 'does', 'show', 'create', 'adding', 'find',
  ]);
  const keywords = userRequest
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));

  for (const file of files) {
    if (matchedIds.has(file.fileId)) continue;
    const fn = file.fileName.toLowerCase().replace(/[_.\-]/g, ' ');
    const hits = keywords.filter(kw => fn.includes(kw));
    if (hits.length >= 2) {
      matched.push(file);
      matchedIds.add(file.fileId);
    }
  }

  return matched.slice(0, 6);
}

// ── Fast Edit Path ────────────────────────────────────────────────────────────

/**
 * Detect if a request qualifies for the fast edit path:
 * - Intent mode is 'code'
 * - Tier is SIMPLE
 * - At least one target file is pre-loaded with content
 * - Prompt doesn't contain investigation keywords
 *
 * Fast edit path sets MAX_ITERATIONS=2 and adds a system instruction
 * to complete in a single pass.
 */
function isFastEditEligible(
  intentMode: string,
  tier: RoutingTier,
  userRequest: string,
  preloaded: FileContext[],
): boolean {
  if (intentMode !== 'code') return false;
  if (tier !== 'SIMPLE' && tier !== 'TRIVIAL') return false;

  const hasPreloadedContent = preloaded.some(
    f => f.content && !f.content.startsWith('[') && f.content.length > 10,
  );
  if (!hasPreloadedContent) return false;

  const investigationRe = /\b(find|investigate|debug|diagnose|check|why|trace|root cause|not (?:showing|working|loading|updating)|broken|missing|error)\b/i;
  if (investigationRe.test(userRequest)) return false;

  return true;
}

const FAST_EDIT_SYSTEM_SUFFIX = `

## FAST EDIT MODE

You have ONE turn to complete this task. The target file is pre-loaded in your context.
- Make the edit immediately using search_replace or propose_code_edit.
- Do NOT call read_file, search_files, grep_content, list_files, or glob_files.
- After editing, call check_lint on the modified file.
- Be precise and complete in a single response.`;

/**
 * File Context Rule: Reject code changes to files not loaded in context.
 * Prevents agents from hallucinating changes to files they have not seen.
 * Ported from coordinator.ts for v2 use.
 */
function enforceFileContextRule(
  changes: CodeChange[],
  contextFiles: FileContext[],
  readFiles?: Set<string>,
): { allowed: CodeChange[]; rejected: CodeChange[] } {
  const contextFileNames = new Set(contextFiles.map((f) => f.fileName));
  const contextFileIds = new Set(contextFiles.map((f) => f.fileId));

  const allowed: CodeChange[] = [];
  const rejected: CodeChange[] = [];

  for (const change of changes) {
    const isNewFile = change.fileId.startsWith('new_');
    const inContext = contextFileNames.has(change.fileName) || contextFileIds.has(change.fileId);
    const wasRead = readFiles?.has(change.fileName) || readFiles?.has(change.fileId);
    if (isNewFile || inContext || wasRead) {
      allowed.push(change);
    } else {
      rejected.push(change);
    }
  }

  return { allowed, rejected };
}

// ── Options interface ───────────────────────────────────────────────────────

export interface V2CoordinatorOptions {
  intentMode?: 'code' | 'ask' | 'plan' | 'debug';
  model?: string;
  /** Bypasses ALL model routing (action, tier, agent defaults). For benchmarks. */
  forcedModel?: string;
  /** Internal: forced tier from escalation retry. Skips classification. */
  _tierOverride?: RoutingTier;
  /** Internal: escalation depth counter to prevent infinite recursion. */
  _escalationDepth?: number;
  domContext?: string;
  memoryContext?: string;
  diagnosticContext?: string;
  activeFilePath?: string;
  openTabs?: string[];
  recentMessages?: string[];
  loadContent?: LoadContentFn;
  elementHint?: ElementHint;
  onProgress?: (event: {
    type: string;
    phase?: string;
    subPhase?: string;
    label?: string;
    detail?: string;
    [key: string]: unknown;
  }) => void;
  onContentChunk?: (chunk: string) => void;
  onToolEvent?: (event: {
    type: string;
    name: string;
    id: string;
    input?: Record<string, unknown>;
    result?: string;
    isError?: boolean;
  }) => void;
  onReasoningChunk?: (agent: string, chunk: string) => void;
}

// ── V2 Context Builder ──────────────────────────────────────────────────────

interface V2Context {
  preloaded: FileContext[];
  allFiles: FileContext[];
  manifest: string;
}

/**
 * Build file context for the v2 loop.
 *
 * Uses ContextEngine to select the most relevant files based on the user's
 * request, then hydrates them via loadContent if available. Also builds a
 * file manifest listing all project files with sizes for the agent's awareness.
 */
async function buildV2Context(
  files: FileContext[],
  userRequest: string,
  options: V2CoordinatorOptions,
  tier: RoutingTier = 'SIMPLE',
): Promise<V2Context> {
  // Phase 2: Extract files mentioned in the user prompt
  const promptMentionedFiles = extractPromptMentionedFiles(userRequest, files);

  // TRIVIAL tier: skip full context engine, just use prompt-mentioned files
  if (tier === 'TRIVIAL' && promptMentionedFiles.length > 0) {
    let preloaded = promptMentionedFiles;
    if (options.loadContent && preloaded.length > 0) {
      const idsToHydrate = preloaded.filter(f => !f.content || f.content.startsWith('[')).map(f => f.fileId);
      if (idsToHydrate.length > 0) {
        const hydrated = await options.loadContent(idsToHydrate);
        const hydratedMap = new Map(hydrated.map((f: FileContext) => [f.fileId, f]));
        preloaded = preloaded.map(f => hydratedMap.get(f.fileId) ?? f);
      }
    }
    const manifest = files.length + ' files in project (trivial edit — context skipped)';
    return { preloaded, allFiles: files, manifest };
  }

    // Index all files into the context engine
  contextEngine.indexFiles(files);

  // Select relevant files (top N based on request + active file)
  const result = contextEngine.selectRelevantFiles(
    userRequest,
    options.recentMessages,
    options.activeFilePath,
  );

  let preloaded = result.files;

  // Merge prompt-mentioned files that weren't already selected
  const preloadedIds = new Set(preloaded.map(f => f.fileId));
  for (const pmf of promptMentionedFiles) {
    if (!preloadedIds.has(pmf.fileId)) {
      preloaded.push(pmf);
      preloadedIds.add(pmf.fileId);
    }
  }

  // Hydrate selected files with real content if loadContent is available
  if (options.loadContent && preloaded.length > 0) {
    const idsToHydrate = preloaded
      .filter(f => !f.content || f.content.startsWith('['))
      .map(f => f.fileId);

    if (idsToHydrate.length > 0) {
      const hydrated = await options.loadContent(idsToHydrate);
      const hydratedMap = new Map(hydrated.map((f: FileContext) => [f.fileId, f]));
      preloaded = preloaded.map(f => hydratedMap.get(f.fileId) ?? f);
    }
  }

  // Build compact manifest: show pre-loaded/relevant files in detail, rest as summary
  const promptFileIds = new Set(promptMentionedFiles.map(f => f.fileId));
  const MAX_MANIFEST_ENTRIES = 50;

  const relevantFiles = files.filter(
    f => promptFileIds.has(f.fileId) || preloadedIds.has(f.fileId),
  );
  const otherFiles = files.filter(
    f => !promptFileIds.has(f.fileId) && !preloadedIds.has(f.fileId),
  );
  // Sort others alphabetically, take top N
  otherFiles.sort((a, b) => a.fileName.localeCompare(b.fileName));
  const shownOthers = otherFiles.slice(0, MAX_MANIFEST_ENTRIES - relevantFiles.length);

  const manifestLines = [
    ...relevantFiles.map(f => `  * ${f.fileName} (${f.fileType}) [pre-loaded]`),
    ...shownOthers.map(f => `  ${f.fileName} (${f.fileType})`),
  ];
  if (otherFiles.length > shownOthers.length) {
    manifestLines.push(`  ... and ${otherFiles.length - shownOthers.length} more files`);
  }
  const manifest = `${files.length} files in project:\n${manifestLines.join('\n')}`;

  return { preloaded, allFiles: files, manifest };
}

// ── Multi-turn compression ──────────────────────────────────────────────────

/**
 * Compress old tool results to save tokens in later iterations.
 * Replaces verbose tool results from earlier iterations with short summaries,
 * keeping only the most recent iteration's results intact.
 */
function compressOldToolResults(messages: AIMessage[]): void {
  // Find all user messages with __toolResults
  const toolResultMsgIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i] as AIMessage & { __toolResults?: unknown[] };
    if (msg.role === 'user' && msg.__toolResults) {
      toolResultMsgIndices.push(i);
    }
  }

  // Keep only the last tool result message intact; compress older ones
  if (toolResultMsgIndices.length <= 1) return;

  for (let k = 0; k < toolResultMsgIndices.length - 1; k++) {
    const idx = toolResultMsgIndices[k];
    const msg = messages[idx] as AIMessage & { __toolResults?: Array<{ content?: string; type?: string; tool_use_id?: string }> };
    if (!msg.__toolResults) continue;

    for (const block of msg.__toolResults) {
      if (block.content && block.content.length > 200) {
        block.content = block.content.slice(0, 150) + '\n[... compressed ...]';
      }
    }
  }
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * V2 streaming coordinator — single-pass tool-using agent loop.
 *
 * Processes a user request by iteratively calling an LLM with tool access,
 * executing tools, and feeding results back until the model stops or limits
 * are reached. Streams text and tool events to the client in real time.
 */
export async function streamV2(
  executionId: string,
  projectId: string,
  userId: string,
  userRequest: string,
  files: FileContext[],
  userPreferences: UserPreference[],
  options: V2CoordinatorOptions,
): Promise<AgentResult> {
  createExecution(executionId, projectId, userId, userRequest);
  updateExecutionStatus(executionId, 'in_progress');

  const onProgress = options.onProgress;
  const onContentChunk = options.onContentChunk;
  const onToolEvent = options.onToolEvent;
  const intentMode = options.intentMode ?? 'code';

  console.log(`[V2] Starting for execution ${executionId}, mode=${intentMode}`);

  onProgress?.({
    type: 'thinking',
    phase: 'analyzing',
    subPhase: 'building_context',
    label: 'Building context...',
  });

  try {
    // ── Classify request complexity ─────────────────────────────────
    let tier: RoutingTier = 'SIMPLE';
    if (options._tierOverride) {
      tier = options._tierOverride;
      console.log(`[V2] Tier override: ${tier} (escalation depth=${options._escalationDepth ?? 0})`);
    } else {
      try {
        const classification = await classifyRequest(userRequest, files.length, {
          lastMessageSummary: options.recentMessages?.slice(-1)[0],
          recentMessages: options.recentMessages,
          skipLLM: intentMode === 'ask',
        });
        tier = classification.tier;
        console.log(`[V2] Classified as ${tier} (source=${classification.source}, confidence=${classification.confidence}${intentMode === 'ask' ? ', llm=skipped' : ''})`);
      } catch (err) {
        console.warn('[V2] Classification failed, defaulting to SIMPLE:', err);
      }
    }

    // ── Load learned term mappings (best-effort, cached in context engine)
    if (contextEngine.getTermMappingCount() === 0) {
      try {
        const { loadTermMappings } = await import('@/lib/ai/term-mapping-learner');
        const mappings = await loadTermMappings(projectId);
        if (mappings.length > 0) {
          contextEngine.loadTermMappingsData(mappings);
          console.log(`[V2] Loaded ${mappings.length} term mappings for project`);
        }
      } catch { /* term mappings are best-effort */ }
    }

    // ── Build file context ──────────────────────────────────────────────
    const { preloaded, allFiles, manifest } = await buildV2Context(files, userRequest, options, tier);

    // Format pre-loaded files for the user message
    const fileContents = preloaded
      .filter(f => f.content && !f.content.startsWith('['))
      .map(f => `### ${f.fileName}\n\`\`\`${f.fileType}\n${f.content}\n\`\`\``)
      .join('\n\n');

    // ── Build system prompt (base + mode overlay) ─────────────────────
    let systemPrompt = V2_PM_SYSTEM_PROMPT;
    if (intentMode === 'code') systemPrompt += '\n\n' + V2_CODE_OVERLAY;
    else if (intentMode === 'plan') systemPrompt += '\n\n' + V2_PLAN_OVERLAY;
    else if (intentMode === 'debug') systemPrompt += '\n\n' + V2_DEBUG_OVERLAY;
    else if (intentMode === 'ask') systemPrompt += '\n\n' + V2_ASK_OVERLAY;

    // ── Build initial messages ────────────────────────────────────────
    const systemMsg: AIMessage = { role: 'system', content: systemPrompt };
    if (AI_FEATURES.promptCaching) {
      systemMsg.cacheControl = { type: 'ephemeral', ttl: AI_FEATURES.promptCacheTtl };
    }
    const messages: AIMessage[] = [systemMsg];

    // Conversation history (alternating user/assistant)
    if (options.recentMessages?.length) {
      for (let i = 0; i < options.recentMessages.length; i++) {
        const role = i % 2 === 0 ? 'user' : 'assistant';
        messages.push({
          role: role as 'user' | 'assistant',
          content: options.recentMessages[i],
        });
      }
      // 4th cache breakpoint: mark last history message for caching
      // TTL must be monotonically non-increasing: tools (1h) -> system (1h) -> history (1h) -> files (1h)
      if (AI_FEATURES.promptCaching && messages.length > 1) {
        const lastHistoryMsg = messages[messages.length - 1];
        lastHistoryMsg.cacheControl = { type: 'ephemeral', ttl: AI_FEATURES.promptCacheTtl };
      }
    }

    // User message with file context
    const userMessageParts = [
      userRequest,
      '',
      ...(options.memoryContext ? [options.memoryContext, ''] : []),
      ...(options.domContext ? [options.domContext, ''] : []),
      ...(options.diagnosticContext ? [`## DIAGNOSTICS:\n${options.diagnosticContext}`, ''] : []),
      '## PRE-LOADED FILES:',
      preloaded.length > 0 ? fileContents : '(none)',
      '',
      '## FILE MANIFEST:',
      manifest,
    ];
    // Mark file context message for prompt caching â€” this stays identical across iterations
    const fileContextMsg: AIMessage = { role: 'user', content: userMessageParts.join('\n') };
    if (AI_FEATURES.promptCaching) {
      fileContextMsg.cacheControl = { type: 'ephemeral', ttl: AI_FEATURES.promptCacheTtl };
    }
    messages.push(fileContextMsg);

    // ── Select tools ──────────────────────────────────────────────────
    const hasPreview = !!options.domContext;
    const tools: ToolDefinition[] = selectV2Tools(intentMode, hasPreview, AI_FEATURES.programmaticToolCalling);

    // ── Resolve model (tier-aware) ──────────────────────────────────
    const actionForModel: AIAction =
      intentMode === 'ask' ? 'ask' : intentMode === 'debug' ? 'debug' : 'generate';
    const model = resolveModel({
      action: actionForModel,
      forcedModel: options.forcedModel,
      userOverride: options.model,
      agentRole: 'project_manager',
      tier,
    });
    const providerName = getProviderForModel(model);
    const provider = getAIProvider(providerName as Parameters<typeof getAIProvider>[0]);

    if (!isToolProvider(provider)) {
      throw new AIProviderError(
        'UNKNOWN',
        'Provider does not support tool streaming',
        'coordinator-v2',
      );
    }

    // ── Iteration state ───────────────────────────────────────────────
    let MAX_ITERATIONS = ITERATION_LIMITS[intentMode] ?? 10;
    if (tier === 'TRIVIAL') MAX_ITERATIONS = Math.min(MAX_ITERATIONS, 3);

    // Phase 4: Fast Edit Path â€” bypass exploration for simple pre-loaded edits
    const fastEdit = isFastEditEligible(intentMode, tier, userRequest, preloaded);
    if (fastEdit) {
      MAX_ITERATIONS = tier === 'TRIVIAL' ? 1 : 2;
      systemPrompt += FAST_EDIT_SYSTEM_SUFFIX;
      systemMsg.content = systemPrompt; // Update cached message (strings are immutable)
      console.log('[V2] Fast edit path activated (MAX_ITERATIONS=2)');
      onProgress?.({
        type: 'thinking',
        phase: 'analyzing',
        label: 'Fast edit â€” completing in single pass',
      });
    }
    const startTime = Date.now();
    let iteration = 0;
    let fullText = '';
    const accumulatedChanges: CodeChange[] = [];
    const readFiles = new Set<string>();
    const searchedFiles = new Set<string>();
    let needsClarification = false;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheWriteTokens = 0;
    let ptcContainerId: string | undefined; // PTC: reuse sandbox container across iterations

    onProgress?.({
      type: 'thinking',
      phase: 'analyzing',
      subPhase: 'building_context',
      label: `${tier} tier — using ${model.split('/').pop() ?? model}`,
      metadata: { routingTier: tier },
    });

    // ── Tool executor contexts ────────────────────────────────────────

    // Standard tool executor context (for read_file, search, grep, etc.)
    const toolCtx: ToolExecutorContext = {
      files: allFiles,
      contextEngine,
      projectId,
      userId,
      loadContent: options.loadContent,
    };

    // V2 tool executor context (for run_specialist, run_review)
    const v2ToolCtx: V2ToolExecutorContext = {
      files: allFiles,
      projectId,
      userId,
      executionId,
      userRequest,
      userPreferences,
      accumulatedChanges,
      onCodeChange: (change: CodeChange) => {
        accumulatedChanges.push(change);
        onToolEvent?.({
          type: 'tool_call',
          name: 'propose_code_edit',
          id: `specialist-${Date.now()}`,
          input: {
            filePath: change.fileName,
            newContent: change.proposedContent,
            reasoning: change.reasoning,
          },
        });
      },
      onReasoningChunk: options.onReasoningChunk,
      model: options.model,
      dependencyContext: undefined,
      designContext: undefined,
      memoryContext: options.memoryContext,
      onProgress,
      specialistCallCount: { value: 0 },
      tier,
    };

    // Map of pre-loaded files for read_file short-circuiting
    const preloadedMap = new Map<string, FileContext>();
    for (const f of preloaded.filter(p => p.content && !p.content.startsWith('['))) {
      preloadedMap.set(f.fileId, f);
      preloadedMap.set(f.fileName, f);
      if (f.path) preloadedMap.set(f.path, f);
    }

    // ── Agent loop ────────────────────────────────────────────────────
    while (iteration < MAX_ITERATIONS) {
      if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
        console.warn(`[V2] Timeout after ${iteration} iterations`);
        break;
      }

      // Apply token budget before each iteration
      const budgeted = enforceRequestBudget(messages);

      console.log(
        `[V2] Iteration ${iteration}, messages=${budgeted.messages.length}, truncated=${budgeted.truncated}`,
      );

      // Stream with tools — gate Anthropic-specific features by provider
      const isAnthropic = providerName === 'anthropic';
      const completionOpts: Record<string, unknown> = {
        model,
        maxTokens: intentMode === 'ask' ? 2048 : 4096,
        ...(isAnthropic && ptcContainerId ? { container: ptcContainerId } : {}),
        ...(AI_FEATURES.adaptiveThinking ? {
          thinking: { type: 'adaptive' },
          effort: tier === 'ARCHITECTURAL' ? 'high' : tier === 'COMPLEX' ? 'medium' : 'low',
        } : {}),
        ...(isAnthropic && AI_FEATURES.contextEditing ? {
          contextManagement: {
            edits: [
              ...(AI_FEATURES.adaptiveThinking ? [{
                type: 'clear_thinking_20251015' as const,
                keep: { type: 'thinking_turns' as const, value: 1 },
              }] : []),
              {
                type: 'clear_tool_uses_20250919' as const,
                trigger: { type: 'input_tokens' as const, value: 50_000 },
                keep: { type: 'tool_uses' as const, value: 3 },
                clear_at_least: { type: 'input_tokens' as const, value: 5_000 },
              },
            ],
          },
        } : {}),
      };

      let streamResult: ToolStreamResult;

      try {
        streamResult = await provider.streamWithTools(
          budgeted.messages,
          tools,
          completionOpts,
        );
      } catch (err) {
        console.warn('[V2] Stream creation failed, falling back to batch:', err);
        onProgress?.({
          type: 'thinking',
          phase: 'analyzing',
          label: 'Stream unavailable — using batch mode',
        });
        const batchResult = await provider.completeWithTools(
          budgeted.messages,
          tools,
          completionOpts,
        );
        streamResult = synthesizeBatchAsStream(batchResult);
      }

      // Cache tool results during streaming (keyed by tool_use_id)
      const iterToolResults = new Map<string, { content: string; is_error?: boolean; isPTC?: boolean }>();
      const pendingServerTools: Extract<ToolStreamEvent, { type: 'tool_end' }>[] = [];
      // PTC: tool calls made by the code-execution sandbox
      const pendingPTCTools: Extract<ToolStreamEvent, { type: 'server_tool_use' }>[] = [];
      const reader = streamResult.stream.getReader();

      try {
        while (true) {
          let readResult: ReadableStreamReadResult<ToolStreamEvent>;
          try {
            readResult = await reader.read();
          } catch (streamErr) {
            console.error('[V2] Mid-stream read error:', streamErr);
            break; // Use accumulated results so far
          }
          const { done, value } = readResult;
          if (done) break;

          const event = value as ToolStreamEvent;

          // ── Text streaming ──────────────────────────────────────────
          if (event.type === 'text_delta') {
            fullText += event.text;
            onContentChunk?.(event.text);
          }

          // Forward thinking events to the reasoning UI
          if (event.type === 'thinking_delta') {
            options.onReasoningChunk?.('project_manager', event.text);
          }

          // ── Tool start ──────────────────────────────────────────────
          if (event.type === 'tool_start') {
            onToolEvent?.({
              type: 'tool_start',
              name: event.name,
              id: event.id,
            });
          }

          // ── Tool end ────────────────────────────────────────────────
          if (event.type === 'tool_end') {
            const isServerTool = V2_SERVER_TOOLS.has(event.name);

            if (isServerTool) {
              // Collect server tools for execution after stream iteration
              pendingServerTools.push(event);
            } else {
              // Client-rendered tool — forward to UI
              onToolEvent?.({
                type: 'tool_call',
                name: event.name,
                id: event.id,
                input: event.input,
              });

              // Track clarification requests
              if (event.name === 'ask_clarification') needsClarification = true;

              // Accumulate code changes + update in-memory state
              const syntheticMsg = handleClientTool(
                event,
                files,
                preloadedMap,
                accumulatedChanges,
              );
              iterToolResults.set(event.id, { content: syntheticMsg });
            }
          }

          // ── PTC: server_tool_use — sandbox calling our tools ────────
          if (event.type === 'server_tool_use') {
            pendingPTCTools.push(event);
            onToolEvent?.({
              type: 'tool_start',
              name: `ptc:${event.name}`,
              id: event.id,
            });
          }

          // ── PTC: code_execution_result — sandbox output ─────────────
          if (event.type === 'code_execution_result') {
            const label = event.returnCode === 0 ? 'completed' : `exit ${event.returnCode}`;
            console.log(`[V2-PTC] Code execution ${label}: stdout=${event.stdout.length}B stderr=${event.stderr.length}B`);
            onProgress?.({
              type: 'thinking',
              phase: 'tool_execution',
              label: `Code execution ${label}`,
              detail: event.stderr || undefined,
            });
          }
        }
      } finally {
        reader.releaseLock();
      }

      // ── Execute pending server tools in parallel ──────────────────
      if (pendingServerTools.length > 0) {
        if (pendingServerTools.length > 1) {
          console.log(`[V2] Executing ${pendingServerTools.length} server tools in parallel`);
        }

        await Promise.all(
          pendingServerTools.map(async (evt) => {
            const toolCall: AIToolCall = { id: evt.id, name: evt.name, input: evt.input };
            let toolResult: ToolResult;

            // Short-circuit read_file for pre-loaded files
            const readFileId =
              evt.name === 'read_file' ? (evt.input?.fileId as string) : null;
            const preloadedFile = readFileId ? preloadedMap.get(readFileId) : null;

            if (preloadedFile) {
              toolResult = {
                tool_use_id: evt.id,
                content: preloadedFile.content,
              };
              console.log(
                `[V2] read_file short-circuited: ${preloadedFile.fileName} (pre-loaded)`,
              );
            } else if (V2_ONLY_TOOLS.has(evt.name)) {
              // V2-specific tools: run_specialist, run_review
              try {
                toolResult = await executeV2Tool(toolCall, v2ToolCtx);
              } catch (err) {
                toolResult = {
                  tool_use_id: evt.id,
                  content: `V2 tool execution failed: ${String(err)}`,
                  is_error: true,
                };
              }
            } else {
              // Standard server tools
              try {
                toolResult = await executeToolCall(toolCall, toolCtx);
              } catch (err) {
                toolResult = {
                  tool_use_id: evt.id,
                  content: `Tool execution failed: ${String(err)}`,
                  is_error: true,
                };
              }
            }

            // Track read files for context expansion
            if (evt.name === 'read_file' && !toolResult.is_error) {
              const fileId = evt.input?.fileId as string;
              if (fileId) readFiles.add(fileId);
              const matchedFile = files.find(
                f => f.fileId === fileId || f.fileName === fileId,
              );
              if (matchedFile) readFiles.add(matchedFile.fileName);
            }

            // Track searched files for term mapping learning
            if (
              (evt.name === 'search_files' || evt.name === 'semantic_search' || evt.name === 'grep_content') &&
              !toolResult.is_error
            ) {
              const fileNameMatches = toolResult.content.match(/(?:^|\n)\s*(?:File|Name|path):\s*(\S+)/gi);
              if (fileNameMatches) {
                for (const m of fileNameMatches) {
                  const fp = m.replace(/^.*?:\s*/, '').trim();
                  if (fp) searchedFiles.add(fp);
                }
              }
            }

            // Truncate large results
            const truncatedContent =
              toolResult.content.length > MAX_TOOL_RESULT_CHARS
                ? toolResult.content.slice(0, MAX_TOOL_RESULT_CHARS) +
                  `\n\n... [truncated — showing ${MAX_TOOL_RESULT_CHARS} of ${toolResult.content.length} chars]`
                : toolResult.content;

            iterToolResults.set(evt.id, {
              content: truncatedContent,
              is_error: toolResult.is_error,
            });

            onToolEvent?.({
              type: 'tool_call',
              name: evt.name,
              id: evt.id,
              input: evt.input,
              result: truncatedContent,
              isError: toolResult.is_error,
            });
          }),
        );
      }

      // ── Execute PTC (server_tool_use) tool calls in parallel ────
      if (pendingPTCTools.length > 0) {
        console.log(`[V2-PTC] Executing ${pendingPTCTools.length} programmatic tool call(s)`);
        await Promise.all(
          pendingPTCTools.map(async (evt) => {
            const toolCall: AIToolCall = { id: evt.id, name: evt.name, input: evt.input };
            let toolResult: ToolResult;
            try {
              const readFileId = evt.name === 'read_file' ? (evt.input?.fileId as string) : null;
              const preloadedFile = readFileId ? preloadedMap.get(readFileId) : null;
              if (preloadedFile) {
                toolResult = { tool_use_id: evt.id, content: preloadedFile.content };
              } else {
                toolResult = await executeToolCall(toolCall, toolCtx);
              }
            } catch (err) {
              toolResult = {
                tool_use_id: evt.id,
                content: `PTC tool execution failed: ${String(err)}`,
                is_error: true,
              };
            }
            if (evt.name === 'read_file' && !toolResult.is_error) {
              const fileId = evt.input?.fileId as string;
              if (fileId) readFiles.add(fileId);
            }
            const truncatedContent =
              toolResult.content.length > MAX_TOOL_RESULT_CHARS
                ? toolResult.content.slice(0, MAX_TOOL_RESULT_CHARS) + '\n[truncated]'
                : toolResult.content;
            iterToolResults.set(evt.id, { content: truncatedContent, is_error: toolResult.is_error, isPTC: true });
            onToolEvent?.({
              type: 'tool_call',
              name: `ptc:${evt.name}`,
              id: evt.id,
              input: evt.input,
              result: truncatedContent,
              isError: toolResult.is_error,
            });
          }),
        );
      }

      // ── Track PTC container for sandbox reuse ─────────────────────
      try {
        const containerInfo = await streamResult.getContainer?.();
        if (containerInfo?.id) {
          ptcContainerId = containerInfo.id;
          console.log(`[V2-PTC] Container ${ptcContainerId} (expires ${containerInfo.expires_at})`);
        }
      } catch { /* getContainer may not be available */ }

      // ── Log context editing stats ────────────────────────────────
      try {
        const edits = await streamResult.getContextEdits?.();
        if (edits && edits.length > 0) {
          for (const edit of edits) {
            if (edit.type === 'clear_tool_uses_20250919') {
              console.log(`[V2-ContextEdit] Cleared ${edit.cleared_tool_uses ?? 0} tool use(s), ${edit.cleared_input_tokens ?? 0} tokens (iter ${iteration})`);
            }
            if (edit.type === 'clear_thinking_20251015') {
              console.log(`[V2-ContextEdit] Cleared ${edit.cleared_thinking_turns ?? 0} thinking turn(s), ${edit.cleared_input_tokens ?? 0} tokens (iter ${iteration})`);
            }
          }
        }
      } catch { /* getContextEdits may not be available */ }

      // ── Track token usage for this iteration ────────────────────
      try {
        const usage = await streamResult.getUsage();
        totalInputTokens += usage.inputTokens;
        totalOutputTokens += usage.outputTokens;
        totalCacheReadTokens += usage.cacheReadInputTokens ?? 0;
        totalCacheWriteTokens += usage.cacheCreationInputTokens ?? 0;
        if ((usage.cacheReadInputTokens ?? 0) > 0) {
          console.log(`[V2] Cache hit: ${usage.cacheReadInputTokens} tokens read from cache (iter ${iteration})`);
        }
      } catch { /* getUsage may fail if stream errored */ }
      // ── Check stop reason ─────────────────────────────────────────
      const stopReason = await streamResult.getStopReason();
      const rawBlocks = await streamResult.getRawContentBlocks();

      if (stopReason !== 'tool_use' || iteration >= MAX_ITERATIONS - 1) {
        break;
      }

      // ── Multi-turn: append assistant + tool result messages ────────
      // Filter thinking blocks from multi-turn messages — passing them back degrades quality
      // (per Anthropic docs: "don't pass thinking back in user text blocks")
      const filteredBlocks = rawBlocks.filter(
        (b: unknown) => (b as { type?: string }).type !== 'thinking',
      );
      const assistantMsg = {
        role: 'assistant',
        content: '',
        __toolCalls: filteredBlocks,
      } as unknown as AIMessage;
      messages.push(assistantMsg);

      // Build tool result blocks from cached results
      const toolResultBlocks: unknown[] = [];
      for (const block of rawBlocks) {
        const b = block as { type: string; id?: string };
        if (b.type === 'tool_use' && b.id) {
          const cached = iterToolResults.get(b.id);
          if (cached) {
            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: b.id,
              content: cached.content,
              ...(cached.is_error ? { is_error: true } : {}),
            });
          }
        }
        // PTC: server_tool_use blocks need server_tool_result responses
        if (b.type === 'server_tool_use' && b.id) {
          const cached = iterToolResults.get(b.id);
          if (cached) {
            toolResultBlocks.push({
              type: 'server_tool_result',
              tool_use_id: b.id,
              content: cached.content,
              ...(cached.is_error ? { is_error: true } : {}),
            });
          }
        }
      }

      if (toolResultBlocks.length > 0) {
        const toolResultMsg = {
          role: 'user',
          content: '',
          __toolResults: toolResultBlocks,
        } as unknown as AIMessage;
        messages.push(toolResultMsg);
      }

      // Compress old tool results to save tokens in later iterations
      // Skip when context editing is active (API handles it server-side)
      if (!AI_FEATURES.contextEditing) {
        compressOldToolResults(messages);
      }

      iteration++;
    }

    // ── EPIC 2a: Auto-review gate ──────────────────────────────────────────
    const needsAutoReview = (
      (tier === 'COMPLEX' || tier === 'ARCHITECTURAL') ||
      (tier !== 'TRIVIAL' && tier !== 'SIMPLE' && (
        accumulatedChanges.length >= 3 ||
        accumulatedChanges.some(c =>
          c.fileName.startsWith('templates/') ||
          c.fileName === 'layout/theme.liquid' ||
          c.proposedContent.includes('{% schema %}')
        )
      ))
    );
    if (needsAutoReview && accumulatedChanges.length > 0) {
      onProgress?.({
        type: 'thinking',
        phase: 'validating',
        label: 'Running auto-review...',
      });
      try {
        const reviewToolCall = {
          id: `auto-review-${Date.now()}`,
          name: 'run_review' as const,
          input: { scope: 'all' },
        };
        const reviewResult = await executeV2Tool(reviewToolCall, v2ToolCtx);
        const reviewContent = reviewResult.content ?? '';
        const reviewFailed = reviewContent.includes('NEEDS CHANGES');
        if (reviewFailed) {
          onProgress?.({
            type: 'thinking',
            phase: 'validating',
            label: 'Review found issues — attempting single fix pass...',
          });
          onProgress?.({
            type: 'diagnostics',
            detail: reviewContent,
          });
        } else {
          onProgress?.({
            type: 'thinking',
            phase: 'validating',
            label: 'Auto-review passed',
          });
        }
      } catch (reviewErr) {
        console.warn('[V2] Auto-review failed:', reviewErr);
      }
    }

    // ── EPIC 2b: Self-verification loop ───────────────────────────────────
    if (accumulatedChanges.length > 0) {
      const verification = verifyChanges(accumulatedChanges, allFiles);
      if (!verification.passed) {
        onProgress?.({
          type: 'thinking',
          phase: 'validating',
          label: `Found ${verification.errorCount} error(s) — self-correcting...`,
        });
        for (const issue of verification.issues.filter(i => i.severity === 'error')) {
          onProgress?.({
            type: 'diagnostics',
            file: issue.file,
            line: issue.line,
            severity: issue.severity,
            message: issue.message,
            category: issue.category,
          });
        }
      } else if (verification.warningCount > 0) {
        onProgress?.({
          type: 'thinking',
          phase: 'validating',
          label: `Verification passed with ${verification.warningCount} warning(s)`,
        });
      }
    }

    // ── EPIC 2c: Change-set validation ────────────────────────────────────
    if (accumulatedChanges.length > 0) {
      const validation = validateChangeSet(accumulatedChanges, allFiles);
      if (!validation.valid) {
        const errorIssues = validation.issues.filter(i => i.severity === 'error');
        const warnIssues = validation.issues.filter(i => i.severity === 'warning');
        onProgress?.({
          type: 'thinking',
          phase: 'validating',
          label: `Change-set: ${errorIssues.length} error(s), ${warnIssues.length} warning(s)`,
        });
        for (const issue of validation.issues) {
          onProgress?.({
            type: 'diagnostics',
            file: issue.file,
            severity: issue.severity,
            message: issue.description,
            category: issue.category,
          });
        }
      }
    }

    // ── EPIC 2d: File context rule enforcement ─────────────────────────────
    if (accumulatedChanges.length > 0) {
      const { allowed, rejected } = enforceFileContextRule(accumulatedChanges, allFiles, readFiles);
      if (rejected.length > 0) {
        console.warn(`[V2] File Context Rule rejected ${rejected.length} change(s)`);
        onProgress?.({
          type: 'thinking',
          phase: 'validating',
          label: `Rejected ${rejected.length} out-of-context change(s)`,
        });
        accumulatedChanges.length = 0;
        accumulatedChanges.push(...allowed);
      }
    }

    // ── Tier escalation on empty results ──────────────────────────────
    // If a code/debug request produced zero changes and no substantive
    // analysis, the tier was likely too low. Escalate and retry once.
    const isCodeMode = intentMode === 'code' || intentMode === 'debug';
    const hasSubstantiveAnalysis = fullText.length > 100;
    const escalationDepth = options._escalationDepth ?? 0;
    const shouldEscalate =
      isCodeMode &&
      accumulatedChanges.length === 0 &&
      !needsClarification &&
      !hasSubstantiveAnalysis &&
      escalationDepth < 1;

    if (shouldEscalate) {
      const nextTier = escalateTier(tier);
      if (nextTier) {
        console.log(`[V2] Zero changes on ${tier} — escalating to ${nextTier}`);
        onProgress?.({
          type: 'thinking',
          phase: 'analyzing',
          label: `Upgrading to ${nextTier} analysis`,
          detail: 'Initial attempt produced no results — retrying with stronger model',
        });

        return streamV2(
          executionId + '-esc',
          projectId,
          userId,
          userRequest,
          files,
          userPreferences,
          {
            ...options,
            _tierOverride: nextTier,
            _escalationDepth: escalationDepth + 1,
          },
        );
      }
    }

    // ── Finalize ──────────────────────────────────────────────────────
    console.log(
      `[V2] Complete after ${iteration + 1} iterations, ${fullText.length} chars, ${accumulatedChanges.length} changes`,
    );

    updateExecutionStatus(executionId, 'completed');
    await persistExecution(executionId);

    // Fire-and-forget: learn term-to-file mappings from this execution
    if (accumulatedChanges.length > 0 && intentMode === 'code') {
      const queryTerms = extractQueryTerms(userRequest);
      if (queryTerms.length > 0) {
        learnFromExecution(projectId, userId, {
          queryTerms,
          editedFiles: accumulatedChanges.map((c) => c.fileName),
          searchedFiles: [...searchedFiles],
        }).catch((err) => console.warn('[V2] Term mapping learning failed:', err));
      }
    }

    return {
      agentType: 'project_manager',
      success: true,
      analysis: fullText,
      changes: accumulatedChanges.length > 0 ? accumulatedChanges : undefined,
      needsClarification,
      directStreamed: true,
      usage: {
        totalInputTokens,
        totalOutputTokens,
        totalCacheReadTokens,
        totalCacheWriteTokens,
        model,
        provider: providerName,
        tier,
      },
    };
  } catch (error) {
    console.error('[V2] Fatal error:', error);

    // ── Error-based tier escalation ──────────────────────────────────
    const errDepth = options._escalationDepth ?? 0;
    if (errDepth < 1) {
      const nextTier = escalateTier(options._tierOverride ?? 'SIMPLE');
      if (nextTier) {
        console.log(`[V2] Error on tier — escalating to ${nextTier}`);
        options.onProgress?.({
          type: 'thinking',
          phase: 'analyzing',
          label: `Upgrading to ${nextTier} analysis`,
          detail: 'Error occurred — retrying with stronger model',
        });

        return streamV2(
          executionId + '-esc',
          projectId,
          userId,
          userRequest,
          files,
          userPreferences,
          {
            ...options,
            _tierOverride: nextTier,
            _escalationDepth: errDepth + 1,
          },
        );
      }
    }

    updateExecutionStatus(executionId, 'failed');
    await persistExecution(executionId).catch(() => {});

    return {
      agentType: 'project_manager',
      success: false,
      analysis:
        error instanceof AIProviderError
          ? `AI provider error: ${error.message}`
          : `Unexpected error: ${String(error)}`,
      error: {
        code: error instanceof AIProviderError ? error.code : 'UNKNOWN',
        message: String(error),
        agentType: 'project_manager',
        recoverable: false,
      },
    };
  }
}

// ── Client tool handler ─────────────────────────────────────────────────────

/**
 * Handle a client-rendered tool event (propose_code_edit, search_replace,
 * create_file, etc.). Accumulates code changes and updates in-memory file
 * state for read-after-write freshness in subsequent iterations.
 *
 * Returns a synthetic message to feed back to the model as a tool result.
 */
function handleClientTool(
  event: Extract<ToolStreamEvent, { type: 'tool_end' }>,
  files: FileContext[],
  preloadedMap: Map<string, FileContext>,
  accumulatedChanges: CodeChange[],
): string {
  if (event.name === 'propose_code_edit') {
    const filePath = event.input?.filePath as string;
    const newContent = event.input?.newContent as string;
    const reasoning = event.input?.reasoning as string;
    const matchedFile = files.find(f => f.fileName === filePath || f.path === filePath);

    accumulatedChanges.push({
      fileId: matchedFile?.fileId ?? '',
      fileName: filePath ?? '',
      originalContent: matchedFile?.content ?? '',
      proposedContent: newContent ?? '',
      reasoning: reasoning ?? '',
      agentType: 'project_manager',
    });

    // Read-after-write: update in-memory state
    if (matchedFile) {
      matchedFile.content = newContent ?? '';
      preloadedMap.set(filePath, matchedFile);
      if (matchedFile.fileId) preloadedMap.set(matchedFile.fileId, matchedFile);
      if (matchedFile.path && matchedFile.path !== filePath) {
        preloadedMap.set(matchedFile.path, matchedFile);
      }
    }

    const lineCount = (newContent ?? '').split('\n').length;
    return `Full rewrite applied to ${filePath} (${lineCount} lines). The file is updated in your context.`;
  }

  if (event.name === 'search_replace') {
    const filePath = event.input?.filePath as string;
    const oldText = event.input?.old_text as string;
    const newText = event.input?.new_text as string;
    const reasoning = event.input?.reasoning as string;
    const matchedFile = files.find(f => f.fileName === filePath || f.path === filePath);
    const currentContent = matchedFile?.content ?? '';
    const replaceIdx = currentContent.indexOf(oldText);
    const proposedContent =
      replaceIdx !== -1
        ? currentContent.slice(0, replaceIdx) +
          newText +
          currentContent.slice(replaceIdx + oldText.length)
        : currentContent;

    accumulatedChanges.push({
      fileId: matchedFile?.fileId ?? '',
      fileName: filePath ?? '',
      originalContent: currentContent,
      proposedContent,
      reasoning: reasoning ?? '',
      agentType: 'project_manager',
    });

    // Read-after-write: update in-memory state
    if (matchedFile && replaceIdx !== -1) {
      matchedFile.content = proposedContent;
      preloadedMap.set(filePath, matchedFile);
      if (matchedFile.fileId) preloadedMap.set(matchedFile.fileId, matchedFile);
      if (matchedFile.path && matchedFile.path !== filePath) {
        preloadedMap.set(matchedFile.path, matchedFile);
      }
    }

    const oldLines = (oldText ?? '').split('\n').length;
    const newLines = (newText ?? '').split('\n').length;
    if (replaceIdx !== -1) {
      return `Edit applied to ${filePath}: replaced ${oldLines} line(s) with ${newLines} line(s). The file is updated in your context.`;
    }
    return `Edit failed for ${filePath}: old_text not found in the current file content. Re-read the file with read_file to see its current content before retrying.`;
  }

  if (event.name === 'create_file') {
    const newFileName = (event.input?.fileName as string) ?? '';
    const newFileContent = (event.input?.content as string) ?? '';

    accumulatedChanges.push({
      fileId: `new_${newFileName}`,
      fileName: newFileName,
      originalContent: '',
      proposedContent: newFileContent,
      reasoning: (event.input?.reasoning as string) ?? '',
      agentType: 'project_manager',
    });

    // Read-after-write: add new file so read_file can find it
    const newFileCtx: FileContext = {
      fileId: `new_${newFileName}`,
      fileName: newFileName,
      fileType: newFileName.endsWith('.liquid')
        ? 'liquid'
        : newFileName.endsWith('.js')
          ? 'javascript'
          : newFileName.endsWith('.css')
            ? 'css'
            : 'other',
      content: newFileContent,
      path: newFileName,
    };
    files.push(newFileCtx);
    preloadedMap.set(newFileName, newFileCtx);
    preloadedMap.set(newFileCtx.fileId, newFileCtx);

    const createLines = newFileContent.split('\n').length;
    return `File ${newFileName} created (${createLines} lines). Available via read_file.`;
  }

  if (event.name === 'write_file') {
    const filePath =
      (event.input?.filePath as string) ?? (event.input?.fileName as string) ?? '';
    const newContent =
      (event.input?.content as string) ?? (event.input?.newContent as string) ?? '';
    const matchedFile = files.find(f => f.fileName === filePath || f.path === filePath);

    accumulatedChanges.push({
      fileId: matchedFile?.fileId ?? '',
      fileName: filePath,
      originalContent: matchedFile?.content ?? '',
      proposedContent: newContent,
      reasoning: (event.input?.reasoning as string) ?? '',
      agentType: 'project_manager',
    });

    if (matchedFile) {
      matchedFile.content = newContent;
      preloadedMap.set(filePath, matchedFile);
      if (matchedFile.fileId) preloadedMap.set(matchedFile.fileId, matchedFile);
      if (matchedFile.path && matchedFile.path !== filePath) {
        preloadedMap.set(matchedFile.path, matchedFile);
      }
    }

    const writeLines = newContent.split('\n').length;
    return `File ${filePath} written (${writeLines} lines). The file is updated in your context.`;
  }

  if (event.name === 'delete_file') {
    const filePath =
      (event.input?.filePath as string) ?? (event.input?.fileName as string) ?? '';
    const matchedFile = files.find(f => f.fileName === filePath || f.path === filePath);

    if (matchedFile) {
      preloadedMap.delete(filePath);
      if (matchedFile.fileId) preloadedMap.delete(matchedFile.fileId);
      if (matchedFile.fileName) preloadedMap.delete(matchedFile.fileName);
      if (matchedFile.path) preloadedMap.delete(matchedFile.path);
      const idx = files.indexOf(matchedFile);
      if (idx !== -1) files.splice(idx, 1);
    }

    return `File ${filePath} deleted.`;
  }

  if (event.name === 'rename_file') {
    const oldPath =
      (event.input?.oldPath as string) ?? (event.input?.filePath as string) ?? '';
    const newPath =
      (event.input?.newPath as string) ?? (event.input?.newName as string) ?? '';
    const matchedFile = files.find(f => f.fileName === oldPath || f.path === oldPath);

    if (matchedFile) {
      // Remove old keys
      preloadedMap.delete(oldPath);
      if (matchedFile.fileId) preloadedMap.delete(matchedFile.fileId);
      if (matchedFile.fileName) preloadedMap.delete(matchedFile.fileName);
      if (matchedFile.path) preloadedMap.delete(matchedFile.path);
      // Update file metadata
      matchedFile.fileName = newPath;
      matchedFile.path = newPath;
      // Re-add with new keys
      preloadedMap.set(newPath, matchedFile);
      if (matchedFile.fileId) preloadedMap.set(matchedFile.fileId, matchedFile);
    }

    return `File renamed from ${oldPath} to ${newPath}.`;
  }

  if (event.name === 'propose_plan') {
    return 'Plan proposed. Waiting for user review.';
  }

  if (event.name === 'ask_clarification') {
    return 'Clarification question sent. Waiting for user response.';
  }

  return `Tool ${event.name} call forwarded to client.`;
}

// ── Batch-to-stream adapter ─────────────────────────────────────────────────

/**
 * Synthesize a ToolStreamResult from a batch AIToolCompletionResult.
 * Used as a fallback when streaming is unavailable.
 */
function synthesizeBatchAsStream(
  batchResult: AIToolCompletionResult,
): ToolStreamResult {
  const events: ToolStreamEvent[] = [];

  // Emit text content as a single text_delta
  if (batchResult.content) {
    events.push({ type: 'text_delta', text: batchResult.content });
  }

  // Emit tool calls as start + end pairs
  if (batchResult.toolCalls) {
    for (const tc of batchResult.toolCalls) {
      events.push({ type: 'tool_start', id: tc.id, name: tc.name });
      events.push({
        type: 'tool_end',
        id: tc.id,
        name: tc.name,
        input: tc.input,
      });
    }
  }

  // Build raw content blocks for multi-turn
  const rawBlocks: unknown[] = [];
  if (batchResult.content) {
    rawBlocks.push({ type: 'text', text: batchResult.content });
  }
  if (batchResult.toolCalls) {
    for (const tc of batchResult.toolCalls) {
      rawBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
    }
  }

  const stream = new ReadableStream<ToolStreamEvent>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(event);
      }
      controller.close();
    },
  });

  return {
    stream,
    getUsage: async () => ({
      inputTokens: batchResult.inputTokens ?? 0,
      outputTokens: batchResult.outputTokens ?? 0,
      cacheCreationInputTokens: (batchResult as unknown as Record<string, number>).cacheCreationInputTokens ?? 0,
      cacheReadInputTokens: (batchResult as unknown as Record<string, number>).cacheReadInputTokens ?? 0,
    }),
    getStopReason: async () => batchResult.stopReason,
    getRawContentBlocks: async () => rawBlocks,
  };
}
