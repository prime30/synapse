/**
 * Tool execution logic for the V2 agent loop.
 *
 * Originally extracted from coordinator-v2.ts lines 2351-3203.
 * Contains executeOneServerTool, executeServerTools (parallel/sequential
 * orchestration + worktree merge + handoff collection), and executePTCTools.
 *
 * Module-level helpers (deriveFilesFromToolInput, groupByFileOwnership) were
 * already present and remain unchanged.
 */

import type { ToolStreamEvent, ToolResult, ToolCall as AIToolCall, AIMessage } from '@/lib/ai/types';
import type { FileContext } from '@/lib/types/agent';
import type { LoopState, CoordinatorContext, MutationFailure } from './coordinator-types';

import { dispatchToolCall } from './tools/dispatcher';
import {
  LOOKUP_TOOL_NAMES,
  MUTATING_TOOL_NAMES,
  MAX_TOOL_RESULT_CHARS,
  READ_LINES_DUPLICATE_PRE_EDIT_LIMIT,
  PRE_EDIT_ENFORCEMENT_ABORT_THRESHOLD,
} from './coordinator-constants';
import {
  buildLookupSignature,
  buildToolResultCardData,
  trackFileReadFn,
  trackFileEditFn,
  normalizeToolResultFn,
  normalizeFileRef,
  buildReadLinesSignature,
} from './coordinator-helpers';
import { isSectionFile, contentMarkupOnly, contentSchemaOnly } from '@/lib/liquid/schema-stripper';
import { AI_FEATURES } from '@/lib/ai/feature-flags';
import { isRereadOfCompactedFile } from './microcompaction';
import { parseReviewToolContent } from './tools/review-parser';
import { extractTargetRegion } from './tools/region-extractor';
import { parseHandoff } from './handoff-parser';
import { mergeMultipleWorktrees } from './worktree/worktree-manager';

// ── Types ────────────────────────────────────────────────────────────────────

export type ToolEndEvent = Extract<ToolStreamEvent, { type: 'tool_end' }>;
export type ServerToolUseEvent = Extract<ToolStreamEvent, { type: 'server_tool_use' }>;

export interface ParallelGroup {
  parallel: ToolEndEvent[];
  sequential: ToolEndEvent[];
}

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Temporary safety gate: virtual worktree isolation is not yet wired into tool
 * execution, so parallel server-tool writes can race on shared state.
 */
export const ENABLE_UNISOLATED_PARALLEL_SERVER_TOOLS = true;

const PATTERN_BASED_TOOLS = new Set([
  'grep_content', 'search_files', 'semantic_search', 'glob_files', 'list_files',
]);

// ── Module-level helpers (fully migrated) ────────────────────────────────────

/**
 * Derive file paths that a tool call targets from its input parameters.
 * Returns [] for pattern-based tools (grep, search) that can't be parallelized.
 */
export function deriveFilesFromToolInput(
  evt: ToolEndEvent,
  files: FileContext[],
): string[] {
  const input = evt.input ?? {};
  if (PATTERN_BASED_TOOLS.has(evt.name)) return [];

  const filePath =
    (input.filePath as string) ??
    (input.file_path as string) ??
    (input.path as string) ??
    (input.fileName as string) ??
    null;

  if (filePath) return [filePath.replace(/\\/g, '/').toLowerCase()];

  const fileId = input.fileId as string | undefined;
  if (fileId) {
    const match = files.find(f => f.fileId === fileId);
    if (match) return [(match.path ?? match.fileName).replace(/\\/g, '/').toLowerCase()];
    return [fileId];
  }

  if (Array.isArray(input.files)) {
    return (input.files as string[]).map(f => f.replace(/\\/g, '/').toLowerCase());
  }

  return [];
}

/**
 * Partition pending server-tool calls into two buckets:
 *   • parallel  – read-only tools whose target files don't overlap with any write (safe to run concurrently)
 *   • sequential – write tools, or tools with file conflicts, or pattern-based tools
 */
export function groupByFileOwnership(tools: ToolEndEvent[], files: FileContext[]): ParallelGroup {
  if (!ENABLE_UNISOLATED_PARALLEL_SERVER_TOOLS) {
    return { parallel: [], sequential: tools };
  }
  const parallel: ToolEndEvent[] = [];
  const sequential: ToolEndEvent[] = [];
  const claimedFiles = new Set<string>();

  for (const tool of tools) {
    const derivedFiles = deriveFilesFromToolInput(tool, files);

    if (derivedFiles.length === 0) {
      sequential.push(tool);
      continue;
    }

    const isMutating = MUTATING_TOOL_NAMES.has(tool.name) || tool.name === 'search_replace';
    const hasConflict = derivedFiles.some(f => claimedFiles.has(f));

    if (hasConflict || isMutating) {
      sequential.push(tool);
      derivedFiles.forEach(f => claimedFiles.add(f));
    } else {
      parallel.push(tool);
      derivedFiles.forEach(f => claimedFiles.add(f));
    }
  }

  return { parallel, sequential };
}

// ── executeOneServerTool ─────────────────────────────────────────────────────

/**
 * Execute a single server-side tool call.
 *
 * All side-effects are applied via `state` mutations and callbacks on `ctx`.
 */
export async function executeOneServerTool(
  evt: ToolEndEvent,
  state: LoopState,
  ctx: CoordinatorContext,
): Promise<void> {
  const toolCall: AIToolCall = { id: evt.id, name: evt.name, input: evt.input };
  let toolResult!: ToolResult;
  const isLookupTool = LOOKUP_TOOL_NAMES.has(evt.name);

  // ── Pre-edit lookup blocking ──────────────────────────────────────────────
  if (
    ctx.intentMode === 'code' &&
    !state.hasAttemptedEdit &&
    isLookupTool
  ) {
    if (state.forceNoLookupUntilEdit) {
      toolResult = {
        tool_use_id: evt.id,
        content:
          `Lookup blocked (${evt.name}) until an edit attempt occurs. ` +
          'Use search_replace, propose_code_edit, create_file, run_specialist, or ask_clarification.',
        is_error: true,
      };
      state.iterToolResults.set(evt.id, { content: toolResult.content, is_error: true });
      ctx.onToolEvent?.({
        type: 'tool_call',
        name: evt.name,
        id: evt.id,
        input: evt.input,
        result: toolResult.content,
        isError: true,
      });
      ctx.onToolEvent?.({
        type: 'tool_result',
        name: evt.name,
        id: evt.id,
        result: toolResult.content,
        isError: true,
      });
      ctx.onToolEvent?.({
        type: 'tool_error',
        name: evt.name,
        id: evt.id,
        error: toolResult.content,
        recoverable: true,
      });
      state.totalToolCalls += 1;
      return;
    }

    state.preEditLookupBlockedCount += 1;
    if (state.preEditLookupBlockedCount > state.preEditLookupBudget) {
      toolResult = {
        tool_use_id: evt.id,
        content:
          `Pre-edit lookup budget exceeded (${state.preEditLookupBlockedCount}/${state.preEditLookupBudget}). ` +
          'Proceed to an edit tool, run_specialist, or ask_clarification.',
        is_error: true,
      };
      state.iterToolResults.set(evt.id, { content: toolResult.content, is_error: true });
      ctx.onToolEvent?.({
        type: 'tool_call',
        name: evt.name,
        id: evt.id,
        input: evt.input,
        result: toolResult.content,
        isError: true,
      });
      ctx.onToolEvent?.({
        type: 'tool_result',
        name: evt.name,
        id: evt.id,
        result: toolResult.content,
        isError: true,
      });
      ctx.onToolEvent?.({
        type: 'tool_error',
        name: evt.name,
        id: evt.id,
        error: toolResult.content,
        recoverable: true,
      });
      state.totalToolCalls += 1;
      return;
    }
  }

  // ── Lookup deduplication / caching ────────────────────────────────────────
  const lookupSig = LOOKUP_TOOL_NAMES.has(evt.name)
    ? buildLookupSignature(evt.name, evt.input)
    : null;

  if (lookupSig && state.lookupCallVersion.get(lookupSig) === state.contextVersion) {
    const cachedLookup = state.lookupResultCache.get(lookupSig);
    if (cachedLookup && cachedLookup.version === state.contextVersion) {
      toolResult = {
        tool_use_id: evt.id,
        content: cachedLookup.content,
        is_error: cachedLookup.is_error,
      };
      state.iterToolResults.set(evt.id, { content: toolResult.content, is_error: toolResult.is_error });
      ctx.onProgress?.({
        type: 'thinking',
        phase: 'analyzing',
        label: `Reused cached ${evt.name} result`,
      });
      ctx.onToolEvent?.({
        type: 'tool_call',
        name: evt.name,
        id: evt.id,
        input: evt.input,
        result: toolResult.content,
        isError: toolResult.is_error,
      });
      ctx.onToolEvent?.({
        type: 'tool_result',
        name: evt.name,
        id: evt.id,
        result: toolResult.content,
        isError: toolResult.is_error,
      });
      return;
    }
    toolResult = {
      tool_use_id: evt.id,
      content: `Skipped redundant ${evt.name} call (context already sufficient for this turn). Proceed to edit or ask clarification only if needed.`,
    };
    state.iterToolResults.set(evt.id, { content: toolResult.content, is_error: false });
    ctx.onProgress?.({
      type: 'thinking',
      phase: 'analyzing',
      label: `Reusing context — skipped duplicate ${evt.name}`,
    });
    ctx.onToolEvent?.({
      type: 'tool_call',
      name: evt.name,
      id: evt.id,
      input: evt.input,
      result: toolResult.content,
      isError: false,
    });
    ctx.onToolEvent?.({
      type: 'tool_result',
      name: evt.name,
      id: evt.id,
      result: toolResult.content,
      isError: false,
    });
    return;
  }

  // ── Short-circuit read_file for cached tool outputs (B3: large result recovery) ──
  const readFileId =
    evt.name === 'read_file' ? (evt.input?.fileId as string) : null;
  if (readFileId && state.toolOutputCache.has(readFileId)) {
    toolResult = { tool_use_id: evt.id, content: state.toolOutputCache.get(readFileId)! };
    state.iterToolResults.set(evt.id, { content: toolResult.content, is_error: false });
    ctx.onToolEvent?.({
      type: 'tool_call',
      name: evt.name,
      id: evt.id,
      input: evt.input,
      result: toolResult.content.slice(0, 500) + (toolResult.content.length > 500 ? '...' : ''),
      isError: false,
    });
    const cachedCardData = buildToolResultCardData(evt.name, evt.input, toolResult.content);
    ctx.onToolEvent?.({
      type: 'tool_result',
      name: evt.name,
      id: evt.id,
      result: toolResult.content,
      data: cachedCardData ?? undefined,
      isError: false,
    });
    return;
  }

  // ── Short-circuit read_file for pre-loaded files ──────────────────────────
  const preloadedFile = readFileId ? state.preloadedMap.get(readFileId) : null;
  let wasPreloadedReadHit = false;

  if (preloadedFile) {
    wasPreloadedReadHit = true;
    ctx.onToolEvent?.({
      type: 'tool_progress',
      name: 'read_file',
      id: evt.id,
      toolCallId: evt.id,
      progress: { phase: 'reading', detail: preloadedFile.fileName },
    });
    let content = preloadedFile.content;
    const view = String(evt.input?.view ?? 'full');
    if (view !== 'full' && isSectionFile(preloadedFile.fileName || preloadedFile.path || '')) {
      if (view === 'markup') content = contentMarkupOnly(content);
      else if (view === 'schema') content = contentSchemaOnly(content);
    }
    toolResult = {
      tool_use_id: evt.id,
      content,
    };
    console.log(
      `[V2] read_file short-circuited: ${preloadedFile.fileName} (pre-loaded)`,
    );
  } else {
    // ── Intercept search_replace on flagged files ─────────────────────────
    let intercepted = false;
    if (evt.name === 'search_replace') {
      const targetPath = (evt.input?.filePath ?? evt.input?.file_path) as string | undefined;
      if (targetPath && state.proposeOnlyFiles.has(targetPath)) {
        toolResult = {
          tool_use_id: evt.id,
          content: `search_replace is disabled for ${targetPath} after repeated failures. Use edit_lines with exact line numbers instead.`,
          is_error: true,
        };
        intercepted = true;
      }
    }
    if (!intercepted && evt.name === 'read_lines') {
      const signature = buildReadLinesSignature(evt.input as Record<string, unknown> | undefined);
      if (signature) {
        const seen = state.readLinesRangeCallCount.get(signature) ?? 0;
        const duplicatePreEditRead =
          state.currentStrategy === 'GOD_MODE' &&
          !state.hasAttemptedEdit &&
          seen >= READ_LINES_DUPLICATE_PRE_EDIT_LIMIT;
        state.readLinesRangeCallCount.set(signature, seen + 1);
        if (duplicatePreEditRead) {
          toolResult = {
            tool_use_id: evt.id,
            content:
              `Duplicate read_lines blocked for ${signature}. ` +
              'Use edit_lines or read a different range/file from the scout index.',
            is_error: true,
          };
          state.preEditLookupBlockedCount += 1;
          intercepted = true;
        }
      }
    }

    if (!intercepted) {
      const progressDetail = (() => {
        if (evt.name === 'read_file') {
          return { phase: 'reading', detail: String(evt.input?.fileId || evt.input?.path || evt.input?.file_path || '') };
        }
        if (evt.name === 'grep_content' || evt.name === 'search_files') {
          return { phase: 'searching', detail: String(evt.input?.pattern || evt.input?.query || '') };
        }
        if (evt.name === 'search_replace' || evt.name === 'create_file' || evt.name === 'write_file') {
          return { phase: 'writing', detail: String(evt.input?.filePath || evt.input?.path || evt.input?.file_path || '') };
        }
        return { phase: 'executing', detail: `Running ${evt.name}...` };
      })();
      ctx.onToolEvent?.({
        type: 'tool_progress',
        name: evt.name,
        id: evt.id,
        toolCallId: evt.id,
        progress: progressDetail,
      });
      if (ctx.signal?.aborted) {
        toolResult = { tool_use_id: evt.id, content: 'Aborted: client disconnected.', is_error: true };
        state.iterToolResults.set(evt.id, { content: toolResult.content, is_error: true });
        state.totalToolCalls += 1;
        return;
      }
      try {
        toolResult = normalizeToolResultFn(evt.name, await dispatchToolCall(toolCall, ctx.unifiedCtx));
        state.toolSequenceLog.push(evt.name);

        ctx.stuckDetector.recordToolCall(
          evt.name,
          evt.input,
          toolResult.content?.slice(0, 500) ?? '',
          Boolean(toolResult.is_error),
          MUTATING_TOOL_NAMES.has(evt.name),
        );

        // Track microcompaction re-reads
        if (AI_FEATURES.microcompaction && isRereadOfCompactedFile(evt.name, evt.input ?? {}, state.toolSummaryLog)) {
          state.microcompactionStats.rereadCount += 1;
        }

        // Track file interactions for structured memory anchors
        if (!toolResult.is_error) {
          const inputFilePath = (evt.input?.filePath ?? evt.input?.file_path ?? evt.input?.path ?? evt.input?.fileId) as string | undefined;
          if (inputFilePath) {
            if (evt.name === 'read_lines' || evt.name === 'read_chunk' || evt.name === 'extract_region') {
              const start = Number(evt.input?.startLine ?? evt.input?.start_line ?? 0);
              const end = Number(evt.input?.endLine ?? evt.input?.end_line ?? 0);
              trackFileReadFn(state.fileReadLog, inputFilePath, start || undefined, end || undefined);
            } else if (evt.name === 'read_file') {
              trackFileReadFn(state.fileReadLog, inputFilePath);
            } else if (evt.name === 'edit_lines' || evt.name === 'search_replace' || evt.name === 'write_file') {
              trackFileEditFn(state.fileEditLog, inputFilePath);
              const normalizedTarget = normalizeFileRef(inputFilePath);
              for (const key of [...state.readLinesRangeCallCount.keys()]) {
                if (key.startsWith(`${normalizedTarget}:`)) {
                  state.readLinesRangeCallCount.delete(key);
                }
              }
            }
          }
        }

        // Post-dispatch side effects for orchestration tools
        if (evt.name === 'run_review' && !toolResult.is_error) {
          const parsed = parseReviewToolContent(toolResult.content ?? '');
          if (parsed) {
            state.latestReviewResult = parsed;
            ctx.setReviewResult(ctx.executionId, parsed);
          }
          const reviewRejected = (toolResult.content ?? '').includes('NEEDS CHANGES');
          if (reviewRejected) {
            const currentChangeCount = state.accumulatedChanges.length;
            if (currentChangeCount === state.changesAtLastReviewRejection) {
              state.consecutiveReviewRejections++;
            } else {
              state.consecutiveReviewRejections = 1;
            }
            state.changesAtLastReviewRejection = currentChangeCount;
            if (state.consecutiveReviewRejections >= 2) {
              const reviewIssues = state.latestReviewResult?.issues
                ?.map(i => `- [${i.severity}] ${i.file}: ${i.description}`)
                .join('\n') ?? '';
              state.messages.push({
                role: 'user',
                content: `SYSTEM: The review agent has rejected your changes ${state.consecutiveReviewRejections} times with no progress between rejections. This likely means the review is evaluating pre-existing issues or has incomplete context.\n\nReview summary: ${state.latestReviewResult?.summary ?? 'No summary'}\n${reviewIssues ? `\nIssues flagged:\n${reviewIssues}` : ''}\n\nYour changes look structurally correct. Please proceed with committing your current changes as-is and explain to the user what you changed and why the review flagged concerns. Do NOT call run_review again.`,
              } as AIMessage);
              state.consecutiveReviewRejections = 0;
            }
          } else {
            state.consecutiveReviewRejections = 0;
          }
        }
        if (evt.name === 'run_specialist' && !toolResult.is_error) {
          state.hasAttemptedEdit = true;
          state.preEditLookupBlockedCount = 0;
          state.forceNoLookupUntilEdit = false;
          state.executionPhase = 'applyPatch';
          state.contextVersion += 1;
          ctx.invalidateProjectGraphs();
        }
      } catch (err) {
        toolResult = {
          tool_use_id: evt.id,
          content: `Tool execution failed: ${String(err)}`,
          is_error: true,
        };
      }
    }
  }

  // ── Track read files for context expansion and cache full content ────────
  if (evt.name === 'read_file' && !toolResult.is_error) {
    if (!wasPreloadedReadHit) state.filesReadOnDemand++;
    const fileId = evt.input?.fileId as string;
    if (fileId) state.readFiles.add(fileId);
    const matchedFile = ctx.files.find(
      f => f.fileId === fileId || f.fileName === fileId ||
           f.fileName.endsWith(`/${fileId}`) ||
           (f.path && f.path.endsWith(`/${fileId}`)),
    );
    if (matchedFile) {
      state.readFiles.add(matchedFile.fileName);
      if (!toolResult.content.startsWith('Lines ')) {
        matchedFile.content = toolResult.content;
        state.preloadedMap.set(matchedFile.fileName, matchedFile);
        if (matchedFile.path) state.preloadedMap.set(matchedFile.path, matchedFile);
      }
    }
  }

  // ── Track searched files for term mapping learning ────────────────────────
  if (
    (evt.name === 'search_files' || evt.name === 'semantic_search' || evt.name === 'grep_content') &&
    !toolResult.is_error
  ) {
    const fileNameMatches = toolResult.content.match(/(?:^|\n)\s*(?:File|Name|path):\s*(\S+)/gi);
    if (fileNameMatches) {
      for (const m of fileNameMatches) {
        const fp = m.replace(/^.*?:\s*/, '').trim();
        if (fp) state.searchedFiles.add(fp);
      }
    }
  }

  // ── Track failed mutation attempts ────────────────────────────────────────
  if (
    (evt.name === 'search_replace' || evt.name === 'write_file' || evt.name === 'propose_code_edit') &&
    toolResult.is_error
  ) {
    state.failedMutationCount += 1;
    state.debugFixAttemptCount += 1;
    state.hasAttemptedEdit = true;
    state.mutatingAttemptedThisIteration = true;
    state.executionPhase = 'applyPatch';
    state.forceNoLookupUntilEdit = false;

    const failedFilePath = evt.input?.filePath as string | undefined;
    const failedReason: MutationFailure['reason'] =
      toolResult.content.includes('not found in') ? 'old_text_not_found'
      : toolResult.content.includes('File not found') ? 'file_not_found'
      : toolResult.content.includes('valid') ? 'validation_error'
      : 'unknown';
    const prevAttemptCount: number = (state.lastMutationFailure?.filePath === failedFilePath)
      ? (state.lastMutationFailure!.attemptCount + 1)
      : 1;
    const fileContent = failedFilePath
      ? ctx.preloaded.find(f => f.fileName === failedFilePath || f.path === failedFilePath)?.content
      : undefined;
    state.lastMutationFailure = {
      toolName: evt.name as MutationFailure['toolName'],
      filePath: failedFilePath ?? 'unknown',
      reason: failedReason,
      attemptedOldText: (evt.input?.old_text as string) ?? undefined,
      attemptCount: prevAttemptCount,
      fileLineCount: fileContent ? fileContent.split('\n').length : undefined,
    };
  }

  // ── Track edit metrics for mutating tools ─────────────────────────────────
  if (MUTATING_TOOL_NAMES.has(evt.name) || evt.name === 'search_replace') {
    state.editAttempts++;
    state.editToolDistribution[evt.name] = (state.editToolDistribution[evt.name] ?? 0) + 1;
    if (!toolResult.is_error && toolResult.content) {
      const tierMatch = toolResult.content.match(/\[tier:(\d+)\]/);
      if (tierMatch) {
        const tier = parseInt(tierMatch[1], 10);
        state.cascadeDepthSum += tier;
        state.cascadeDepthCount++;
        if (tier === 0) state.editFirstPassSuccess++;
      }
    }
  }

  // ── Auto-lint + inline diagnostics for mutated files ────────────────────
  let inlineDiagnostics = '';
  if (
    (MUTATING_TOOL_NAMES.has(evt.name) || evt.name === 'search_replace' || evt.name === 'create_file') &&
    !toolResult.is_error
  ) {
    const lintFilePath = (evt.input?.filePath ?? evt.input?.path ?? evt.input?.file_path) as string | undefined;
    if (lintFilePath && typeof lintFilePath === 'string') {
      try {
        const lintResult = await dispatchToolCall(
          { id: `auto-lint-${Date.now()}`, name: 'check_lint', input: { fileName: lintFilePath } },
          ctx.unifiedCtx,
        );
        if (lintResult.content && !lintResult.content.includes('No lint errors') && !lintResult.content.includes('no issues')) {
          inlineDiagnostics += `\n\n--- Diagnostics ---\n${lintResult.content}`;
        }
      } catch { /* lint unavailable, continue */ }
    }
    inlineDiagnostics += '\n\nLine numbers in this file may have changed. Re-read with read_lines before further edits to this file.';
    toolResult.content += inlineDiagnostics;
  }

  // ── Truncation for large tool results ─────────────────────────────────────
  const TOOLS_NO_TRUNCATE = AI_FEATURES.microcompaction
    ? new Set<string>()
    : new Set([
        'read_file', 'read_lines', 'read_chunk', 'parallel_batch_read',
        'extract_region', 'get_schema_settings',
        'grep_content', 'semantic_search', 'glob_files',
        'check_lint', 'validate_syntax', 'run_diagnostics', 'theme_check',
        'list_files',
      ]);
  let truncatedContent = toolResult.content;
  if (toolResult.content.length > MAX_TOOL_RESULT_CHARS && !TOOLS_NO_TRUNCATE.has(evt.name)) {
    const SUMMARY_CHARS = 8_000;
    const summary = toolResult.content.slice(0, SUMMARY_CHARS);
    const fullLength = toolResult.content.length;
    const outputId = `tool-output-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    state.toolOutputCache.set(outputId, toolResult.content);
    truncatedContent = `${summary}\n\n... (${fullLength} chars total, showing first ${SUMMARY_CHARS}. Full output available — use read_file with fileId "${outputId}" to see more.)`;
  }

  state.iterToolResults.set(evt.id, {
    content: truncatedContent,
    is_error: toolResult.is_error,
  });
  if (lookupSig && !toolResult.is_error) {
    state.lookupCallVersion.set(lookupSig, state.contextVersion);
    state.lookupResultCache.set(lookupSig, {
      version: state.contextVersion,
      content: truncatedContent,
      is_error: toolResult.is_error,
    });
  }

  ctx.onToolEvent?.({
    type: 'tool_call',
    name: evt.name,
    id: evt.id,
    input: evt.input,
    result: truncatedContent,
    isError: toolResult.is_error,
  });

  const cardData = !toolResult.is_error
    ? buildToolResultCardData(evt.name, evt.input, toolResult.content)
    : undefined;
  ctx.onToolEvent?.({
    type: 'tool_result',
    name: evt.name,
    id: evt.id,
    result: truncatedContent,
    data: cardData ?? undefined,
    isError: toolResult.is_error,
  });

  if (toolResult.is_error) {
    ctx.onToolEvent?.({
      type: 'tool_error',
      name: evt.name,
      id: evt.id,
      error: truncatedContent,
      recoverable: state.failedMutationCount < 3,
    });
  }
  if (!wasPreloadedReadHit) state.totalToolCalls += 1;
}

// ── executeServerTools ───────────────────────────────────────────────────────

/**
 * Execute a batch of server tool calls: parallel tools first (chunked), then
 * sequential tools one by one. After execution, merges virtual worktrees and
 * collects specialist handoff metadata.
 */
export async function executeServerTools(
  parallel: ToolEndEvent[],
  sequential: ToolEndEvent[],
  state: LoopState,
  ctx: CoordinatorContext,
  worktreeIds: string[],
  maxParallel: number,
): Promise<void> {
  // Run non-conflicting tools in parallel, chunked to maxParallel
  if (parallel.length > 0) {
    for (let i = 0; i < parallel.length; i += maxParallel) {
      const chunk = parallel.slice(i, i + maxParallel);
      await Promise.all(chunk.map(evt => executeOneServerTool(evt, state, ctx)));
    }
  }

  // Run file-conflicting / no-file-declared tools sequentially.
  // Inject prior specialist change summaries so later specialists know what earlier ones did.
  const completedSpecialistSummaries: string[] = [];
  for (const evt of sequential) {
    if (evt.name === 'run_specialist' && completedSpecialistSummaries.length > 0) {
      const priorContext = completedSpecialistSummaries.join('\n');
      const enrichedInput = { ...evt.input };
      enrichedInput.task = `${String(enrichedInput.task ?? '')}\n\nPRIOR SPECIALIST CHANGES (coordinate with these):\n${priorContext}`;
      const enrichedEvt = { ...evt, input: enrichedInput };
      await executeOneServerTool(enrichedEvt as typeof evt, state, ctx);
    } else {
      await executeOneServerTool(evt, state, ctx);
    }
    if (evt.name === 'run_specialist') {
      const result = state.iterToolResults.get(evt.id);
      if (result && !result.is_error) {
        completedSpecialistSummaries.push(result.content.slice(0, 500));
      }
    }
  }

  // Merge virtual worktrees and handle conflicts (F1)
  if (worktreeIds.length > 0) {
    const mergeResult = mergeMultipleWorktrees(worktreeIds);
    ctx.onProgress?.({
      type: 'worktree_status' as 'thinking',
      worktrees: [],
      conflicts: mergeResult.conflicts.map((c) => ({ path: c.path })),
    });
    if (mergeResult.conflicts.length > 0) {
      state.messages.push({
        role: 'user',
        content: `SYSTEM: File conflicts detected between parallel specialists:\n${mergeResult.conflicts.map((c) => `- ${c.path} modified by both specialists`).join('\n')}\nResolve these conflicts.`,
      });
    }
  }

  // Collect handoffs from parallel specialist results
  if (parallel.length > 1) {
    const handoffs: Array<{ specialistType: string; handoff: ReturnType<typeof parseHandoff> }> = [];
    for (const evt of parallel) {
      const result = state.iterToolResults.get(evt.id);
      if (result && !result.is_error) {
        const handoff = parseHandoff(result.content);
        if (handoff) {
          handoffs.push({
            specialistType: String(evt.input?.type ?? evt.name),
            handoff,
          });
        }
      }
    }
    if (handoffs.length > 0) {
      const summary = handoffs
        .filter((h): h is typeof h & { handoff: NonNullable<typeof h.handoff> } => h.handoff != null)
        .map(
          (h) =>
            `${h.specialistType}: ${h.handoff.completed ? 'completed' : 'incomplete'}` +
            (h.handoff.filesTouched.length ? `, files: [${h.handoff.filesTouched.join(', ')}]` : '') +
            (h.handoff.concerns.length ? `, concerns: [${h.handoff.concerns.join('; ')}]` : '') +
            (h.handoff.findings.length ? `, findings: [${h.handoff.findings.join('; ')}]` : ''),
        )
        .join('\n');
      state.messages.push({
        role: 'user',
        content: `SYSTEM: Parallel specialists completed:\n${summary}\n\nReview concerns and findings before proceeding.`,
      });
      ctx.onProgress?.({
        type: 'thinking',
        phase: 'reviewing',
        label: `${handoffs.length} specialists completed in parallel`,
        detail: summary,
      });
    }
  }
}

// ── executeParallelTools (convenience wrapper) ───────────────────────────────

/**
 * Convenience wrapper: groups tools by file ownership, then delegates to
 * executeServerTools. Use when caller hasn't pre-split parallel/sequential.
 */
export async function executeParallelTools(
  tools: ToolEndEvent[],
  state: LoopState,
  ctx: CoordinatorContext,
  worktreeIds: string[] = [],
  maxParallel: number = 4,
): Promise<void> {
  const { parallel, sequential } = groupByFileOwnership(tools, ctx.files);
  await executeServerTools(parallel, sequential, state, ctx, worktreeIds, maxParallel);
}

// ── executePTCTools ──────────────────────────────────────────────────────────

/**
 * Execute PTC (Programmatic Tool Calling / server_tool_use) tool calls in
 * parallel. These come from the code-execution sandbox and follow a lighter
 * execution path than regular server tools.
 */
export async function executePTCTools(
  pendingPTCTools: ServerToolUseEvent[],
  state: LoopState,
  ctx: CoordinatorContext,
): Promise<void> {
  if (pendingPTCTools.length === 0) return;

  console.log(`[V2-PTC] Executing ${pendingPTCTools.length} programmatic tool call(s)`);

  await Promise.all(
    pendingPTCTools.map(async (evt) => {
      const toolCall: AIToolCall = { id: evt.id, name: evt.name, input: evt.input };
      let toolResult: ToolResult;
      try {
        const readFileId = evt.name === 'read_file' ? (evt.input?.fileId as string) : null;
        const preloadedFile = readFileId ? state.preloadedMap.get(readFileId) : null;
        if (preloadedFile) {
          ctx.onToolEvent?.({
            type: 'tool_progress',
            name: 'read_file',
            id: evt.id,
            toolCallId: evt.id,
            progress: { phase: 'reading', detail: preloadedFile.fileName },
          });
          let content = preloadedFile.content;
          const view = String(evt.input?.view ?? 'full');
          if (view !== 'full' && isSectionFile(preloadedFile.fileName || preloadedFile.path || '')) {
            if (view === 'markup') content = contentMarkupOnly(content);
            else if (view === 'schema') content = contentSchemaOnly(content);
          }
          toolResult = { tool_use_id: evt.id, content };
        } else {
          const ptcProgressDetail = (() => {
            if (evt.name === 'read_file') return { phase: 'reading', detail: String(evt.input?.fileId || evt.input?.path || '') };
            if (evt.name === 'grep_content' || evt.name === 'search_files') return { phase: 'searching', detail: String(evt.input?.pattern || evt.input?.query || '') };
            if (evt.name === 'search_replace' || evt.name === 'create_file' || evt.name === 'write_file') return { phase: 'writing', detail: String(evt.input?.filePath || evt.input?.path || '') };
            return { phase: 'executing', detail: `Running ${evt.name}...` };
          })();
          ctx.onToolEvent?.({
            type: 'tool_progress',
            name: evt.name,
            id: evt.id,
            toolCallId: evt.id,
            progress: ptcProgressDetail,
          });
          toolResult = normalizeToolResultFn(evt.name, await dispatchToolCall(toolCall, ctx.unifiedCtx));
        }
      } catch (err) {
        toolResult = {
          tool_use_id: evt.id,
          content: `PTC tool execution failed: ${String(err)}`,
          is_error: true,
        };
      }

      if (evt.name === 'read_file' && !toolResult.is_error) {
        const readFileId2 = evt.input?.fileId as string;
        const wasPreloadHit = readFileId2 ? !!state.preloadedMap.get(readFileId2) : false;
        if (!wasPreloadHit) state.filesReadOnDemand++;
        if (readFileId2) state.readFiles.add(readFileId2);
      }
      if (MUTATING_TOOL_NAMES.has(evt.name) && !toolResult.is_error) {
        state.hasAttemptedEdit = true;
        state.mutatingAttemptedThisIteration = true;
        state.executionPhase = 'applyPatch';
        state.contextVersion += 1;
        ctx.invalidateProjectGraphs();
        state.debugFixAttemptCount = 0;

        // Auto-lint PTC mutations (infrastructure — not counted)
        const ptcLintPath = (evt.input?.filePath ?? evt.input?.path ?? evt.input?.file_path) as string | undefined;
        if (ptcLintPath && typeof ptcLintPath === 'string') {
          try {
            const ptcLintResult = await dispatchToolCall(
              { id: `auto-lint-ptc-${Date.now()}`, name: 'check_lint', input: { fileName: ptcLintPath } },
              ctx.unifiedCtx,
            );
            if (ptcLintResult.content && !ptcLintResult.content.includes('No lint errors') && !ptcLintResult.content.includes('no issues')) {
              state.messages.push({
                role: 'user',
                content: `SYSTEM: Lint results for ${ptcLintPath}:\n${ptcLintResult.content}`,
              } as AIMessage);
            }
          } catch { /* lint unavailable */ }
        }
      }
      state.totalToolCalls += 1;

      const TOOLS_NO_TRUNCATE_PTC = AI_FEATURES.microcompaction
        ? new Set<string>()
        : new Set([
            'read_file', 'read_lines', 'read_chunk', 'parallel_batch_read',
            'extract_region', 'get_schema_settings',
            'grep_content', 'semantic_search', 'glob_files',
            'check_lint', 'validate_syntax', 'run_diagnostics', 'theme_check',
            'list_files',
          ]);
      let truncatedContentPTC = toolResult.content;
      if (toolResult.content.length > MAX_TOOL_RESULT_CHARS && !TOOLS_NO_TRUNCATE_PTC.has(evt.name)) {
        const PTC_SUMMARY_CHARS = 8_000;
        const ptcSummary = toolResult.content.slice(0, PTC_SUMMARY_CHARS);
        const ptcFullLen = toolResult.content.length;
        const ptcOutputId = `tool-output-ptc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        state.toolOutputCache.set(ptcOutputId, toolResult.content);
        truncatedContentPTC = `${ptcSummary}\n\n... (${ptcFullLen} chars total, showing first ${PTC_SUMMARY_CHARS}. Full output available — use read_file with fileId "${ptcOutputId}" to see more.)`;
      }
      state.iterToolResults.set(evt.id, { content: truncatedContentPTC, is_error: toolResult.is_error, isPTC: true });
      ctx.onToolEvent?.({
        type: 'tool_call',
        name: `ptc:${evt.name}`,
        id: evt.id,
        input: evt.input,
        result: truncatedContentPTC,
        isError: toolResult.is_error,
      });
      if (toolResult.is_error) {
        ctx.onToolEvent?.({
          type: 'tool_error',
          name: `ptc:${evt.name}`,
          id: evt.id,
          error: truncatedContentPTC,
          recoverable: true,
        });
      }
    }),
  );
}
