/**
 * Flat Streaming Coordinator — single-agent, no orchestration.
 *
 * Default execution path for all requests. One agent gets tools and handles
 * the task end-to-end. No classifier, no PM, no specialist handoff.
 *
 * Key differences from coordinator-v2:
 *   - No classification / tier / strategy selection
 *   - No specialist dispatch or review gates
 *   - Parallel tool execution for independent calls
 *   - Line offset tracking for multi-edit sequences
 *   - Multi-file completion tracking
 *   - Auto-lint after every edit (handled by tool-executor)
 *   - ~15 focused tools (no orchestration tools)
 */

import type {
  AgentResult,
  CodeChange,
  FileContext,
  UserPreference,
} from '@/lib/types/agent';
import type {
  AIMessage,
  ToolStreamEvent,
  ToolDefinition,
} from '@/lib/ai/types';
import { AIProviderError } from '@/lib/ai/errors';
import { getProjectContextEngine } from '@/lib/ai/context-engine';
import { getAIProvider } from '@/lib/ai/get-provider';
import { isToolProvider } from './base';
import { resolveModel, getProviderForModel } from './model-router';
import {
  createExecution,
  updateExecutionStatus,
  persistExecution,
  storeChanges,
  addMessage,
} from './execution-store';
import { verifyChanges, mergeThemeCheckIssues } from './verification';
import { validateChangeSet } from './validation/change-set-validator';
import { runThemeCheck, formatThemeCheckResult } from './tools/theme-check';
import { estimateTokens } from '@/lib/ai/token-counter';
import { persistToolTurn } from '@/lib/ai/message-persistence';
import { recordTierMetrics } from '@/lib/telemetry/tier-metrics';
import { selectFlatTools } from './tools/v2-tool-definitions';
import { type ToolExecutorContext } from './tools/tool-executor';
import { type V2ToolExecutorContext } from './tools/v2-tool-executor';
import { dispatchToolCall, type UnifiedToolContext } from './tools/dispatcher';
import { FileStore } from './tools/file-store';
import { matchKnowledgeModules, buildKnowledgeBlock } from './knowledge/module-matcher';
import { buildUnifiedStyleProfile } from '@/lib/ai/style-profile-builder';
import { getFrameworkInstructions } from './theme-map/framework-instructions';
import { enforceRequestBudget } from '@/lib/ai/request-budget';
import { recordHistogram } from '@/lib/observability/metrics';
import { createCheckpoint, restoreCheckpoint } from '@/lib/checkpoints/checkpoint-service';
import { createDeadlineTracker, isBackgroundResumeEnabled } from '@/lib/agents/checkpoint';
import type { V2CoordinatorOptions } from './coordinator-v2';

// Re-export the options type so the route can import from either coordinator
export type { V2CoordinatorOptions as FlatCoordinatorOptions };

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 40;
const MAX_CORRECTION_ATTEMPTS = 2;
const TOTAL_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes (flat should be faster)
const KNOWLEDGE_BUDGET_TOKENS = 8000;
const FIRST_EDIT_SLA_TOOL_CALLS = 12;
const MULTI_EDIT_REREAD_THRESHOLD = 3;

const MUTATING_TOOL_NAMES = new Set([
  'search_replace',
  'create_file',
  'edit_lines',
  'write_file',
  'delete_file',
  'rename_file',
]);

// ── Line Offset Tracking ─────────────────────────────────────────────────────

interface LineOffsetTracker {
  offsets: Map<string, number>;
  editCounts: Map<string, number>;
}

function createLineOffsetTracker(): LineOffsetTracker {
  return { offsets: new Map(), editCounts: new Map() };
}

function adjustLineNumbers(
  tracker: LineOffsetTracker,
  filePath: string,
  startLine: number,
  endLine: number,
): { startLine: number; endLine: number } {
  const offset = tracker.offsets.get(filePath) || 0;
  return { startLine: startLine + offset, endLine: endLine + offset };
}

function recordEdit(
  tracker: LineOffsetTracker,
  filePath: string,
  oldStartLine: number,
  oldEndLine: number,
  newLineCount: number,
): void {
  const linesRemoved = oldEndLine - oldStartLine + 1;
  const delta = newLineCount - linesRemoved;
  tracker.offsets.set(filePath, (tracker.offsets.get(filePath) || 0) + delta);
  tracker.editCounts.set(filePath, (tracker.editCounts.get(filePath) || 0) + 1);
}

function shouldNudgeReread(tracker: LineOffsetTracker, filePath: string): boolean {
  return (tracker.editCounts.get(filePath) || 0) >= MULTI_EDIT_REREAD_THRESHOLD;
}

// ── Parallel Tool Execution ──────────────────────────────────────────────────

interface ToolEndEvent {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

function classifyToolBatch(tools: ToolEndEvent[]): {
  parallel: ToolEndEvent[];
  sequential: ToolEndEvent[];
} {
  const parallel: ToolEndEvent[] = [];
  const sequential: ToolEndEvent[] = [];
  const claimedFiles = new Set<string>();

  for (const tool of tools) {
    const filePath = String(tool.input.filePath ?? tool.input.fileName ?? '');

    if (MUTATING_TOOL_NAMES.has(tool.name) && filePath) {
      if (claimedFiles.has(filePath)) {
        sequential.push(tool);
      } else {
        parallel.push(tool);
        claimedFiles.add(filePath);
      }
    } else if (MUTATING_TOOL_NAMES.has(tool.name)) {
      sequential.push(tool);
    } else {
      parallel.push(tool);
    }
  }

  return { parallel, sequential };
}

// ── Multi-File Completion Tracking ───────────────────────────────────────────

function extractTargetFiles(userRequest: string, files: FileContext[]): Set<string> {
  const targets = new Set<string>();
  const fileNames = files.map(f => f.fileName || f.path || '');

  for (const name of fileNames) {
    if (!name) continue;
    const baseName = name.split('/').pop() || name;
    if (
      userRequest.toLowerCase().includes(baseName.toLowerCase()) ||
      userRequest.includes(name)
    ) {
      targets.add(name);
    }
  }

  return targets;
}

// ── Context Building ─────────────────────────────────────────────────────────

async function buildFlatContext(
  projectId: string,
  files: FileContext[],
  userRequest: string,
  options: V2CoordinatorOptions,
  onProgress?: (event: { type: string; [key: string]: unknown }) => void,
): Promise<{
  preloaded: FileContext[];
  allFiles: FileContext[];
  manifest: string;
  scoutBrief: string;
  knowledgeBlock: string;
  framework?: string;
  frameworkInstructions?: string;
}> {
  const contextEngine = getProjectContextEngine(projectId);

  await contextEngine.indexFiles(files);

  const contextResult = await contextEngine.selectRelevantFilesWithSemantics(
    projectId,
    userRequest,
    options.recentMessages,
    options.activeFilePath,
  );

  const preloaded = contextResult.files.length > 0 ? contextResult.files : files.slice(0, 15);

  if (options.loadContent && preloaded.length > 0) {
    const idsToHydrate = preloaded
      .filter(f => !f.content || f.content.startsWith('['))
      .map(f => f.fileId);
    if (idsToHydrate.length > 0) {
      try {
        const hydrated = await options.loadContent(idsToHydrate);
        const contentMap = new Map(hydrated.map(h => [h.fileId, h.content]));
        for (const f of preloaded) {
          const newContent = contentMap.get(f.fileId);
          if (newContent) f.content = newContent;
        }
      } catch (err) {
        console.error('[Flat] loadContent hydration failed for fileIds:', idsToHydrate.slice(0, 5), err);
      }
    }
  }

  for (const f of preloaded) {
    if (f.content && !f.content.startsWith('[')) {
      onProgress?.({
        type: 'context_file_loaded',
        path: f.fileName || f.path || f.fileId,
        tokenCount: Math.ceil((f.content?.length ?? 0) / 4),
      });
    }
  }

  const manifest = files
    .map(f => {
      const name = f.fileName || f.path || f.fileId;
      const size = f.content?.length ?? 0;
      const loaded = preloaded.some(p => p.fileId === f.fileId) ? ' [loaded]' : '';
      return `  ${name} (${size} chars)${loaded}`;
    })
    .join('\n');

  // Build scout brief from theme map if available
  let scoutBrief = '';
  let framework: string | undefined;
  try {
    const { lookupThemeMap, formatLookupResult, getThemeMap, indexTheme } = await import('./theme-map');
    let themeMap = getThemeMap(projectId);
    if (!themeMap) {
      themeMap = indexTheme(projectId, files);
    }
    if (themeMap) {
      framework = themeMap.framework;
      const lookup = lookupThemeMap(themeMap, userRequest);
      if (lookup.targets.length > 0) {
        scoutBrief = formatLookupResult(lookup);
      }
    }
  } catch {
    // Theme map not available — agent will use search tools
  }

  // Build knowledge block with file-type awareness
  const activeFileTypes = [...new Set(files.map((f) => f.fileType).filter((t) => t !== 'other'))];
  const matchedModules = matchKnowledgeModules(
    userRequest,
    KNOWLEDGE_BUDGET_TOKENS,
    undefined,
    undefined,
    undefined,
    activeFileTypes,
  );
  const knowledgeBlock = buildKnowledgeBlock(matchedModules);

  const frameworkInstructions = framework ? getFrameworkInstructions(framework) : '';
  return { preloaded, allFiles: files, manifest, scoutBrief, knowledgeBlock, framework, frameworkInstructions };
}

// ── System Prompt Assembly ───────────────────────────────────────────────────

function buildFlatSystemPrompt(
  intentMode: string,
  manifest: string,
  scoutBrief: string,
  knowledgeBlock: string,
  userPreferences: UserPreference[],
  memoryContext?: string,
  framework?: string,
  frameworkInstructions?: string,
  styleProfileContent?: string,
): string {
  const identity = `You are a Shopify theme development agent. You have direct access to tools for reading, searching, editing, and validating theme files. Complete the user's request end-to-end.`;

  const toolProtocol = `
## Execution Protocol

1. **Read before edit**: Always use read_lines to see the exact current content before making changes. Never edit from memory alone.
2. **Edit with precision**: Use edit_lines for line-number-based edits (preferred) or search_replace for content-based replacements. Lint errors are reported automatically after each edit.
3. **Complete all layers**: If the task involves multiple files (e.g., Liquid template + CSS + JS), edit ALL of them before stopping. Track what you have and haven't edited.
4. **Verify**: After editing, review any lint errors returned with the edit result. Fix errors before moving on.
5. **Search efficiently**: Use grep_content for exact text, semantic_search for concepts. Maximum 2 search calls before taking action.
6. **File size**: For files <200 lines, read_file is fine. For larger files, use read_lines with specific line ranges.`;

  const errorRecovery = `
## Error Recovery

- If search_replace fails (old_text not found), use read_lines to see the exact current content, then retry with edit_lines using line numbers.
- If edit_lines reports line numbers out of range, re-read the file to get current line count.
- If lint errors appear after an edit, fix them immediately before proceeding to other files.
- If a tool returns an error, try an alternative approach. Do not repeat the same failed call.`;

  let modeOverlay = '';
  if (intentMode === 'code') {
    modeOverlay = `
## Mode: Code
You MUST make the requested code changes. Do NOT just explain what you would do — ACT with your editing tools. Do not ask for permission.`;
  } else if (intentMode === 'plan') {
    modeOverlay = `
## Mode: Plan
Analyze the request and propose a plan. Do NOT make code changes unless explicitly asked to proceed.`;
  } else if (intentMode === 'debug') {
    modeOverlay = `
## Mode: Debug
Diagnose the issue by reading files and tracing the rendering chain. Explain what you find and suggest fixes.`;
  } else if (intentMode === 'ask') {
    modeOverlay = `
## Mode: Ask
Answer the user's question about Shopify theme development. Read files as needed to give accurate answers.`;
  }

  const prefBlock = userPreferences.length > 0
    ? `\n## User Preferences\n${userPreferences.map(p => `- ${p.key}: ${p.value}`).join('\n')}`
    : '';

  const memoryBlock = memoryContext ? `\n## Developer Memory\n${memoryContext}` : '';

  return [
    identity,
    toolProtocol,
    errorRecovery,
    modeOverlay,
    knowledgeBlock ? `\n${knowledgeBlock}` : '',
    scoutBrief ? `\n${scoutBrief}` : '',
    framework ? `\nTheme framework: ${framework}` : '',
    frameworkInstructions ? `\nFramework instructions: ${frameworkInstructions}` : '',
    prefBlock,
    memoryBlock,
    `\n## Project Files\n${manifest}`,
    styleProfileContent ? `\n\n${styleProfileContent}` : '',
  ].filter(Boolean).join('\n');
}

// ── Main Entry Point ─────────────────────────────────────────────────────────

export async function streamFlat(
  executionId: string,
  projectId: string,
  userId: string,
  userRequest: string,
  files: FileContext[],
  userPreferences: UserPreference[],
  options: V2CoordinatorOptions,
): Promise<AgentResult> {
  const startTime = Date.now();
  const deadline = isBackgroundResumeEnabled()
    ? createDeadlineTracker(options.deadlineMs ?? Date.now(), 300_000)
    : null;
  const intentMode = options.intentMode || 'code';
  const {
    onProgress,
    onContentChunk,
    onToolEvent,
    onReasoningChunk,
  } = options;

  let model = options.forcedModel || options.model || 'default';
  let providerName = 'anthropic';
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  let totalToolCalls = 0;
  let hasAttemptedEdit = false;
  const needsClarification = false;
  let fullText = '';
  let resumedIteration = 0;
  let resumedChanges: CodeChange[] = [];
  const lineTracker = createLineOffsetTracker();

  // ── Resolve model ──────────────────────────────────────────────────
  try {
    const action: import('./model-router').AIAction = intentMode === 'ask' ? 'ask' : 'generate';
    model = options.forcedModel || resolveModel({
      action,
      tier: options.maxQuality ? 'ARCHITECTURAL' : 'COMPLEX',
      maxQuality: options.maxQuality,
    });
    providerName = getProviderForModel(model);
  } catch {
    model = 'claude-sonnet-4-20250514';
    providerName = 'anthropic';
  }

  const provider = getAIProvider(providerName);
  if (!provider || !isToolProvider(provider)) {
    return {
      agentType: 'project_manager',
      success: false,
      error: { message: 'No tool-capable provider available', code: 'NO_PROVIDER', agentType: 'project_manager', recoverable: false },
      usage: { totalInputTokens: 0, totalOutputTokens: 0, model, provider: providerName, tier: 'COMPLEX' },
    };
  }

  // ── Create execution record ────────────────────────────────────────
  await createExecution(executionId, projectId, userId, userRequest);
  await updateExecutionStatus(executionId, 'in_progress');

  onProgress?.({
    type: 'thinking',
    phase: 'context',
    label: 'Loading context...',
  });

  // ── Build context ──────────────────────────────────────────────────
  const { preloaded, allFiles, manifest, scoutBrief, knowledgeBlock, framework, frameworkInstructions } = await buildFlatContext(
    projectId,
    files,
    userRequest,
    options,
    onProgress,
  );

  onProgress?.({
    type: 'thinking',
    phase: 'context',
    label: `${preloaded.length} files loaded`,
    detail: `${allFiles.length} total files`,
  });

  // ── Auto-checkpoint before editing (non-blocking) ─────────────────
  // Fire checkpoint creation in parallel with the first LLM call.
  // We only await the result at the end when building the AgentResult.
  let checkpointPromise: Promise<string | undefined> | undefined;
  if (intentMode === 'code') {
    const fileIds = preloaded
      .map(f => f.fileId)
      .filter((id): id is string => !!id && !id.startsWith('['));
    if (fileIds.length > 0) {
      const label = `Pre-agent: ${userRequest.slice(0, 50)}${userRequest.length > 50 ? '...' : ''}`;
      const snapshots = preloaded
        .filter(f => f.fileId && !f.fileId.startsWith('[') && f.content && !f.content.startsWith('['))
        .map(f => ({ fileId: f.fileId, fileName: f.fileName, content: f.content }));
      checkpointPromise = createCheckpoint(projectId, label, fileIds, snapshots)
        .then(cp => cp?.id)
        .catch((err) => {
          console.error(`[Flat] Checkpoint creation failed for project ${projectId}:`, err);
          return undefined;
        });
    }
  }

  // ── Resume from checkpoint if available ────────────────────────────
  if (isBackgroundResumeEnabled()) {
    try {
      const { getCheckpoint } = await import('@/lib/agents/checkpoint');
      const checkpoint = await getCheckpoint(executionId);
      if (checkpoint && checkpoint.phase === 'flat_iteration') {
        resumedIteration = checkpoint.iteration ?? 0;
        resumedChanges = checkpoint.accumulatedChanges ?? [];
        if (checkpoint.dirtyFileIds.length > 0 && options.loadContent) {
          try {
            const hydrated = await options.loadContent(checkpoint.dirtyFileIds);
            const contentMap = new Map(hydrated.map(h => [h.fileId, h.content]));
            for (const f of allFiles) {
              const newContent = contentMap.get(f.fileId);
              if (newContent) f.content = newContent;
            }
          } catch { /* best effort */ }
        }
        console.log(`[Flat] Resuming from checkpoint: iteration=${resumedIteration}, changes=${resumedChanges.length}`);
      }
    } catch { /* no checkpoint — fresh run */ }
  }

  const cssKeywords = /\b(style|css|color|font|spacing|theme|responsive|layout)\b/i;
  const skipStyleProfile = !cssKeywords.test(userRequest);
  const styleProfileResult = skipStyleProfile
    ? { content: '' }
    : await buildUnifiedStyleProfile(projectId, userId, allFiles).catch(() => ({ content: '' }));

  const systemPrompt = buildFlatSystemPrompt(
    intentMode,
    manifest,
    scoutBrief,
    knowledgeBlock,
    userPreferences,
    options.memoryContext,
    framework,
    frameworkInstructions,
    styleProfileResult.content,
  );

  // ── Select tools ───────────────────────────────────────────────────
  const tools: ToolDefinition[] = selectFlatTools(intentMode, {
    hasPreview: !!(options.shopifyConnectionId),
    hasShopify: !!(options.shopifyConnectionId),
  });

  // ── Build messages ─────────────────────────────────────────────────
  const messages: AIMessage[] = [];

  // System prompt
  messages.push({ role: 'system', content: systemPrompt } as AIMessage);

  // Inject conversation history if available
  if (options.recentHistory && options.recentHistory.length > 0) {
    messages.push(...options.recentHistory);
  } else if (options.recentMessages && options.recentMessages.length > 0) {
    for (const msg of options.recentMessages) {
      messages.push({ role: 'user', content: msg } as AIMessage);
    }
  }

  // Preloaded file context
  if (preloaded.length > 0) {
    const fileContext = preloaded
      .filter(f => f.content && !f.content.startsWith('['))
      .slice(0, 10)
      .map(f => {
        const name = f.fileName || f.path || f.fileId;
        const content = f.content.length > 15000
          ? f.content.slice(0, 15000) + `\n... [truncated, use read_lines for full content]`
          : f.content;
        return `### ${name}\n\`\`\`\n${content}\n\`\`\``;
      })
      .join('\n\n');

    messages.push({
      role: 'user',
      content: `Here are the relevant theme files:\n\n${fileContext}\n\nUser request: ${userRequest}`,
    } as AIMessage);
  } else {
    messages.push({
      role: 'user',
      content: userRequest,
    } as AIMessage);
  }

  // ── Accumulated changes (seeded from checkpoint on resume) ─────────
  const accumulatedChanges: CodeChange[] = [...resumedChanges];

  if (resumedChanges.length > 0) {
    messages.push({
      role: 'user',
      content: `SYSTEM: This is a resumed execution. You have already made ${resumedChanges.length} changes: ${resumedChanges.map(c => c.fileName).join(', ')}. Continue from where you left off.`,
    } as AIMessage);
  }

  // ── File Store ─────────────────────────────────────────────────────
  const fileStore = new FileStore(
    allFiles,
    options.loadContent,
    undefined,
    projectId,
    (change) => {
      const existing = accumulatedChanges.findIndex(c => c.fileName === change.fileName);
      const codeChange: CodeChange = {
        fileId: change.fileId,
        fileName: change.fileName,
        originalContent: change.originalContent,
        proposedContent: change.proposedContent,
        reasoning: change.reasoning,
        agentType: 'project_manager',
      };
      if (existing >= 0) {
        accumulatedChanges[existing] = codeChange;
      } else {
        accumulatedChanges.push(codeChange);
      }
      storeChanges(executionId, 'project_manager', [codeChange]);
    },
  );

  // ── Track initial file IDs to detect created files ─────────────────
  const initialFileIds = new Set(allFiles.map(f => f.fileId));

  // ── Tool context ───────────────────────────────────────────────────
  const ioCtx: ToolExecutorContext = {
    files: allFiles,
    contextEngine: getProjectContextEngine(projectId),
    projectId,
    userId,
    loadContent: options.loadContent,
    onProgress: onProgress as unknown as ToolExecutorContext['onProgress'],
    shopifyConnectionId: options.shopifyConnectionId,
    themeId: options.themeId,
    sessionId: options.sessionId,
    fileStore,
    revertHistory: new Map(),
  };

  const orchCtx: V2ToolExecutorContext = {
    files: allFiles,
    projectId,
    userId,
    executionId,
    userRequest,
    userPreferences,
    accumulatedChanges,
    onCodeChange: (change) => {
      onToolEvent?.({
        type: 'tool_result',
        name: 'code_change',
        id: `change-${Date.now()}`,
        data: { fileName: change.fileName, reasoning: change.reasoning },
      });
    },
    onReasoningChunk: onReasoningChunk,
    model,
    loadContent: options.loadContent,
  };

  const unifiedCtx: UnifiedToolContext = { io: ioCtx, orchestration: orchCtx };

  // ── Track target files for completion checking ─────────────────────
  const targetFiles = extractTargetFiles(userRequest, preloaded);
  const editedFiles = new Set<string>();

  // ── Self-correction state ──────────────────────────────────────────
  let correctionAttempts = 0;
  let lastVerificationErrorCount = Infinity;
  let verificationEvidence: AgentResult['verificationEvidence'];
  const validationIssues: AgentResult['validationIssues'] = [];

  // ── Agent loop ─────────────────────────────────────────────────────
  let iteration = resumedIteration;
  let firstTokenMs: number | undefined;
  let consecutiveEmptyIterations = 0;

  onProgress?.({
    type: 'thinking',
    phase: 'analyzing',
    label: 'Analyzing request...',
  });

  // Outer loop: agent runs, then verification, then self-correction if needed
  try {
  correctionLoop: while (correctionAttempts <= MAX_CORRECTION_ATTEMPTS) {

  while (iteration < MAX_ITERATIONS) {
    if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
      console.warn(`[Flat] Timeout after ${iteration} iterations`);
      break;
    }

    // Edit SLA nudge
    if (
      intentMode === 'code' &&
      !hasAttemptedEdit &&
      totalToolCalls >= FIRST_EDIT_SLA_TOOL_CALLS
    ) {
      messages.push({
        role: 'user',
        content:
          `SYSTEM: You have made ${totalToolCalls} tool calls without editing. ` +
          'Stop exploring and make a direct edit now using read_lines -> edit_lines.',
      } as AIMessage);
      onProgress?.({
        type: 'thinking',
        phase: 'editing',
        label: 'Edit SLA reached — making edit',
      });
    }

    // ── Deadline checkpoint: save state and continue in background ──
    if (deadline?.shouldCheckpoint()) {
      await fileStore.flush();
      const dirtyIds = [...fileStore.getDirtyFileIds()];

      const { saveCheckpoint } = await import('@/lib/agents/checkpoint');
      await saveCheckpoint(executionId, {
        schemaVersion: 1,
        executionId,
        phase: 'flat_iteration',
        timestamp: Date.now(),
        iteration,
        dirtyFileIds: dirtyIds,
        accumulatedChanges: [...accumulatedChanges],
        completedSpecialists: [],
      });

      const { enqueueAgentJob, triggerDispatch } = await import('@/lib/tasks/agent-job-queue');
      await enqueueAgentJob({
        executionId,
        projectId,
        userId,
        userRequest,
        options: {
          ...options,
          useFlatPipeline: true,
          onProgress: undefined,
          onContentChunk: undefined,
          onToolEvent: undefined,
        },
      });
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      triggerDispatch(appUrl);

      onProgress?.({ type: 'checkpointed', phase: 'background', label: 'Continuing in background...' });

      const autoCheckpointId = checkpointPromise ? await checkpointPromise : undefined;
      return {
        agentType: 'project_manager' as const,
        success: true,
        analysis: 'Execution checkpointed — continuing in background.',
        needsClarification: false,
        directStreamed: true,
        checkpointed: true,
        checkpointId: autoCheckpointId,
      };
    }

    // ── Budget enforcement ──────────────────────────────────────────
    const budgeted = enforceRequestBudget(messages, 180_000);

    // ── Stream with tools ───────────────────────────────────────────
    let rawStream;
    try {
      rawStream = await provider.streamWithTools(
        budgeted.messages,
        tools,
        {
          model,
          temperature: 0.3,
          maxTokens: 16_000,
          ...(options.images?.length ? { images: options.images } : {}),
        },
      );
    } catch (err) {
      console.error('[Flat] Stream error:', err);
      if (err instanceof AIProviderError && err.retryable && iteration < 3) {
        iteration++;
        continue;
      }
      throw err;
    }

    // ── Process stream events ───────────────────────────────────────
    const reader = rawStream.stream.getReader();
    const pendingTools: ToolEndEvent[] = [];
    const iterToolResults = new Map<string, { content: string; is_error?: boolean }>();
    const rawBlocks: unknown[] = [];
    let iterText = '';
    let iterReasoning = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const evt = value as ToolStreamEvent;

        switch (evt.type) {
          case 'text_delta': {
            iterText += evt.text;
            fullText += evt.text;
            onContentChunk?.(evt.text);
            if (!firstTokenMs) {
              firstTokenMs = Date.now() - startTime;
              recordHistogram('agent.first_token_ms', firstTokenMs).catch(() => {});
            }
            break;
          }

          case 'thinking_delta': {
            iterReasoning += evt.text;
            onReasoningChunk?.('flat', evt.text);
            break;
          }

          case 'tool_start': {
            onToolEvent?.({
              type: 'tool_start',
              name: evt.name,
              id: evt.id,
              reasoning: iterReasoning || undefined,
            });
            iterReasoning = '';
            break;
          }

          case 'tool_end': {
            pendingTools.push({
              id: evt.id,
              name: evt.name,
              input: evt.input,
            });
            rawBlocks.push({
              type: 'tool_use',
              id: evt.id,
              name: evt.name,
              input: evt.input,
            });
            break;
          }

          case 'tool_delta': {
            // Partial JSON — accumulate for streaming UI
            break;
          }

          case 'stream_start': {
            break;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Capture text blocks in rawBlocks
    if (iterText.trim()) {
      rawBlocks.unshift({ type: 'text', text: iterText });
    }

    // Collect usage
    try {
      const usage = await rawStream.getUsage();
      totalInputTokens += usage.inputTokens ?? 0;
      totalOutputTokens += usage.outputTokens ?? 0;
      totalCacheReadTokens += usage.cacheReadInputTokens ?? 0;
      totalCacheWriteTokens += usage.cacheCreationInputTokens ?? 0;
    } catch { /* usage collection non-critical */ }

    onProgress?.({
      type: 'token_budget_update',
      used: totalInputTokens + totalOutputTokens,
      remaining: Math.max(0, MAX_ITERATIONS * 4096 - (totalInputTokens + totalOutputTokens)),
      iteration,
    });

    // ── Execute tools (parallel where safe) ─────────────────────────
    if (pendingTools.length > 0) {
      const { parallel, sequential } = classifyToolBatch(pendingTools);

      onProgress?.({
        type: 'thinking',
        phase: pendingTools.some(t => MUTATING_TOOL_NAMES.has(t.name)) ? 'editing' : 'reading',
        label: `Executing ${pendingTools.length} tool${pendingTools.length > 1 ? 's' : ''}...`,
      });

      // Execute independent tools in parallel
      if (parallel.length > 0) {
        const parallelResults = await Promise.all(
          parallel.map(async (tool) => {
            const toolCall = { id: tool.id, name: tool.name, input: tool.input };

            // Apply line offset adjustments for edit_lines
            if (tool.name === 'edit_lines' && tool.input.filePath && tool.input.startLine) {
              const filePath = String(tool.input.filePath);
              const adjusted = adjustLineNumbers(
                lineTracker,
                filePath,
                Number(tool.input.startLine),
                Number(tool.input.endLine ?? tool.input.startLine),
              );
              toolCall.input = { ...tool.input, startLine: adjusted.startLine, endLine: adjusted.endLine };
            }

            const result = await dispatchToolCall(toolCall, unifiedCtx);
            return { tool, result };
          }),
        );

        for (const { tool, result } of parallelResults) {
          iterToolResults.set(tool.id, { content: result.content, is_error: result.is_error });
          totalToolCalls++;

          if (MUTATING_TOOL_NAMES.has(tool.name) && !result.is_error) {
            hasAttemptedEdit = true;
            const filePath = String(tool.input.filePath ?? tool.input.fileName ?? '');
            if (filePath) editedFiles.add(filePath);

            // Track line offsets for edit_lines
            if (tool.name === 'edit_lines' && tool.input.startLine && tool.input.endLine) {
              const newContent = String(tool.input.newContent ?? '');
              const newLineCount = newContent.split('\n').length;
              recordEdit(
                lineTracker,
                filePath,
                Number(tool.input.startLine),
                Number(tool.input.endLine),
                newLineCount,
              );
            }
          }

          onToolEvent?.({
            type: 'tool_result',
            name: tool.name,
            id: tool.id,
            result: result.content.slice(0, 500),
            isError: result.is_error || false,
          });

          // Auto-lint after mutating tools
          if (MUTATING_TOOL_NAMES.has(tool.name) && !result.is_error) {
            const lintPath = String(tool.input.filePath ?? tool.input.path ?? tool.input.file_path ?? '');
            if (lintPath) {
              try {
                const lintResult = await dispatchToolCall(
                  { id: `auto-lint-${Date.now()}`, name: 'check_lint', input: { fileName: lintPath } },
                  unifiedCtx,
                );
                if (lintResult.content && !lintResult.content.includes('no issues') && !lintResult.content.includes('No lint errors') && !lintResult.content.includes('Syntax valid')) {
                  messages.push({
                    role: 'user',
                    content: `SYSTEM: Lint results for ${lintPath}:\n${lintResult.content}`,
                  } as AIMessage);
                }
              } catch { /* lint unavailable */ }
            }
          }
        }
      }

      // Execute file-conflicting tools sequentially
      for (const tool of sequential) {
        const toolCall = { id: tool.id, name: tool.name, input: tool.input };

        if (tool.name === 'edit_lines' && tool.input.filePath && tool.input.startLine) {
          const filePath = String(tool.input.filePath);
          const adjusted = adjustLineNumbers(
            lineTracker,
            filePath,
            Number(tool.input.startLine),
            Number(tool.input.endLine ?? tool.input.startLine),
          );
          toolCall.input = { ...tool.input, startLine: adjusted.startLine, endLine: adjusted.endLine };
        }

        const result = await dispatchToolCall(toolCall, unifiedCtx);
        iterToolResults.set(tool.id, { content: result.content, is_error: result.is_error });
        totalToolCalls++;

        if (MUTATING_TOOL_NAMES.has(tool.name) && !result.is_error) {
          hasAttemptedEdit = true;
          const filePath = String(tool.input.filePath ?? tool.input.fileName ?? '');
          if (filePath) editedFiles.add(filePath);

          if (tool.name === 'edit_lines' && tool.input.startLine && tool.input.endLine) {
            const newContent = String(tool.input.newContent ?? '');
            const newLineCount = newContent.split('\n').length;
            recordEdit(
              lineTracker,
              filePath,
              Number(tool.input.startLine),
              Number(tool.input.endLine),
              newLineCount,
            );
          }
        }

        onToolEvent?.({
          type: 'tool_result',
          name: tool.name,
          id: tool.id,
          result: result.content.slice(0, 500),
          isError: result.is_error || false,
        });

        // Auto-lint after mutating tools
        if (MUTATING_TOOL_NAMES.has(tool.name) && !result.is_error) {
          const lintPath = String(tool.input.filePath ?? tool.input.path ?? tool.input.file_path ?? '');
          if (lintPath) {
            try {
              const lintResult = await dispatchToolCall(
                { id: `auto-lint-seq-${Date.now()}`, name: 'check_lint', input: { fileName: lintPath } },
                unifiedCtx,
              );
              if (lintResult.content && !lintResult.content.includes('no issues') && !lintResult.content.includes('No lint errors') && !lintResult.content.includes('Syntax valid')) {
                messages.push({
                  role: 'user',
                  content: `SYSTEM: Lint results for ${lintPath}:\n${lintResult.content}`,
                } as AIMessage);
              }
            } catch { /* lint unavailable */ }
          }
        }
      }

      // Re-read nudge for heavily edited files
      for (const [filePath, count] of Array.from(lineTracker.editCounts.entries())) {
        if (count === MULTI_EDIT_REREAD_THRESHOLD) {
          messages.push({
            role: 'user',
            content:
              `SYSTEM: You have made ${count} edits to ${filePath}. ` +
              `Use read_lines to refresh your view of the current state before the next edit.`,
          } as AIMessage);
        }
      }
    }

    // ── Check stop condition ────────────────────────────────────────
    const stopReason = await rawStream.getStopReason().catch(() => 'end_turn' as const);

    if (stopReason === 'end_turn' && pendingTools.length === 0) {
      // Agent stopped without calling tools

      if (iterText.trim()) {
        consecutiveEmptyIterations = 0;
      } else {
        consecutiveEmptyIterations++;
      }

      // Code mode: nudge if no edits were made
      if (
        intentMode === 'code' &&
        !hasAttemptedEdit &&
        consecutiveEmptyIterations < 2
      ) {
        if (fullText.trim()) {
          messages.push({ role: 'assistant', content: fullText.trim() } as AIMessage);
        }
        messages.push({
          role: 'user',
          content:
            'You stopped without making code changes. This is CODE mode — ' +
            'you MUST make the requested edit. ACT NOW with editing tools.',
        } as AIMessage);
        fullText = '';
        onProgress?.({
          type: 'thinking',
          phase: 'editing',
          label: 'Retrying edit...',
        });
        iteration++;
        continue;
      }

      // Multi-file completion check
      if (
        intentMode === 'code' &&
        hasAttemptedEdit &&
        targetFiles.size > 0
      ) {
        const unedited = Array.from(targetFiles).filter(f => !editedFiles.has(f));
        if (unedited.length > 0 && consecutiveEmptyIterations < 2) {
          messages.push({
            role: 'assistant',
            content: fullText.trim(),
          } as AIMessage);
          messages.push({
            role: 'user',
            content:
              `SYSTEM: You edited some files but missed: ${unedited.join(', ')}. ` +
              'Complete all layers of this change before stopping.',
          } as AIMessage);
          fullText = '';
          iteration++;
          continue;
        }
      }

      break;
    }

    if (stopReason === 'max_tokens') {
      // Model hit token limit — continue in next iteration
      messages.push({ role: 'assistant', content: iterText } as AIMessage);
      messages.push({
        role: 'user',
        content: 'SYSTEM: Your response was truncated. Continue from where you left off.',
      } as AIMessage);
      iteration++;
      continue;
    }

    // ── Multi-turn: inject tool results ─────────────────────────────
    if (pendingTools.length > 0) {
      const assistantMsg = {
        role: 'assistant',
        content: '',
        __toolCalls: rawBlocks,
      } as unknown as AIMessage;
      messages.push(assistantMsg);

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
      }

      if (toolResultBlocks.length > 0) {
        messages.push({
          role: 'user',
          content: '',
          __toolResults: toolResultBlocks,
        } as unknown as AIMessage);
      }

      // Persist tool turn
      if (options.sessionId) {
        persistToolTurn(
          options.sessionId,
          rawBlocks.filter((b: unknown) => {
            if (typeof b !== 'object' || b === null || !('type' in b)) return false;
            return (b as { type: string }).type === 'tool_use';
          }),
          toolResultBlocks.length > 0 ? toolResultBlocks : undefined,
        ).catch((err) => {
          console.error(`[Flat] persistToolTurn failed for session ${options.sessionId}:`, err);
        });
      }
    }

    iteration++;
  }

  // ── Flush file store ───────────────────────────────────────────────
  const flushResult = await fileStore.flush();
  if (flushResult.failedFileIds.length > 0) {
    onProgress?.({
      type: 'thinking',
      phase: 'warning',
      label: `Warning: ${flushResult.failedFileIds.length} file(s) may not have saved`,
    });
  }

  // ── Verification ───────────────────────────────────────────────────
  if (accumulatedChanges.length > 0) {
    const verifyStart = Date.now();

    onProgress?.({
      type: 'thinking',
      phase: 'verifying',
      label: 'Running verification...',
    });

    const verification = verifyChanges(accumulatedChanges, allFiles);

    let themeCheckResult: ReturnType<typeof runThemeCheck> | null = null;
    if (intentMode === 'code') {
      try {
        const projectedFiles = allFiles.map((f) => {
          const change = accumulatedChanges.find(
            c => c.fileName === f.fileName || c.fileName === (f.path ?? ''),
          );
          return { path: f.path ?? f.fileName, content: change ? change.proposedContent : f.content };
        });
        themeCheckResult = runThemeCheck(projectedFiles, undefined, { bypassCache: true });
      } catch {
        // Theme check not critical
      }
    }

    const totalCheckTimeMs = Date.now() - verifyStart;

    verificationEvidence = {
      syntaxCheck: {
        passed: verification.passed,
        errorCount: verification.errorCount,
        warningCount: verification.warningCount,
      },
      themeCheck: themeCheckResult ? {
        passed: themeCheckResult.passed,
        errorCount: themeCheckResult.errorCount,
        warningCount: themeCheckResult.warningCount,
        infoCount: themeCheckResult.issues.filter(i => i.severity === 'info').length,
      } : undefined,
      checkedFiles: accumulatedChanges.map(c => c.fileName),
      totalCheckTimeMs,
    };

    onProgress?.({
      type: 'thinking',
      phase: 'verifying',
      label: `Verification complete (${totalCheckTimeMs}ms)`,
    });

    // Change-set validation
    const validation = validateChangeSet(accumulatedChanges, allFiles);
    if (!validation.valid) {
      const errorIssues = validation.issues.filter(i => i.severity === 'error');
      if (errorIssues.length > 0) {
        validationIssues!.push({
          gate: 'cross_file',
          errors: errorIssues.slice(0, 5).map(i => `${i.file} — ${i.description}`),
          changesKept: true,
        });
      }
    }

    // ── Structural integrity: broken references that would cause render failures ──
    const STRUCTURAL_CATEGORIES = new Set(['snippet_reference', 'template_section', 'asset_reference']);
    const structuralErrors = validation.issues.filter(
      i => i.severity === 'error' && STRUCTURAL_CATEGORIES.has(i.category),
    );

    verificationEvidence!.structuralCheck = structuralErrors.length > 0
      ? {
          passed: false,
          errorCount: structuralErrors.length,
          issues: structuralErrors.map(e => `${e.file}: ${e.description}`),
        }
      : { passed: true, errorCount: 0, issues: [] };

    // ── Self-correction: re-enter agent loop if verification failed ──
    const currentErrorCount = (verification.errorCount || 0) +
      (themeCheckResult?.errorCount || 0) +
      structuralErrors.length;

    if (
      currentErrorCount > 0 &&
      correctionAttempts < MAX_CORRECTION_ATTEMPTS &&
      currentErrorCount <= lastVerificationErrorCount &&
      iteration < MAX_ITERATIONS - 2
    ) {
      const errorDetails: string[] = [];
      if (verification.formatted) errorDetails.push(verification.formatted);
      if (themeCheckResult && themeCheckResult.errorCount > 0) {
        errorDetails.push(formatThemeCheckResult(themeCheckResult));
      }
      if (structuralErrors.length > 0) {
        errorDetails.push(
          '[Structural Integrity — broken references will cause render failures]\n' +
          structuralErrors.map(e => `- ${e.file}: ${e.description}`).join('\n'),
        );
      }

      messages.push({
        role: 'user',
        content:
          `SYSTEM: Your changes have ${currentErrorCount} verification error(s). ` +
          `Fix them before finishing:\n${errorDetails.join('\n\n')}`,
      } as AIMessage);

      correctionAttempts++;
      lastVerificationErrorCount = currentErrorCount;
      consecutiveEmptyIterations = 0;

      onProgress?.({
        type: 'thinking',
        phase: 'self_correcting',
        label: `Fixing ${currentErrorCount} verification error(s) (attempt ${correctionAttempts}/${MAX_CORRECTION_ATTEMPTS})...`,
      });

      continue correctionLoop;
    }
  }

  break correctionLoop;
  } // end correctionLoop
  } catch (fatalErr) {
    // ── Auto-rollback: restore checkpoint if changes were made ──────
    let rolledBack = false;
    const autoCheckpointId = checkpointPromise ? await checkpointPromise : undefined;
    if (autoCheckpointId && accumulatedChanges.length > 0) {
      try {
        const rollbackResult = await restoreCheckpoint(autoCheckpointId);
        rolledBack = rollbackResult.restored > 0;
        console.error(
          `[Flat] Auto-rollback after fatal error: restored=${rollbackResult.restored}, errors=${rollbackResult.errors.length}`,
        );
        onProgress?.({
          type: 'thinking',
          phase: 'warning',
          label: `Changes rolled back (${rollbackResult.restored} file(s) restored)`,
        });
      } catch (rollbackErr) {
        console.error('[Flat] Auto-rollback failed:', rollbackErr);
      }
    }

    const errMsg = fatalErr instanceof Error ? fatalErr.message : String(fatalErr);
    console.error('[Flat] Fatal error during agent loop:', errMsg);

    try { updateExecutionStatus(executionId, 'failed'); } catch { /* best effort */ }

    return {
      agentType: 'project_manager' as const,
      success: false,
      rolledBack,
      analysis: `Error: ${errMsg}${rolledBack ? '. Changes have been rolled back.' : ''}`,
      directStreamed: true,
      checkpointId: autoCheckpointId,
      error: {
        code: 'AGENT_FATAL',
        message: errMsg,
        agentType: 'project_manager' as const,
        recoverable: false,
      },
      usage: {
        totalInputTokens,
        totalOutputTokens,
        totalCacheReadTokens,
        totalCacheWriteTokens,
        model,
        provider: providerName,
        tier: 'FLAT',
      },
    };
  }

  // ── Persist execution ──────────────────────────────────────────────
  await updateExecutionStatus(executionId, 'completed');

  addMessage(executionId, {
    id: `${executionId}-flat-${Date.now()}`,
    executionId,
    fromAgent: 'project_manager',
    toAgent: 'coordinator',
    messageType: 'result',
    payload: { instruction: fullText || 'Task completed.' },
    timestamp: new Date(),
  });

  await persistExecution(executionId).catch((err) => {
    console.warn('[Flat] Execution persistence failed:', err);
  });

  // ── Telemetry ──────────────────────────────────────────────────────
  recordTierMetrics({
    executionId,
    tier: 'COMPLEX',
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    filesPreloaded: preloaded.length,
    filesReadOnDemand: 0,
    iterations: iteration + 1,
    firstTokenMs: firstTokenMs ?? 0,
    totalMs: Date.now() - startTime,
    editSuccess: accumulatedChanges.length > 0,
    pipelineVersion: 'lean',
  }).catch(() => {});

  onProgress?.({
    type: 'thinking',
    phase: 'complete',
    label: accumulatedChanges.length > 0
      ? `Complete — ${accumulatedChanges.length} file(s) edited`
      : 'Complete',
  });

  // ── Resolve deferred checkpoint ────────────────────────────────────
  const autoCheckpointId = checkpointPromise ? await checkpointPromise : undefined;

  // ── Attach created-file IDs to checkpoint for rollback ─────────────
  if (autoCheckpointId) {
    const dirtyIds = [...fileStore.getDirtyFileIds()];
    const createdIds = dirtyIds.filter(id => !initialFileIds.has(id));
    if (createdIds.length > 0) {
      try {
        const { updateCheckpointCreatedFiles } = await import('@/lib/checkpoints/checkpoint-service');
        await updateCheckpointCreatedFiles(autoCheckpointId, createdIds);
      } catch { /* non-blocking */ }
    }
  }

  // ── Return result ──────────────────────────────────────────────────
  return {
    agentType: 'project_manager',
    success: true,
    analysis: fullText || 'Task completed.',
    changes: accumulatedChanges.length > 0 ? accumulatedChanges : undefined,
    needsClarification: accumulatedChanges.length > 0 ? false : needsClarification,
    directStreamed: true,
    usage: {
      totalInputTokens,
      totalOutputTokens,
      totalCacheReadTokens,
      totalCacheWriteTokens,
      model,
      provider: providerName,
      tier: 'FLAT',
    },
    verificationEvidence,
    validationIssues: validationIssues && validationIssues.length > 0 ? validationIssues : undefined,
    checkpointId: autoCheckpointId,
  };
}
