/**
 * Search tools for AI agents: grep, glob, and semantic search.
 *
 * These operate over in-memory project files loaded by `loadProjectFiles()`.
 * Each function returns a `ToolResult` compatible with the tool-calling loop.
 */

import picomatch from 'picomatch';
import type { ToolResult } from '@/lib/ai/types';
import type { FileContext } from '@/lib/types/agent';
import type { ToolExecutorContext } from './tool-executor';
import { loadAllContent } from '@/lib/supabase/file-loader';
import { estimateTokens } from '@/lib/ai/token-counter';

// ── Types ─────────────────────────────────────────────────────────────────

interface GrepMatch {
  fileName: string;
  path: string;
  line: number;
  content: string;
}

// ── grep_content ──────────────────────────────────────────────────────────

interface GrepInput {
  pattern: string;
  filePattern?: string;
  caseSensitive?: boolean;
  maxResults?: number;
  maxTokens?: number;
}

/**
 * Search file contents using a regex or substring pattern.
 * Returns matching lines with file names and line numbers.
 */
export async function executeGrep(
  input: GrepInput,
  ctx: ToolExecutorContext,
): Promise<ToolResult & { _matchedFileIds?: string[] }> {
  const { pattern, filePattern, caseSensitive = false, maxResults = 50, maxTokens = 5000 } = input;

  if (!pattern) {
    return { tool_use_id: '', content: 'Pattern is required.', is_error: true };
  }

  // Validate regex
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
  } catch (err) {
    return {
      tool_use_id: '',
      content: `Invalid regex pattern "${pattern}": ${err instanceof Error ? err.message : String(err)}`,
      is_error: true,
    };
  }

  // Filter by glob pattern BEFORE hydration to avoid loading all 150+ files
  let filesToHydrate = ctx.files;
  if (filePattern) {
    let isMatch: (path: string) => boolean;
    try {
      isMatch = picomatch(filePattern, { bash: true });
    } catch {
      return {
        tool_use_id: '',
        content: `Invalid glob pattern "${filePattern}".`,
        is_error: true,
      };
    }
    filesToHydrate = ctx.files.filter(f => isMatch(f.path ?? f.fileName));
  }

  // Hydrate only the filtered subset
  let filesToSearch: FileContext[];
  if (ctx.loadContent) {
    filesToSearch = await loadAllContent(filesToHydrate, ctx.loadContent);
  } else {
    filesToSearch = filesToHydrate.filter(f => !f.content.startsWith('['));
  }

  // Search line-by-line
  const allMatches: GrepMatch[] = [];
  const matchedFileIds = new Set<string>();

  for (const file of filesToSearch) {
    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      // Reset regex lastIndex for each line (because of 'g' flag)
      regex.lastIndex = 0;
      if (regex.test(lines[i])) {
        allMatches.push({
          fileName: file.fileName,
          path: file.path ?? file.fileName,
          line: i + 1,
          content: lines[i].trimEnd(),
        });
        matchedFileIds.add(file.fileId);
      }
    }
  }

  if (allMatches.length === 0) {
    return { tool_use_id: '', content: 'No matches found.' };
  }

  // Apply token budget: stop adding matches when budget is exhausted
  const limited: GrepMatch[] = [];
  let totalTokens = 0;

  for (const match of allMatches) {
    if (limited.length >= maxResults) break;
    const matchLine = `${match.path}:${match.line}: ${match.content}`;
    const matchTokens = estimateTokens(matchLine);
    if (totalTokens + matchTokens > maxTokens && limited.length >= 10) {
      break; // Keep at least 10 results even if over budget
    }
    limited.push(match);
    totalTokens += matchTokens;
  }

  const formatted = limited.map(m => `${m.path}:${m.line}: ${m.content}`).join('\n');
  const truncated = allMatches.length > limited.length;

  const result = truncated
    ? `${formatted}\n\n... (${allMatches.length - limited.length} more matches not shown, ${allMatches.length} total across ${matchedFileIds.size} files)`
    : `${formatted}\n\n${allMatches.length} match(es) across ${matchedFileIds.size} file(s).`;

  return {
    tool_use_id: '',
    content: result,
    _matchedFileIds: [...matchedFileIds],
  };
}

// ── glob_files ────────────────────────────────────────────────────────────

interface GlobInput {
  pattern: string;
}

/**
 * Find files by glob pattern matching on their path.
 * Returns matching file names with type and approximate size.
 */
export function executeGlob(
  input: GlobInput,
  ctx: ToolExecutorContext,
): ToolResult {
  const { pattern } = input;

  if (!pattern) {
    return { tool_use_id: '', content: 'Pattern is required.', is_error: true };
  }

  let isMatch: (path: string) => boolean;
  try {
    isMatch = picomatch(pattern, { bash: true });
  } catch {
    return {
      tool_use_id: '',
      content: `Invalid glob pattern "${pattern}".`,
      is_error: true,
    };
  }

  const matches = ctx.files.filter(f => isMatch(f.path ?? f.fileName));

  if (matches.length === 0) {
    return { tool_use_id: '', content: `No files match pattern "${pattern}".` };
  }

  const formatted = matches.map(f => {
    const sizeMatch = f.content.match(/^\[(\d+)/);
    const sizeHint = sizeMatch ? ` ~${sizeMatch[1]} chars` : '';
    return `${f.path ?? f.fileName} (${f.fileType}${sizeHint})`;
  }).join('\n');

  return {
    tool_use_id: '',
    content: `${matches.length} file(s) match "${pattern}":\n${formatted}`,
  };
}

// ── semantic_search ───────────────────────────────────────────────────────

interface SemanticInput {
  query: string;
  limit?: number;
}

/**
 * Search files by semantic relevance using fuzzy matching + optional embeddings.
 * Auto-hydrates top results with content excerpts.
 */
export async function executeSemanticSearch(
  input: SemanticInput,
  ctx: ToolExecutorContext,
): Promise<ToolResult> {
  const { query, limit = 10 } = input;

  if (!query) {
    return { tool_use_id: '', content: 'Query is required.', is_error: true };
  }

  // Primary: fuzzy match via ContextEngine
  const fuzzyResults = ctx.contextEngine.fuzzyMatch(query, limit);

  // Enhanced: try semantic search if projectId is available
  let semanticResults: Array<{ fileId: string; fileName: string; similarity: number }> = [];
  if (ctx.projectId) {
    try {
      // Dynamic import to avoid hard dependency on embeddings infrastructure
      const { semanticFileSearch } = await import('@/lib/ai/embeddings');
      semanticResults = await semanticFileSearch(ctx.projectId, query, limit);
    } catch {
      // Embeddings not available — fall through to fuzzy-only
    }
  }

  // Merge results: union of fuzzy + semantic, deduplicated by fileId
  const seen = new Set<string>();
  const merged: Array<{ fileId: string; fileName: string; score: number; source: string }> = [];

  // Add fuzzy results first (they're fast and always available)
  for (const m of fuzzyResults) {
    if (!seen.has(m.fileId)) {
      seen.add(m.fileId);
      merged.push({ fileId: m.fileId, fileName: m.fileName, score: 1.0, source: 'fuzzy' });
    }
  }

  // Add semantic results (may overlap)
  for (const s of semanticResults) {
    if (!seen.has(s.fileId)) {
      seen.add(s.fileId);
      merged.push({ fileId: s.fileId, fileName: s.fileName, score: s.similarity, source: 'semantic' });
    } else {
      // Boost score if found by both methods
      const existing = merged.find(m => m.fileId === s.fileId);
      if (existing) existing.score += s.similarity;
    }
  }

  // Sort by combined score (highest first)
  merged.sort((a, b) => b.score - a.score);
  const topResults = merged.slice(0, limit);

  if (topResults.length === 0) {
    return { tool_use_id: '', content: 'No matching files found.' };
  }

  // Auto-hydrate top 5 results with content excerpts
  const topFileIds = topResults.slice(0, 5).map(r => r.fileId);
  const hydratedFiles = ctx.loadContent ? await ctx.loadContent(topFileIds) : [];
  const hydratedMap = new Map(hydratedFiles.map(f => [f.fileId, f]));

  const formatted = topResults.map((r, idx) => {
    const file = hydratedMap.get(r.fileId);
    const excerpt = file && !file.content.startsWith('[')
      ? `\n   ${file.content.slice(0, 150).replace(/\n/g, ' ')}...`
      : '';
    return `${idx + 1}. ${r.fileName} [${r.source}]${excerpt}`;
  }).join('\n\n');

  return { tool_use_id: '', content: formatted };
}
