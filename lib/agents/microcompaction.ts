/**
 * Microcompaction: hot tail / cold storage for tool results.
 *
 * Recent tool results stay inline ("hot tail"); older ones are replaced with
 * a structured summary and a retrieval reference ("cold storage"). This
 * dramatically reduces token accumulation in long agent runs while preserving
 * navigability (file:line pairs, schema structure, etc.).
 *
 * @see .cursor/plans/token_optimization_realignment_ff340346.plan.md — Phase 1
 */

import type { AIMessage } from '@/lib/ai/types';
import { extractSchemaEntries, formatSchemaSummary } from '@/lib/parsers/schema-indexer';

// ── Types ────────────────────────────────────────────────────────────

interface ToolResultBlock {
  type?: string;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

interface ToolResultMessage extends AIMessage {
  __toolResults?: ToolResultBlock[];
  __toolNames?: string[];
}

export interface MicrocompactionStats {
  coldCount: number;
  rereadCount: number;
  tokensSaved: number;
}

export interface ColdStorageEntry {
  toolName: string;
  filePath?: string;
  summary: string;
  originalCharCount: number;
}

// ── Summary generators (no LLM — parser / regex based) ──────────────

function summarizeReadFile(content: string, toolInput: Record<string, unknown> | undefined): string {
  const filePath = (toolInput?.fileName ?? toolInput?.filePath ?? toolInput?.path ?? 'unknown') as string;
  const lineCount = content.split('\n').length;
  const isLiquid = filePath.endsWith('.liquid');

  const parts: string[] = [`read_file ${filePath}: ${lineCount} lines.`];

  if (isLiquid) {
    const schemaEntries = extractSchemaEntries(content, filePath);
    if (schemaEntries.length > 0) {
      parts.push(`Schema: ${formatSchemaSummary(schemaEntries).slice(0, 300)}`);
    }

    const renderMatches = content.match(/\{%[-\s]*render\s+'([^']+)'/g);
    if (renderMatches) {
      const snippets = renderMatches.map(m => m.match(/'([^']+)'/)?.[1]).filter(Boolean);
      if (snippets.length > 0) {
        parts.push(`Snippets: ${snippets.slice(0, 8).join(', ')}${snippets.length > 8 ? ` +${snippets.length - 8} more` : ''}`);
      }
    }

    const sectionMatches = content.match(/\{%[-\s]*section\s+'([^']+)'/g);
    if (sectionMatches) {
      const sections = sectionMatches.map(m => m.match(/'([^']+)'/)?.[1]).filter(Boolean);
      if (sections.length > 0) {
        parts.push(`Sections: ${sections.join(', ')}`);
      }
    }
  } else {
    const identifiers: string[] = [];

    const classMatches = content.match(/(?:class|interface|type|enum)\s+(\w+)/g);
    if (classMatches) {
      identifiers.push(...classMatches.slice(0, 5).map(m => m.replace(/^(?:class|interface|type|enum)\s+/, '')));
    }

    const funcMatches = content.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g);
    if (funcMatches) {
      identifiers.push(...funcMatches.slice(0, 5).map(m => m.match(/function\s+(\w+)/)?.[1] ?? '').filter(Boolean));
    }

    const exportMatches = content.match(/export\s+(?:const|let|var)\s+(\w+)/g);
    if (exportMatches) {
      identifiers.push(...exportMatches.slice(0, 3).map(m => m.match(/(?:const|let|var)\s+(\w+)/)?.[1] ?? '').filter(Boolean));
    }

    if (identifiers.length > 0) {
      parts.push(`Key identifiers: ${[...new Set(identifiers)].slice(0, 8).join(', ')}`);
    }
  }

  return parts.join(' ');
}

function summarizeGrepContent(content: string, toolInput: Record<string, unknown> | undefined): string {
  const pattern = (toolInput?.pattern ?? toolInput?.query ?? '') as string;
  const lines = content.split('\n');

  const fileLineMatches: string[] = [];
  const fileMatchRe = /^([^:\s]+):(\d+)[:\s]/;
  for (const line of lines) {
    const m = line.match(fileMatchRe);
    if (m) {
      fileLineMatches.push(`${m[1]}:${m[2]}`);
    }
  }

  const totalMatches = fileLineMatches.length || lines.filter(l => l.trim()).length;
  const fileGroups = new Map<string, string[]>();
  for (const fl of fileLineMatches) {
    const [file, lineNo] = fl.split(':');
    if (!fileGroups.has(file)) fileGroups.set(file, []);
    fileGroups.get(file)!.push(lineNo);
  }

  const parts: string[] = [`grep_content '${pattern.slice(0, 60)}': ${totalMatches} matches in ${fileGroups.size} files.`];

  for (const [file, lineNos] of [...fileGroups.entries()].slice(0, 8)) {
    parts.push(`${file}:${lineNos.slice(0, 6).join(',')}`);
  }
  if (fileGroups.size > 8) {
    parts.push(`+${fileGroups.size - 8} more files`);
  }

  const firstContentLines = lines
    .filter(l => fileMatchRe.test(l))
    .slice(0, 3)
    .map(l => l.slice(0, 100));
  if (firstContentLines.length > 0) {
    parts.push(`Top matches: ${firstContentLines.join(' | ')}`);
  }

  return parts.join(' ');
}

function summarizeSearchFiles(content: string, toolInput: Record<string, unknown> | undefined): string {
  const query = (toolInput?.query ?? toolInput?.pattern ?? '') as string;
  const files = content.split('\n').filter(l => l.trim());
  return `search_files '${query.slice(0, 60)}': ${files.length} results. Files: ${files.slice(0, 10).join(', ')}${files.length > 10 ? ` +${files.length - 10} more` : ''}`;
}

function summarizeSemanticSearch(content: string): string {
  const lines = content.split('\n').filter(l => l.trim());
  const fileRefs = lines.filter(l => /\.\w{2,5}/.test(l)).slice(0, 8);
  return `semantic_search: ${lines.length} result lines. Top files: ${fileRefs.slice(0, 6).join(', ')}`;
}

function summarizeValidation(content: string, toolName: string, toolInput: Record<string, unknown> | undefined): string {
  const filePath = (toolInput?.fileName ?? toolInput?.filePath ?? '') as string;
  const errorLines = content.split('\n').filter(l => /error|warning|issue/i.test(l));
  const errorCount = errorLines.length;

  if (errorCount === 0) {
    return `${toolName} ${filePath}: No issues found.`;
  }

  const details = errorLines.slice(0, 5).map(l => l.trim().slice(0, 100)).join(' | ');
  return `${toolName} ${filePath}: ${errorCount} issues. ${details}${errorCount > 5 ? ` +${errorCount - 5} more` : ''}`;
}

function summarizeEditWrite(content: string, toolName: string, toolInput: Record<string, unknown> | undefined): string {
  const filePath = (toolInput?.fileName ?? toolInput?.filePath ?? toolInput?.path ?? '') as string;
  const startLine = toolInput?.startLine ?? toolInput?.lineNumber ?? '';
  const endLine = toolInput?.endLine ?? '';
  const range = startLine ? ` lines ${startLine}${endLine ? `-${endLine}` : ''}` : '';
  const lines = content.split('\n');
  const preview = lines.slice(0, 2).map(l => l.trim().slice(0, 80)).join(' | ');
  return `${toolName} ${filePath}${range}: ${lines.length} lines. Preview: ${preview}`;
}

function summarizeDefault(content: string, toolName: string): string {
  const preview = content.slice(0, 200).replace(/\n/g, ' ').trim();
  return `${toolName}: ${content.length} chars. ${preview}${content.length > 200 ? '...' : ''}`;
}

/**
 * Generate a structured summary for a tool result without using an LLM.
 * Leverages schema-indexer for Liquid files and regex for everything else.
 */
export function generateToolSummary(
  toolName: string,
  content: string,
  toolInput?: Record<string, unknown>,
): string {
  switch (toolName) {
    case 'read_file':
    case 'read_lines':
    case 'read_chunk':
    case 'extract_region':
    case 'parallel_batch_read':
      return summarizeReadFile(content, toolInput);

    case 'grep_content':
      return summarizeGrepContent(content, toolInput);

    case 'search_files':
    case 'glob_files':
    case 'list_files':
    case 'find_references':
      return summarizeSearchFiles(content, toolInput);

    case 'semantic_search':
      return summarizeSemanticSearch(content);

    case 'validate_syntax':
    case 'check_lint':
    case 'run_diagnostics':
    case 'theme_check':
      return summarizeValidation(content, toolName, toolInput);

    case 'edit_lines':
    case 'write_file':
    case 'search_replace':
    case 'create_file':
      return summarizeEditWrite(content, toolName, toolInput);

    default:
      return summarizeDefault(content, toolName);
  }
}

// ── Core microcompaction function ────────────────────────────────────

/**
 * Compress old tool results in the message history.
 *
 * - Hot tail: last `hotTailCount` tool-result messages stay fully inline.
 * - Cold storage: older results are replaced with a structured summary
 *   and a retrieval reference. Full content is stored in `toolOutputCache`.
 *
 * @param messages - The mutable messages array from the coordinator.
 * @param hotTailCount - Number of recent tool-result messages to keep inline.
 * @param toolOutputCache - Map to store full content for later retrieval.
 * @param toolSummaryLog - Map from outputId -> summary for memory anchor.
 * @param stats - Mutable stats object for tracking.
 */
export function microcompactToolResults(
  messages: AIMessage[],
  hotTailCount: number,
  toolOutputCache: Map<string, string>,
  toolSummaryLog: Map<string, string>,
  stats: MicrocompactionStats,
): void {
  const toolResultIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i] as ToolResultMessage;
    if (msg.role === 'user' && msg.__toolResults && msg.__toolResults.length > 0) {
      toolResultIndices.push(i);
    }
  }

  if (toolResultIndices.length <= hotTailCount) return;

  const coldIndices = toolResultIndices.slice(0, toolResultIndices.length - hotTailCount);

  for (const idx of coldIndices) {
    const msg = messages[idx] as ToolResultMessage;
    if (!msg.__toolResults) continue;

    const toolNames = msg.__toolNames ?? [];

    for (let j = 0; j < msg.__toolResults.length; j++) {
      const block = msg.__toolResults[j];
      if (block.is_error) continue;
      if (!block.content || block.content.length < 500) continue;

      const alreadyCompacted = block.content.startsWith('[COMPACTED]');
      if (alreadyCompacted) continue;

      const toolName = toolNames[j] ?? 'unknown';
      const originalLen = block.content.length;
      const outputId = `mc-${block.tool_use_id ?? Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      toolOutputCache.set(outputId, block.content);

      const summary = generateToolSummary(toolName, block.content);
      const compactedContent = `[COMPACTED] ${summary} Full output stored as ${outputId}.`;

      toolSummaryLog.set(outputId, summary);

      const savedChars = originalLen - compactedContent.length;
      stats.coldCount += 1;
      stats.tokensSaved += Math.max(0, Math.floor(savedChars / 4));

      block.content = compactedContent;
    }
  }
}

/**
 * Check if a tool call is re-reading a file that was already compacted.
 * Returns true if this is a re-read (caller should increment rereadCount).
 */
export function isRereadOfCompactedFile(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolSummaryLog: Map<string, string>,
): boolean {
  if (toolName !== 'read_file' && toolName !== 'read_lines') return false;
  const filePath = (toolInput?.fileName ?? toolInput?.filePath ?? toolInput?.path ?? '') as string;
  if (!filePath) return false;

  for (const summary of toolSummaryLog.values()) {
    if (summary.includes(filePath)) return true;
  }
  return false;
}
