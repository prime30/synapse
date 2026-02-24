/**
 * Search tools for AI agents: grep, glob, and semantic search.
 *
 * These operate over in-memory project files loaded by `loadProjectFiles()`.
 * Each function returns a `ToolResult` compatible with the tool-calling loop.
 *
 * DESIGN PRINCIPLE: Zero-result searches should never happen. When a narrow
 * search finds nothing, progressively widen the scope and generate synonym
 * patterns to find what the user likely means.
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

// ── Synonym / widening system ─────────────────────────────────────────────

const SHOPIFY_SYNONYMS: Record<string, string[]> = {
  'cart': ['cart', 'mini-cart', 'cart-drawer', 'ajax-cart', 'sidebar-cart', 'basket', 'bag'],
  'mini-cart': ['cart', 'mini-cart', 'cart-drawer', 'ajax-cart', 'sidebar-cart'],
  'header': ['header', 'nav', 'navigation', 'menu', 'top-bar', 'announcement'],
  'footer': ['footer', 'bottom', 'footer-menu'],
  'product': ['product', 'pdp', 'product-card', 'product-form', 'product-template'],
  'collection': ['collection', 'catalog', 'product-grid', 'product-list', 'facet', 'filter'],
  'search': ['search', 'predictive-search', 'search-modal', 'search-form'],
  'hero': ['hero', 'banner', 'slideshow', 'slider', 'carousel'],
  'image': ['image', 'img', 'photo', 'media', 'gallery', 'thumbnail'],
  'price': ['price', 'money', 'currency', 'compare-at', 'sale'],
  'quantity': ['quantity', 'qty', 'quantity-selector', 'quantity-input', 'line-item'],
  'checkout': ['checkout', 'payment', 'shipping', 'order'],
  'account': ['account', 'customer', 'login', 'register', 'address'],
  'blog': ['blog', 'article', 'post', 'news'],
};

function getSynonyms(term: string): string[] {
  const lower = term.toLowerCase();
  for (const [key, synonyms] of Object.entries(SHOPIFY_SYNONYMS)) {
    if (lower.includes(key) || synonyms.some(s => lower.includes(s))) {
      return synonyms;
    }
  }
  return [lower];
}

interface WideningStep {
  filePattern: string;
  label: string;
}

function buildWideningSteps(originalPattern: string, searchPattern: string): WideningStep[] {
  const steps: WideningStep[] = [];

  const synonyms = getSynonyms(searchPattern);
  const synonymGlobs = synonyms.map(s => `*${s}*`);

  const baseName = originalPattern
    .replace(/^(\*\*\/|\*\/)?/, '')
    .replace(/\.\w+$/, '')
    .replace(/\*/g, '');

  if (baseName) {
    const baseSynonyms = getSynonyms(baseName);
    for (const syn of baseSynonyms) {
      if (`*${syn}*` !== originalPattern) {
        steps.push({ filePattern: `**/*${syn}*`, label: `files matching *${syn}*` });
      }
    }
  }

  const extMatch = originalPattern.match(/\.(\w+)$/);
  if (extMatch) {
    steps.push({ filePattern: `**/*.${extMatch[1]}`, label: `all .${extMatch[1]} files` });
  }

  const dirMatch = originalPattern.match(/^(sections|snippets|assets|templates|layout|config)\//);
  if (dirMatch) {
    steps.push({ filePattern: `${dirMatch[1]}/*`, label: `all files in ${dirMatch[1]}/` });
  }

  for (const sg of synonymGlobs) {
    const step = { filePattern: `**/${sg}`, label: `files matching ${sg}` };
    if (!steps.some(s => s.filePattern === step.filePattern)) {
      steps.push(step);
    }
  }

  steps.push({ filePattern: '**/*', label: 'all project files' });

  return steps;
}

function filterByGlob(files: FileContext[], pattern: string): FileContext[] {
  let isMatch: (path: string) => boolean;
  try {
    isMatch = picomatch(pattern, { bash: true });
  } catch {
    return [];
  }
  return files.filter(f => isMatch(f.path ?? f.fileName));
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
 *
 * Progressive widening: if a scoped search returns 0 results, automatically
 * widens the file scope through synonym patterns and broader directories
 * until results are found. Zero-result returns should never happen.
 */
export async function executeGrep(
  input: GrepInput,
  ctx: ToolExecutorContext,
): Promise<ToolResult & { _matchedFileIds?: string[] }> {
  const { pattern, filePattern, caseSensitive = false, maxResults = 50, maxTokens = 5000 } = input;

  if (!pattern) {
    return { tool_use_id: '', content: 'Pattern is required.', is_error: true };
  }

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

  const searchFiles = async (files: FileContext[]): Promise<{ matches: GrepMatch[]; matchedFileIds: Set<string> }> => {
    const hydrated = ctx.loadContent
      ? await loadAllContent(files, ctx.loadContent)
      : files.filter(f => !f.content.startsWith('['));

    const matches: GrepMatch[] = [];
    const matchedFileIds = new Set<string>();

    for (const file of hydrated) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        regex.lastIndex = 0;
        if (regex.test(lines[i])) {
          matches.push({
            fileName: file.fileName,
            path: file.path ?? file.fileName,
            line: i + 1,
            content: lines[i].trimEnd(),
          });
          matchedFileIds.add(file.fileId);
        }
      }
    }
    return { matches, matchedFileIds };
  };

  // --- Phase 1: Try the original scoped search ---
  let filesToSearch = filePattern ? filterByGlob(ctx.files, filePattern) : ctx.files;
  let { matches: allMatches, matchedFileIds } = await searchFiles(filesToSearch);
  let widenedNote = '';

  // --- Phase 2: Progressive widening if 0 results ---
  if (allMatches.length === 0 && filePattern) {
    const steps = buildWideningSteps(filePattern, pattern);

    for (const step of steps) {
      const candidates = filterByGlob(ctx.files, step.filePattern);
      if (candidates.length === 0) continue;

      const alreadySearched = new Set(filesToSearch.map(f => f.fileId));
      const newFiles = candidates.filter(f => !alreadySearched.has(f.fileId));
      if (newFiles.length === 0) continue;

      const result = await searchFiles(newFiles);
      if (result.matches.length > 0) {
        allMatches = result.matches;
        matchedFileIds = result.matchedFileIds;
        widenedNote = `\n\n(No results in "${filePattern}" — widened to ${step.label}, found matches.)`;
        break;
      }

      for (const f of newFiles) alreadySearched.add(f.fileId);
      filesToSearch = [...filesToSearch, ...newFiles];
    }
  }

  // --- Phase 3: Synonym pattern expansion if still 0 results ---
  if (allMatches.length === 0) {
    const synonyms = getSynonyms(pattern);
    for (const syn of synonyms) {
      if (syn === pattern.toLowerCase()) continue;
      let synRegex: RegExp;
      try {
        synRegex = new RegExp(syn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      } catch { continue; }

      const synMatches: GrepMatch[] = [];
      const synFileIds = new Set<string>();

      const hydrated = ctx.loadContent
        ? await loadAllContent(ctx.files, ctx.loadContent)
        : ctx.files.filter(f => !f.content.startsWith('['));

      for (const file of hydrated) {
        const lines = file.content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          synRegex.lastIndex = 0;
          if (synRegex.test(lines[i])) {
            synMatches.push({
              fileName: file.fileName,
              path: file.path ?? file.fileName,
              line: i + 1,
              content: lines[i].trimEnd(),
            });
            synFileIds.add(file.fileId);
          }
        }
      }

      if (synMatches.length > 0) {
        allMatches = synMatches;
        matchedFileIds = synFileIds;
        widenedNote = `\n\n(No results for "${pattern}" — found matches using related term "${syn}".)`;
        break;
      }
    }
  }

  // --- Phase 4: Last resort — list likely relevant files ---
  if (allMatches.length === 0) {
    const synonyms = getSynonyms(pattern);
    const relatedFiles = ctx.files.filter(f => {
      const p = (f.path ?? f.fileName).toLowerCase();
      return synonyms.some(s => p.includes(s));
    });

    if (relatedFiles.length > 0) {
      const fileList = relatedFiles.slice(0, 15).map(f => f.path ?? f.fileName).join('\n');
      return {
        tool_use_id: '',
        content: `No content matches for "${pattern}"${filePattern ? ` in "${filePattern}"` : ''}, but these files may be related based on naming:\n\n${fileList}\n\nTry reading these files directly with read_file, or search with a different pattern.`,
      };
    }

    return {
      tool_use_id: '',
      content: `No matches found for "${pattern}"${filePattern ? ` in "${filePattern}"` : ''}. Searched ${ctx.files.length} files. Try:\n- A broader filePattern (e.g. "**/*.liquid")\n- A simpler search pattern\n- semantic_search for concept-based lookup`,
    };
  }

  // --- BM25 ranking: sort by relevance instead of file order ---
  if (allMatches.length > 1) {
    try {
      const { rerankGrepResults } = await import('@/lib/ai/bm25-ranker');
      const ranked = rerankGrepResults(
        pattern,
        allMatches.map(m => ({ file: m.path, line: m.line, content: m.content })),
      );
      allMatches = ranked.map(r => ({
        path: r.file,
        line: r.line,
        content: r.content,
      }));
    } catch { /* BM25 unavailable — keep original order */ }
  }

  // --- Format results ---
  const limited: GrepMatch[] = [];
  let totalTokens = 0;

  for (const match of allMatches) {
    if (limited.length >= maxResults) break;
    const matchLine = `${match.path}:${match.line}: ${match.content}`;
    const matchTokens = estimateTokens(matchLine);
    if (totalTokens + matchTokens > maxTokens && limited.length >= 10) {
      break;
    }
    limited.push(match);
    totalTokens += matchTokens;
  }

  const formatted = limited.map(m => `${m.path}:${m.line}: ${m.content}`).join('\n');
  const truncated = allMatches.length > limited.length;

  const result = truncated
    ? `${formatted}\n\n... (${allMatches.length - limited.length} more matches not shown, ${allMatches.length} total across ${matchedFileIds.size} files)${widenedNote}`
    : `${formatted}\n\n${allMatches.length} match(es) across ${matchedFileIds.size} file(s).${widenedNote}`;

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
 * If no files match, widens with synonyms and suggests related files.
 */
export function executeGlob(
  input: GlobInput,
  ctx: ToolExecutorContext,
): ToolResult {
  const { pattern } = input;

  if (!pattern) {
    return { tool_use_id: '', content: 'Pattern is required.', is_error: true };
  }

  let matches = filterByGlob(ctx.files, pattern);
  let widenedNote = '';

  if (matches.length === 0) {
    const baseName = pattern.replace(/^(\*\*\/|\*\/)?/, '').replace(/\.\w+$/, '').replace(/\*/g, '');
    if (baseName) {
      const synonyms = getSynonyms(baseName);
      for (const syn of synonyms) {
        const synPattern = pattern.replace(baseName, syn);
        const synMatches = filterByGlob(ctx.files, synPattern);
        if (synMatches.length > 0) {
          matches = synMatches;
          widenedNote = `\n\n(No files matched "${pattern}" — widened to "${synPattern}".)`;
          break;
        }
      }
    }

    if (matches.length === 0) {
      const extMatch = pattern.match(/\.(\w+)$/);
      if (extMatch) {
        const extMatches = filterByGlob(ctx.files, `**/*.${extMatch[1]}`);
        if (extMatches.length > 0) {
          const related = extMatches.filter(f => {
            const p = (f.path ?? f.fileName).toLowerCase();
            return baseName ? p.includes(baseName.toLowerCase()) : false;
          });
          if (related.length > 0) {
            matches = related;
            widenedNote = `\n\n(No files matched "${pattern}" — showing .${extMatch[1]} files with "${baseName}" in name.)`;
          }
        }
      }
    }

    if (matches.length === 0) {
      const synonyms = getSynonyms(baseName || pattern);
      const related = ctx.files.filter(f => {
        const p = (f.path ?? f.fileName).toLowerCase();
        return synonyms.some(s => p.includes(s));
      });
      if (related.length > 0) {
        matches = related.slice(0, 20);
        widenedNote = `\n\n(No files matched "${pattern}" — showing files with related names.)`;
      }
    }
  }

  if (matches.length === 0) {
    return {
      tool_use_id: '',
      content: `No files match "${pattern}" or related patterns. The project has ${ctx.files.length} files. Try a broader pattern like "**/*.liquid" or "sections/*".`,
    };
  }

  const formatted = matches.map(f => {
    const sizeMatch = f.content.match(/^\[(\d+)/);
    const sizeHint = sizeMatch ? ` ~${sizeMatch[1]} chars` : '';
    return `${f.path ?? f.fileName} (${f.fileType}${sizeHint})`;
  }).join('\n');

  return {
    tool_use_id: '',
    content: `${matches.length} file(s) match "${pattern}":\n${formatted}${widenedNote}`,
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
