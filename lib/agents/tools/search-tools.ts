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
 * Find the best matching region in file content for the given query tokens.
 * Returns a line-numbered snippet centred on the highest-scoring line.
 */
function findBestMatchingRegion(
  content: string,
  query: string,
  contextLines = 3,
): { startLine: number; endLine: number; snippet: string } | null {
  const lines = content.split('\n');
  const queryTokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 2);

  if (queryTokens.length === 0 || lines.length === 0) return null;

  let bestLine = -1;
  let bestScore = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineLower = lines[i].toLowerCase();
    let score = 0;
    for (const token of queryTokens) {
      if (lineLower.includes(token)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestLine = i;
    }
  }

  if (bestLine === -1 || bestScore === 0) return null;

  const start = Math.max(0, bestLine - contextLines);
  const end = Math.min(lines.length - 1, bestLine + contextLines);
  const snippet = lines
    .slice(start, end + 1)
    .map((l, idx) => `${String(start + idx + 1).padStart(4)}: ${l}`)
    .join('\n');

  return { startLine: start + 1, endLine: end + 1, snippet };
}

/**
 * Search files by semantic relevance using fuzzy matching + optional embeddings.
 * Returns ranked results with line-numbered excerpts pinned to the best matching region.
 */
export async function executeSemanticSearch(
  input: SemanticInput,
  ctx: ToolExecutorContext,
): Promise<ToolResult> {
  const { query, limit = 10 } = input;

  if (!query) {
    return { tool_use_id: '', content: 'Query is required.', is_error: true };
  }

  // Primary: fuzzy match via ContextEngine (always fast, always available)
  const fuzzyResults = ctx.contextEngine.fuzzyMatch(query, limit);

  // Enhanced: chunk-level vector search via pgvector (gives back chunkText + location)
  type VectorChunk = { fileId: string; fileName: string; chunkText: string; chunkIndex: number; similarity: number };
  let vectorChunks: VectorChunk[] = [];

  if (ctx.projectId) {
    try {
      const { generateEmbedding } = await import('@/lib/ai/embeddings');
      const { similaritySearch } = await import('@/lib/ai/vector-store');
      const queryVec = await generateEmbedding(query);
      const raw = await similaritySearch(queryVec, limit * 2, ctx.projectId);
      vectorChunks = raw.map(c => ({
        fileId: c.fileId,
        fileName: c.fileName,
        chunkText: c.chunkText,
        chunkIndex: c.chunkIndex,
        similarity: c.similarity,
      }));
    } catch {
      // Embeddings not configured — fall through to fuzzy-only
    }
  }

  // Best chunk per file (highest similarity)
  const bestChunkByFile = new Map<string, VectorChunk>();
  for (const chunk of vectorChunks) {
    const existing = bestChunkByFile.get(chunk.fileId);
    if (!existing || chunk.similarity > existing.similarity) {
      bestChunkByFile.set(chunk.fileId, chunk);
    }
  }

  // Merge: fuzzy + vector, deduplicated by fileId
  const seen = new Set<string>();
  const merged: Array<{ fileId: string; fileName: string; score: number; source: string }> = [];

  for (const m of fuzzyResults) {
    if (!seen.has(m.fileId)) {
      seen.add(m.fileId);
      const vectorBoost = bestChunkByFile.get(m.fileId)?.similarity ?? 0;
      merged.push({ fileId: m.fileId, fileName: m.fileName, score: 1.0 + vectorBoost, source: vectorBoost > 0 ? 'hybrid' : 'fuzzy' });
    }
  }

  for (const [fileId, chunk] of bestChunkByFile) {
    if (!seen.has(fileId)) {
      seen.add(fileId);
      merged.push({ fileId, fileName: chunk.fileName, score: chunk.similarity, source: 'vector' });
    }
  }

  merged.sort((a, b) => b.score - a.score);
  const topResults = merged.slice(0, limit);

  if (topResults.length === 0) {
    return { tool_use_id: '', content: 'No matching files found.' };
  }

  // Hydrate top 5 files to locate the best matching region
  const topFileIds = topResults.slice(0, 5).map(r => r.fileId);
  const hydratedFiles = ctx.loadContent ? await ctx.loadContent(topFileIds) : [];
  const hydratedMap = new Map(hydratedFiles.map(f => [f.fileId, f]));

  const formatted = topResults.map((r, idx) => {
    const vectorChunk = bestChunkByFile.get(r.fileId);
    let excerptBlock = '';

    if (vectorChunk?.chunkText) {
      // Use the actual chunk text from the vector index (already the relevant region)
      const approxLine = vectorChunk.chunkIndex * 30 + 1;
      excerptBlock = `\n  [~line ${approxLine}]\n${vectorChunk.chunkText.split('\n').slice(0, 8).map(l => `  ${l}`).join('\n')}`;
    } else {
      const file = hydratedMap.get(r.fileId);
      if (file && !file.content.startsWith('[')) {
        const region = findBestMatchingRegion(file.content, query);
        if (region) {
          excerptBlock = `\n  [lines ${region.startLine}–${region.endLine}]\n${region.snippet.split('\n').map(l => `  ${l}`).join('\n')}`;
        }
      }
    }

    return `${idx + 1}. ${r.fileName} [${r.source}]${excerptBlock}`;
  }).join('\n\n');

  return { tool_use_id: '', content: formatted };
}
