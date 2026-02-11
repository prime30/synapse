/**
 * Unified context engine for multi-agent Shopify theme IDE.
 *
 * Replaces the legacy `context-builder.ts` (limited 4 000-token window)
 * and enhances the existing `lib/context/detector.ts` dependency detection
 * with fuzzy file matching, automatic dependency resolution, and
 * token-budgeted context assembly up to ~16 000 tokens for specialists.
 */

import type { FileContext } from '@/lib/types/agent';
import { estimateTokens } from './token-counter';

// ── Types ─────────────────────────────────────────────────────────────

export interface FileMetadata {
  fileId: string;
  fileName: string;
  fileType: 'liquid' | 'javascript' | 'css' | 'other';
  path: string;
  sizeBytes: number;
  tokenEstimate: number;
  updatedAt: Date;
  /** Detected references to other files (render 'x', asset_url, etc.) */
  references: string[];
}

export interface ContextBudget {
  maxTokens: number;
  usedTokens: number;
  remainingTokens: number;
}

export interface ContextResult {
  files: FileContext[];
  budget: ContextBudget;
  /** Files that were requested but excluded due to budget */
  excluded: string[];
}

// ── Reference extraction helpers ──────────────────────────────────────

/** Extract render / include / section references from Liquid content. */
function extractLiquidReferences(content: string): string[] {
  const refs: string[] = [];
  const renderIncludeRe = /\{%[-\s]*(?:render|include)\s+['"]([^'"]+)['"]/g;
  const sectionRe = /\{%[-\s]*section\s+['"]([^'"]+)['"]/g;

  let m: RegExpExecArray | null;

  while ((m = renderIncludeRe.exec(content)) !== null) {
    const name = m[1];
    // render/include → snippets/<name>.liquid
    refs.push(`snippets/${name}.liquid`);
  }

  while ((m = sectionRe.exec(content)) !== null) {
    const name = m[1];
    // section → sections/<name>.liquid
    refs.push(`sections/${name}.liquid`);
  }

  return refs;
}

/** Extract asset_url references from Liquid/JS/CSS content. */
function extractAssetReferences(content: string): string[] {
  const refs: string[] = [];
  const assetRe = /\{\{\s*['"]([^'"]+)['"]\s*\|\s*asset_url\s*\}\}/g;

  let m: RegExpExecArray | null;
  while ((m = assetRe.exec(content)) !== null) {
    refs.push(`assets/${m[1]}`);
  }

  return refs;
}

/** Extract section type references from template JSON files. */
function extractTemplateSectionReferences(content: string): string[] {
  const refs: string[] = [];
  try {
    const data = JSON.parse(content) as {
      sections?: Record<string, { type?: string }>;
    };
    const sections = data.sections ?? {};
    for (const section of Object.values(sections)) {
      if (section?.type) {
        const sectionType = section.type;
        refs.push(
          sectionType.endsWith('.liquid')
            ? `sections/${sectionType}`
            : `sections/${sectionType}.liquid`
        );
      }
    }
  } catch {
    // not valid JSON – skip
  }
  return refs;
}

/** Detect all outgoing references for a file based on its type and content. */
function detectReferences(
  fileType: FileMetadata['fileType'],
  content: string,
  fileName: string
): string[] {
  const refs: string[] = [];

  if (fileType === 'liquid') {
    refs.push(...extractLiquidReferences(content));
    refs.push(...extractAssetReferences(content));
  }

  // Template JSON files live under templates/ and end with .json
  if (
    fileType === 'other' &&
    fileName.endsWith('.json') &&
    /^templates[/\\]/i.test(fileName)
  ) {
    refs.push(...extractTemplateSectionReferences(content));
  }

  // Asset references can appear in any Liquid file
  if (fileType === 'liquid') {
    // already handled above
  }

  // De-duplicate
  return [...new Set(refs)];
}

// ── Fuzzy matching helpers ────────────────────────────────────────────

/** Split a string into lowercase segments on `/`, `-`, `_`, and `.`. */
function toSegments(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[/\\\-_.]+/)
    .filter(Boolean);
}

/** Check whether query mentions style / css related terms. */
function querySuggestsCss(queryWords: string[]): boolean {
  const cssHints = new Set([
    'style',
    'styles',
    'css',
    'stylesheet',
    'color',
    'font',
    'layout',
    'theme',
  ]);
  return queryWords.some((w) => cssHints.has(w));
}

/** Check whether query mentions javascript related terms. */
function querySuggestsJs(queryWords: string[]): boolean {
  const jsHints = new Set([
    'script',
    'scripts',
    'js',
    'javascript',
    'function',
    'event',
    'click',
    'interactive',
  ]);
  return queryWords.some((w) => jsHints.has(w));
}

// ── ContextEngine ─────────────────────────────────────────────────────

export class ContextEngine {
  private index = new Map<string, FileMetadata>();
  private fileContents = new Map<string, string>();
  private maxTokens: number;

  constructor(maxTokens = 16_000) {
    this.maxTokens = maxTokens;
  }

  // ── Indexing ──────────────────────────────────────────────────────

  /**
   * Index all project files – computes metadata, token estimates, and
   * detects outgoing references for each file.
   */
  indexFiles(files: FileContext[]): void {
    this.index.clear();
    this.fileContents.clear();

    for (const file of files) {
      const path = file.path ?? file.fileName;
      const tokens = estimateTokens(file.content);
      const references = detectReferences(
        file.fileType,
        file.content,
        file.fileName
      );

      const meta: FileMetadata = {
        fileId: file.fileId,
        fileName: file.fileName,
        fileType: file.fileType,
        path,
        sizeBytes: new TextEncoder().encode(file.content).byteLength,
        tokenEstimate: tokens,
        updatedAt: new Date(),
        references,
      };

      this.index.set(file.fileId, meta);
      this.fileContents.set(file.fileId, file.content);
    }
  }

  /** Return the current file index as an array. */
  getFileIndex(): FileMetadata[] {
    return [...this.index.values()];
  }

  // ── Fuzzy matching ────────────────────────────────────────────────

  /**
   * Fuzzy-match files by name / path against a natural-language query.
   *
   * Scoring rubric:
   *  - Exact filename match           → +10
   *  - Path segment match per word    → +5
   *  - Partial substring match        → +3  (on filename)
   *  - File-type relevance            → +3  (query hints at css / js)
   *  - Recency boost                  → +1  (most recent updatedAt)
   */
  fuzzyMatch(query: string, topN = 5): FileMetadata[] {
    const queryLower = query.toLowerCase();
    const queryWords = toSegments(query);
    const scored: { meta: FileMetadata; score: number }[] = [];

    // Determine newest timestamp across the index for recency scoring.
    let newestTs = 0;
    for (const meta of this.index.values()) {
      const ts = meta.updatedAt.getTime();
      if (ts > newestTs) newestTs = ts;
    }

    for (const meta of this.index.values()) {
      let score = 0;
      const fileNameLower = meta.fileName.toLowerCase();
      const pathLower = meta.path.toLowerCase();
      const pathSegments = toSegments(meta.path);

      // Exact filename match
      if (fileNameLower === queryLower || pathLower === queryLower) {
        score += 10;
      }

      // Path segment match – each query word matched in path segments
      for (const word of queryWords) {
        if (pathSegments.includes(word)) {
          score += 5;
        }
      }

      // Partial substring match in filename
      for (const word of queryWords) {
        if (word.length >= 2 && fileNameLower.includes(word)) {
          score += 3;
        }
      }

      // File type relevance
      if (querySuggestsCss(queryWords) && meta.fileType === 'css') {
        score += 3;
      }
      if (querySuggestsJs(queryWords) && meta.fileType === 'javascript') {
        score += 3;
      }

      // Recency boost – only if there's a meaningful spread
      if (newestTs > 0 && meta.updatedAt.getTime() === newestTs) {
        score += 1;
      }

      if (score > 0) {
        scored.push({ meta, score });
      }
    }

    // Sort descending by score, break ties by path alphabetically
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.meta.path.localeCompare(b.meta.path);
    });

    return scored.slice(0, topN).map((s) => s.meta);
  }

  // ── Dependency resolution ─────────────────────────────────────────

  /**
   * Given a set of file IDs, resolve all transitive dependencies
   * (render / include / section / asset references) and return the
   * expanded set of file IDs.
   */
  resolveWithDependencies(fileIds: string[]): string[] {
    const resolved = new Set<string>(fileIds);
    const queue = [...fileIds];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const meta = this.index.get(currentId);
      if (!meta) continue;

      for (const refPath of meta.references) {
        const target = this.findByPath(refPath);
        if (target && !resolved.has(target.fileId)) {
          resolved.add(target.fileId);
          queue.push(target.fileId);
        }
      }
    }

    return [...resolved];
  }

  // ── Context building ──────────────────────────────────────────────

  /**
   * Build a context window that fits within the token budget.
   *
   * Inclusion order:
   *  1. Priority files (always included first)
   *  2. Requested files
   *  3. Auto-resolved dependencies of (1) and (2)
   *
   * Files that do not fit are recorded in `excluded`.
   */
  buildContext(
    requestedFileIds: string[],
    priorityFileIds?: string[]
  ): ContextResult {
    const budget: ContextBudget = {
      maxTokens: this.maxTokens,
      usedTokens: 0,
      remainingTokens: this.maxTokens,
    };

    const included = new Map<string, FileContext>();
    const excluded: string[] = [];

    // Collect the full dependency-expanded ID set for ordering purposes.
    const allRequestedIds = new Set<string>([
      ...(priorityFileIds ?? []),
      ...requestedFileIds,
    ]);
    const withDeps = this.resolveWithDependencies([...allRequestedIds]);
    const depOnly = withDeps.filter((id) => !allRequestedIds.has(id));

    // Build ordered list: priority → requested → dependencies
    const orderedIds: string[] = [
      ...(priorityFileIds ?? []),
      ...requestedFileIds.filter(
        (id) => !(priorityFileIds ?? []).includes(id)
      ),
      ...depOnly,
    ];

    // De-duplicate while preserving order
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const id of orderedIds) {
      if (!seen.has(id)) {
        seen.add(id);
        deduped.push(id);
      }
    }

    for (const fileId of deduped) {
      const meta = this.index.get(fileId);
      const content = this.fileContents.get(fileId);
      if (!meta || content === undefined) {
        excluded.push(fileId);
        continue;
      }

      if (budget.usedTokens + meta.tokenEstimate > budget.maxTokens) {
        excluded.push(fileId);
        continue;
      }

      budget.usedTokens += meta.tokenEstimate;
      budget.remainingTokens = budget.maxTokens - budget.usedTokens;

      included.set(fileId, {
        fileId: meta.fileId,
        fileName: meta.fileName,
        fileType: meta.fileType,
        content,
        path: meta.path,
      });
    }

    return {
      files: [...included.values()],
      budget,
      excluded,
    };
  }

  // ── Internal helpers ──────────────────────────────────────────────

  /**
   * Find a file in the index by its theme-relative path.
   * Handles partial matches (e.g. "snippets/foo.liquid" matches
   * a file with path "snippets/foo.liquid" or fileName ending in
   * that suffix).
   */
  private findByPath(refPath: string): FileMetadata | undefined {
    const normalised = refPath.replace(/\\/g, '/').toLowerCase();

    for (const meta of this.index.values()) {
      const metaPath = meta.path.replace(/\\/g, '/').toLowerCase();
      const metaName = meta.fileName.replace(/\\/g, '/').toLowerCase();

      if (
        metaPath === normalised ||
        metaName === normalised ||
        metaPath.endsWith(`/${normalised}`) ||
        metaName.endsWith(`/${normalised}`)
      ) {
        return meta;
      }
    }
    return undefined;
  }
}

export default ContextEngine;
