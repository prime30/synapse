/**
 * Coordinator helper functions extracted from coordinator-v2.ts.
 *
 * Pure / side-effect-light utilities used by the V2 streaming coordinator.
 */

import type { AIMessage, ToolResult } from '@/lib/ai/types';
import type { MutationFailure, MemoryAnchorCtx } from './coordinator-types';
import { addMessage } from './execution-store';
import { chunkFile, type ASTChunk } from '@/lib/parsers/ast-chunker';
import { MUTATING_TOOL_NAMES } from './coordinator-constants';

// ── buildCompletionSummary ──────────────────────────────────────────────────

/**
 * Builds a completion summary when a code-mode turn ends with no changes applied.
 * Always produces output — the user must never see an empty failure state.
 * Returns null only if fullText already contains a detailed breakdown.
 */
export function buildCompletionSummary(
  fullText: string,
  toolSequenceLog: string[],
  iterations: number,
  lastFailure: MutationFailure | null,
  hasAttemptedEdit: boolean,
): string | null {
  const lower = fullText.toLowerCase();
  const alreadyHasSummary =
    (lower.includes('**what i tried') && lower.includes('**what went wrong')) ||
    (lower.includes('### what i\'ve changed') && lower.includes('### why'));
  if (alreadyHasSummary) return null;

  const parts: string[] = ['---', ''];

  const editTools = ['search_replace', 'edit_lines', 'write_file', 'propose_code_edit', 'create_file'];
  const readTools = ['read_file', 'read_lines', 'grep_search', 'grep_content', 'list_files', 'search_files'];
  const usedEditTools = [...new Set(toolSequenceLog.filter(t => editTools.includes(t)))];
  const usedReadTools = [...new Set(toolSequenceLog.filter(t => readTools.includes(t)))];
  const toolList = [...usedReadTools, ...usedEditTools];

  if (toolList.length > 0) {
    parts.push(`**What I tried:** ${toolList.join(', ')} across ${iterations} iteration(s).`);
  } else if (iterations > 0) {
    parts.push(`**What I tried:** Analyzed the request over ${iterations} iteration(s) but did not reach a concrete edit.`);
  }

  if (lastFailure) {
    const file = lastFailure.filePath || 'unknown file';
    const reason =
      lastFailure.reason === 'old_text_not_found'
        ? `Could not match the target text in \`${file}\` (${lastFailure.attemptCount} attempt(s)). The file content may differ from what I expected.`
        : lastFailure.reason === 'file_not_found'
          ? `File \`${file}\` was not found in the project.`
          : `Edit rejected for \`${file}\` — ${lastFailure.reason}.`;
    parts.push(`**What went wrong:** ${reason}`);
  } else if (hasAttemptedEdit) {
    parts.push('**What went wrong:** Edits were attempted but none produced a net change (possibly reverted by validation).');
  } else {
    parts.push('**What went wrong:** Could not determine a concrete edit target from the available context.');
  }

  parts.push(
    '**How to proceed:** You can rephrase the request with a specific file or section name, ' +
    'paste the exact code you want changed, or ask me to try a different approach.',
  );

  return '\n\n' + parts.join('\n');
}

// ── buildLookupSignature ────────────────────────────────────────────────────

export function buildLookupSignature(toolName: string, input: Record<string, unknown> | undefined): string | null {
  const payload = input ?? {};
  switch (toolName) {
    case 'read_file': {
      const fileId = String(payload.fileId ?? '').trim().toLowerCase();
      return fileId ? `read_file:${fileId}` : null;
    }
    case 'search_files': {
      const query = String(payload.query ?? '').trim().toLowerCase();
      const max = Number(payload.maxResults ?? 5);
      return query ? `search_files:${query}:${max}` : null;
    }
    case 'grep_content': {
      const pattern = String(payload.pattern ?? '').trim();
      const fp = String(payload.filePattern ?? '').trim().toLowerCase();
      const cs = Boolean(payload.caseSensitive);
      const max = Number(payload.maxResults ?? 50);
      return pattern ? `grep_content:${pattern}:${fp}:${cs}:${max}` : null;
    }
    case 'glob_files': {
      const pattern = String(payload.pattern ?? '').trim().toLowerCase();
      return pattern ? `glob_files:${pattern}` : null;
    }
    case 'semantic_search': {
      const query = String(payload.query ?? '').trim().toLowerCase();
      const limit = Number(payload.limit ?? 5);
      return query ? `semantic_search:${query}:${limit}` : null;
    }
    case 'list_files':
      return 'list_files';
    case 'get_dependency_graph': {
      const fileId = String(payload.fileId ?? '').trim().toLowerCase();
      return fileId ? `get_dependency_graph:${fileId}` : null;
    }
    default:
      return null;
  }
}

// ── compressOldToolResults ──────────────────────────────────────────────────

/**
 * Compress old tool results to save tokens in later iterations.
 * Replaces verbose tool results from earlier iterations with short summaries,
 * keeping only the most recent iteration's results intact.
 */
export function compressOldToolResults(messages: AIMessage[]): void {
  const toolResultMsgIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i] as AIMessage & { __toolResults?: unknown[] };
    if (msg.role === 'user' && msg.__toolResults) {
      toolResultMsgIndices.push(i);
    }
  }

  if (toolResultMsgIndices.length <= 1) return;

  for (let k = 0; k < toolResultMsgIndices.length - 1; k++) {
    const idx = toolResultMsgIndices[k];
    const msg = messages[idx] as AIMessage & { __toolResults?: Array<{ content?: string; type?: string; tool_use_id?: string; is_error?: boolean }> };
    if (!msg.__toolResults) continue;

    for (const block of msg.__toolResults) {
      if (block.is_error) continue;
      if (block.content && block.content.length > 200) {
        block.content = block.content.slice(0, 150) + '\n[... compressed ...]';
      }
    }
  }
}

// ── appendExecutionTerminalLog ──────────────────────────────────────────────

export function appendExecutionTerminalLog(
  executionId: string,
  messageType: 'task' | 'result' | 'error' | 'question',
  instruction: string,
): void {
  addMessage(executionId, {
    id: `${executionId}-${Date.now()}`,
    executionId,
    fromAgent: 'project_manager',
    toAgent: 'coordinator',
    messageType,
    payload: { instruction },
    timestamp: new Date(),
  });
}

// ── buildFileOutline ────────────────────────────────────────────────────────

export function buildFileOutline(filePath: string, content: string): string {
  try {
    const chunks = chunkFile(content, filePath);
    if (chunks.length === 0) {
      const lineCount = content.split('\n').length;
      return `Structure: ${lineCount} lines (no AST chunks detected)`;
    }

    const grouped = new Map<string, ASTChunk[]>();
    for (const chunk of chunks) {
      const key = chunk.type;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(chunk);
    }

    const lines: string[] = ['**File structure:**'];
    for (const chunk of chunks.slice(0, 25)) {
      const label = chunk.metadata.functionName
        ?? chunk.metadata.selector
        ?? chunk.metadata.renderTarget
        ?? chunk.metadata.settingId
        ?? chunk.metadata.nodeType
        ?? chunk.type;
      lines.push(`  Lines ${chunk.lineStart}-${chunk.lineEnd}: ${chunk.type} — ${label}`);
    }
    if (chunks.length > 25) {
      lines.push(`  ... and ${chunks.length - 25} more chunks`);
    }

    return lines.join('\n');
  } catch {
    const lineCount = content.split('\n').length;
    return `Structure: ${lineCount} lines (outline unavailable)`;
  }
}

// ── buildToolResultCardData ─────────────────────────────────────────────────

/**
 * Parses raw tool output into structured card data for rich UI rendering.
 * Returns null if the tool doesn't have a rich card representation.
 */
export function buildToolResultCardData(
  toolName: string,
  input: Record<string, unknown> | undefined,
  rawContent: string,
): Record<string, unknown> | null {
  try {
    if (toolName === 'read_file' || toolName === 'read_lines' || toolName === 'read_chunk') {
      const fileName = String(input?.fileId ?? input?.path ?? input?.file_path ?? 'unknown');
      const lines = rawContent.split('\n');
      const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
      const langMap: Record<string, string> = {
        liquid: 'Liquid', json: 'JSON', js: 'JavaScript', ts: 'TypeScript',
        css: 'CSS', scss: 'SCSS', html: 'HTML', md: 'Markdown', svg: 'SVG',
      };
      return {
        fileName,
        content: rawContent.slice(0, 5000),
        language: langMap[ext] ?? ext,
        lineCount: lines.length,
      };
    }

    if (toolName === 'grep_content' || toolName === 'search_files') {
      const pattern = String(input?.pattern ?? input?.query ?? '');
      const matchLines = rawContent.split('\n').filter(l => l.trim());
      const matches: Array<{ file: string; line: number; content: string }> = [];
      for (const ml of matchLines.slice(0, 50)) {
        const parts = ml.match(/^(.+?):(\d+):\s*(.*)$/);
        if (parts) {
          matches.push({ file: parts[1], line: parseInt(parts[2], 10), content: parts[3] });
        } else if (ml.includes(':')) {
          const [file, ...rest] = ml.split(':');
          matches.push({ file: file.trim(), line: 0, content: rest.join(':').trim() });
        }
      }
      return {
        pattern,
        matches,
        totalMatches: matches.length,
      };
    }

    if (toolName === 'check_lint') {
      const fileName = String(input?.fileName ?? input?.filePath ?? '');
      const passed = rawContent.includes('No lint errors') || rawContent.includes('no issues') || rawContent.includes('passed');
      const issues: Array<{ severity: 'error' | 'warning' | 'info'; category: string; file: string; line?: number; message: string }> = [];
      const issueLines = rawContent.split('\n').filter(l => l.trim());
      for (const il of issueLines) {
        const errorMatch = il.match(/(?:error|Error)\s*:?\s*(.*)/);
        const warnMatch = il.match(/(?:warning|Warning)\s*:?\s*(.*)/);
        if (errorMatch) {
          issues.push({ severity: 'error', category: 'lint', file: fileName, message: errorMatch[1] });
        } else if (warnMatch) {
          issues.push({ severity: 'warning', category: 'lint', file: fileName, message: warnMatch[1] });
        }
      }
      const errorCount = issues.filter(i => i.severity === 'error').length;
      const warnCount = issues.filter(i => i.severity === 'warning').length;
      return {
        passed,
        summary: passed ? `${fileName}: clean` : `${fileName}: ${errorCount} errors, ${warnCount} warnings`,
        issues,
      };
    }

    if (toolName === 'run_command') {
      const command = String(input?.command ?? '');
      const exitCodeMatch = rawContent.match(/exit code:\s*(\d+)/i);
      const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0;
      const timedOut = rawContent.includes('timed out') || rawContent.includes('timeout');
      let stdout = rawContent;
      let stderr = '';
      const stderrMatch = rawContent.match(/(?:stderr|STDERR):\s*([\s\S]*?)(?:\n(?:stdout|exit)|$)/i);
      if (stderrMatch) {
        stderr = stderrMatch[1].trim();
        stdout = rawContent.replace(stderrMatch[0], '').trim();
      }
      return {
        command,
        stdout: stdout.slice(0, 3000),
        stderr: stderr.slice(0, 1000),
        exitCode,
        timedOut,
      };
    }
  } catch {
    return null;
  }
  return null;
}

// ── Extracted pure/reference-only functions (W1-A) ─────────────────────────

export function trackFileReadFn(
  fileReadLog: Map<string, Set<string>>,
  filePath: string,
  startLine?: number,
  endLine?: number,
): void {
  if (!fileReadLog.has(filePath)) fileReadLog.set(filePath, new Set());
  if (startLine != null && endLine != null) {
    fileReadLog.get(filePath)!.add(`${startLine}-${endLine}`);
  }
}

export function trackFileEditFn(
  fileEditLog: Map<string, number>,
  filePath: string,
): void {
  fileEditLog.set(filePath, (fileEditLog.get(filePath) ?? 0) + 1);
}

export function normalizeToolResultFn(
  evtName: string,
  result: ToolResult | undefined,
): ToolResult {
  const raw = result;
  if (!raw || typeof raw.content !== 'string') {
    return {
      tool_use_id: raw?.tool_use_id ?? '',
      content: `Invalid tool result for ${evtName}: missing content payload.`,
      is_error: true,
    };
  }
  const isMutation = MUTATING_TOOL_NAMES.has(evtName) || evtName === 'search_replace';
  if (isMutation && raw.content.trim().length === 0) {
    return {
      tool_use_id: raw.tool_use_id,
      content: `${evtName} returned an empty payload. Treating as failure to prevent silent continuation.`,
      is_error: true,
    };
  }
  return raw;
}

export function buildMemoryAnchorFn(ctx: MemoryAnchorCtx): string {
  const readSummaries: string[] = [];
  for (const [file, ranges] of ctx.fileReadLog) {
    const shortName = file.replace(/^.*[/\\]/, '');
    if (ranges.size > 0) {
      const rangeList = [...ranges].slice(0, 6).join(', ');
      const overflow = ranges.size > 6 ? ` +${ranges.size - 6} more` : '';
      readSummaries.push(`${shortName} (lines ${rangeList}${overflow})`);
    } else {
      readSummaries.push(shortName);
    }
  }

  const editSummaries: string[] = [];
  for (const [file, count] of ctx.fileEditLog) {
    const shortName = file.replace(/^.*[/\\]/, '');
    editSummaries.push(`${shortName} (${count} edit${count !== 1 ? 's' : ''})`);
  }

  const recentActions = ctx.toolSequenceLog.slice(-10).join(' -> ');

  const coldSummaries: string[] = [];
  if (ctx.toolSummaryLog.size > 0) {
    for (const [, summary] of [...ctx.toolSummaryLog.entries()].slice(-10)) {
      coldSummaries.push(summary.slice(0, 150));
    }
  }

  return [
    'MEMORY ANCHOR (do not forget):',
    `Files already read: ${readSummaries.join(', ') || '(none)'}`,
    `Files edited: ${editSummaries.join(', ') || '(none)'}`,
    `Total accumulated changes: ${ctx.accumulatedChanges.length}`,
    `Last actions: ${recentActions || '(none)'}`,
    ...(coldSummaries.length > 0 ? [`Compacted tool results: ${coldSummaries.join(' | ')}`] : []),
    `Current goal: ${ctx.userRequest.slice(0, 200)}`,
    '',
    'Do NOT re-read files listed above. Continue from where you left off.',
  ].join('\n');
}

// ── Path & signature helpers (originally in coordinator-v2.ts ~L1166-1178) ──

/** Normalize a file reference to a canonical form for dedup comparisons. */
export function normalizeFileRef(value: string): string {
  return value.replace(/\\/g, '/').trim().toLowerCase();
}

/**
 * Build a dedup signature for a read_lines call.
 * Returns null if the input doesn't contain valid line-range info.
 */
export function buildReadLinesSignature(input: Record<string, unknown> | undefined): string | null {
  if (!input) return null;
  const file = String(input.filePath ?? input.file_path ?? input.path ?? input.fileId ?? '').trim();
  if (!file) return null;
  const startRaw = input.startLine ?? input.start_line;
  const endRaw = input.endLine ?? input.end_line;
  const start = Number(startRaw);
  const end = Number(endRaw);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return `${normalizeFileRef(file)}:${Math.max(1, start)}-${Math.max(1, end)}`;
}
