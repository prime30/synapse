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
import type { MemoryEntry } from './developer-memory';
import { filterActiveMemories, formatMemoryForPrompt } from './developer-memory';
import type { LoadedTermMapping } from './term-mapping-learner';

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
  /** Layer 8: Developer memory prompt to prepend to agent system prompts */
  memoryPrompt?: string;
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

// ── Theme-Aware Topic Resolution ──────────────────────────────────────

/**
 * Maps common user topics/keywords → Shopify theme file path patterns.
 * When a user's message matches a topic, the matching patterns are used to
 * boost file selection — ensuring the agent always gets the right files
 * even when fuzzy matching alone would miss them.
 *
 * Patterns support simple glob-like syntax (* matches anything).
 * Each entry has `patterns` (file path globs) and `keywords` (trigger words).
 */
interface ThemeTopicRule {
  keywords: string[];
  /** File path patterns to boost. '*' matches any sequence of chars. */
  patterns: string[];
  /** Score boost for matched files (default 8) */
  boost?: number;
}

const THEME_TOPIC_MAP: ThemeTopicRule[] = [
  // ── Product ────────────────────────────────────────────────────────
  {
    keywords: ['product', 'pdp', 'variant', 'add to cart', 'buy button', 'product form', 'restock', 'awaiting restock', 'color swatch'],
    patterns: [
      'templates/product*.json',
      'sections/main-product*.liquid',
      'sections/product-*.liquid',
      'snippets/product-*.liquid',
      'snippets/product-form.liquid',
      'snippets/product-form-dynamic.liquid',
      'snippets/price*.liquid',
      'snippets/buy-buttons*.liquid',
      'assets/product*.js',
      'assets/product-form-dynamic.js',
      'assets/product*.css',
    ],
  },
  // ── Product Images / Media ─────────────────────────────────────────
  {
    keywords: ['image', 'thumbnail', 'media', 'gallery', 'slider', 'carousel', 'lazy', 'lazysizes', 'srcset', 'responsive image'],
    patterns: [
      'snippets/product-thumbnail*.liquid',
      'snippets/product-media*.liquid',
      'snippets/product-img*.liquid',
      'snippets/product-form*.liquid',
      'snippets/product-form-dynamic.liquid',
      'sections/main-product*.liquid',
      'assets/lazysizes*.js',
      'assets/product-form*.js',
      'assets/media-gallery*.js',
      'assets/slider*.js',
      'assets/slick*.js',
      'assets/flickity*.js',
    ],
    boost: 10,
  },
  // ── Collection ─────────────────────────────────────────────────────
  {
    keywords: ['collection', 'collection page', 'product grid', 'product list', 'filter', 'facet', 'sort'],
    patterns: [
      'templates/collection*.json',
      'sections/main-collection*.liquid',
      'sections/collection-*.liquid',
      'snippets/product-card*.liquid',
      'snippets/card-product*.liquid',
      'snippets/collection-*.liquid',
      'assets/collection*.js',
      'assets/facets*.js',
    ],
  },
  // ── Cart ────────────────────────────────────────────────────────────
  {
    keywords: ['cart', 'checkout', 'line item', 'cart drawer', 'cart page', 'mini cart'],
    patterns: [
      'templates/cart*.json',
      'sections/main-cart*.liquid',
      'sections/cart-*.liquid',
      'snippets/cart-*.liquid',
      'assets/cart*.js',
    ],
  },
  // ── Header / Navigation ────────────────────────────────────────────
  {
    keywords: ['header', 'navigation', 'nav', 'menu', 'mega menu', 'announcement bar', 'logo'],
    patterns: [
      'sections/header*.liquid',
      'sections/announcement*.liquid',
      'snippets/header-*.liquid',
      'snippets/menu-*.liquid',
      'assets/header*.js',
      'assets/menu*.js',
    ],
  },
  // ── Footer ─────────────────────────────────────────────────────────
  {
    keywords: ['footer', 'newsletter', 'subscribe'],
    patterns: [
      'sections/footer*.liquid',
      'snippets/footer-*.liquid',
    ],
  },
  // ── Layout / Global ────────────────────────────────────────────────
  {
    keywords: ['layout', 'theme.liquid', 'global', 'body class', 'preloader', 'loading'],
    patterns: [
      'layout/theme.liquid',
      'layout/password.liquid',
      'config/settings_schema.json',
      'config/settings_data.json',
      'assets/base*.css',
      'assets/global*.js',
      'assets/theme*.js',
      'assets/theme*.css',
    ],
  },
  // ── Blog / Article ─────────────────────────────────────────────────
  {
    keywords: ['blog', 'article', 'post', 'author'],
    patterns: [
      'templates/blog*.json',
      'templates/article*.json',
      'sections/main-blog*.liquid',
      'sections/main-article*.liquid',
      'sections/blog-*.liquid',
      'sections/article-*.liquid',
    ],
  },
  // ── Search ─────────────────────────────────────────────────────────
  {
    keywords: ['search', 'predictive search', 'search results'],
    patterns: [
      'templates/search*.json',
      'sections/main-search*.liquid',
      'sections/predictive-search*.liquid',
      'assets/search*.js',
      'assets/predictive-search*.js',
    ],
  },
  // ── Page ────────────────────────────────────────────────────────────
  {
    keywords: ['page', 'about', 'contact', 'faq'],
    patterns: [
      'templates/page*.json',
      'sections/main-page*.liquid',
      'sections/contact-form*.liquid',
    ],
  },
  // ── CSS / Styling ──────────────────────────────────────────────────
  {
    keywords: ['style', 'css', 'color', 'font', 'spacing', 'custom css', 'animation', 'transition'],
    patterns: [
      'assets/base*.css',
      'assets/section-*.css',
      'assets/component-*.css',
      'assets/custom*.css',
      'assets/theme*.css',
      'assets/t4s-*.css',
    ],
  },
  // ── JavaScript / Interactivity ─────────────────────────────────────
  {
    keywords: ['javascript', 'script', 'click', 'event', 'interactive', 'dynamic', 'ajax'],
    patterns: [
      'assets/global*.js',
      'assets/theme*.js',
      'assets/custom*.js',
      'assets/section-*.js',
    ],
  },
];

/**
 * Match a glob-like pattern (supports * wildcard) against a file path.
 * The pattern is case-insensitive and matches anywhere in the path.
 */
function matchGlobPattern(pattern: string, filePath: string): boolean {
  const normalised = filePath.replace(/\\/g, '/').toLowerCase();
  const patternLower = pattern.toLowerCase();

  // Convert glob pattern to regex: * → .*, escape other special chars
  const regexStr = patternLower
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  const re = new RegExp(`(^|/)${regexStr}$`);
  return re.test(normalised);
}

/**
 * Given a user message, find all matching theme topic rules.
 * Returns the union of file patterns from all matched rules.
 */
function matchThemeTopics(userMessage: string): { patterns: string[]; boost: number }[] {
  const msgLower = userMessage.toLowerCase();
  const matched: { patterns: string[]; boost: number }[] = [];

  for (const rule of THEME_TOPIC_MAP) {
    const hit = rule.keywords.some((kw) => msgLower.includes(kw));
    if (hit) {
      matched.push({ patterns: rule.patterns, boost: rule.boost ?? 8 });
    }
  }

  return matched;
}

// ── ContextEngine ─────────────────────────────────────────────────────

export class ContextEngine {
  private index = new Map<string, FileMetadata>();
  private fileContents = new Map<string, string>();
  private maxTokens: number;
  private depCache = new Map<string, string[]>();

  /**
   * Layer 8: Developer memory entries loaded for the current project.
   * Injected into agent system prompts via `getMemoryPrompt()`.
   */
  private memories: MemoryEntry[] = [];
  private memoryMinConfidence = 0.6;

  /** Learned term-to-file mappings for fuzzyMatch boosting. */
  private termMappings: LoadedTermMapping[] = [];
  private termMappingIndex = new Map<string, string[]>();

  constructor(maxTokens = 16_000) {
    this.maxTokens = maxTokens;
  }

  // ── Layer 8: Developer Memory ───────────────────────────────────────

  /**
   * Load developer memory entries for context injection.
   * Call this on session start or when memories change.
   */
  loadMemories(entries: MemoryEntry[], minConfidence = 0.6): void {
    this.memories = entries;
    this.memoryMinConfidence = minConfidence;
  }

  /**
   * Get the formatted memory block for injection into agent system prompts.
   * Returns an empty string if no active memories exist.
   */
  getMemoryPrompt(): string {
    const active = filterActiveMemories(this.memories, this.memoryMinConfidence);
    return formatMemoryForPrompt(active);
  }

  /**
   * Get the count of active (non-rejected, high-confidence) memories.
   * Used by the StatusBar memory indicator.
   */
  getActiveMemoryCount(): number {
    return filterActiveMemories(this.memories, this.memoryMinConfidence).length;
  }

  /**
   * Get active memories by type.
   */
  getActiveMemoriesByType(type: MemoryEntry['type']): MemoryEntry[] {
    return filterActiveMemories(this.memories, this.memoryMinConfidence).filter(
      (m) => m.type === type
    );
  }

  // ── Layer 9: Learned Term Mappings ─────────────────────────────────

  /**
   * Load learned term-to-file mappings for fuzzyMatch boosting.
   * Call once per session; results are cached in-memory.
   */
  loadTermMappingsData(mappings: LoadedTermMapping[]): void {
    this.termMappings = mappings;
    this.termMappingIndex.clear();
    for (const m of mappings) {
      for (const fp of m.filePaths) {
        const existing = this.termMappingIndex.get(m.term);
        if (existing) {
          if (!existing.includes(fp)) existing.push(fp);
        } else {
          this.termMappingIndex.set(m.term, [fp]);
        }
      }
    }
  }

  /** Get the count of loaded term mappings. */
  getTermMappingCount(): number {
    return this.termMappings.length;
  }

  /** Get all loaded term mappings (for UI display). */
  getTermMappings(): LoadedTermMapping[] {
    return this.termMappings;
  }

  // ── Indexing ──────────────────────────────────────────────────────

  /**
   * Index all project files – computes metadata, token estimates, and
   * detects outgoing references for each file.
   * When yieldOpts is provided, yields to the event loop every N files so
   * timers (e.g. heartbeat) can run during long runs.
   */
  async indexFiles(
    files: FileContext[],
    yieldOpts?: { every: number; yieldFn: () => Promise<void> },
  ): Promise<void> {
    this.index.clear();
    this.fileContents.clear();
    this.depCache.clear();

    const yieldEvery = yieldOpts?.every ?? 50;
    const yieldFn = yieldOpts?.yieldFn ?? (() => new Promise<void>(r => setTimeout(r, 0)));
    const useSyncFallback = process.env.SYNC_INDEX_FILES === 'true';

    for (let i = 0; i < files.length; i++) {
      if (!useSyncFallback && i > 0 && i % yieldEvery === 0) {
        await yieldFn();
      }
      const file = files[i];
      const path = file.path ?? file.fileName;
      const tokens = estimateTokens(file.content);

      const isStub = file.content.startsWith('[') && /^\[\d+\s+chars/.test(file.content);
      const references = isStub
        ? []
        : detectReferences(file.fileType, file.content, file.fileName);

      const meta: FileMetadata = {
        fileId: file.fileId,
        fileName: file.fileName,
        fileType: file.fileType,
        path,
        sizeBytes: isStub ? 0 : new TextEncoder().encode(file.content).byteLength,
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
   *  - Theme topic pattern match      → +8..10  (domain-aware boost)
   *  - Path segment match per word    → +5
   *  - Partial substring match        → +3  (on filename)
   *  - File-type relevance            → +3  (query hints at css / js)
   *  - Recency boost                  → +1  (most recent updatedAt)
   */
  fuzzyMatch(query: string, topN = 5): FileMetadata[] {
    const queryLower = query.toLowerCase();
    const queryWords = toSegments(query);
    const scored: { meta: FileMetadata; score: number }[] = [];

    // ── Theme-aware topic boosting ────────────────────────────────────
    // Match the user's query against our Shopify theme topic map.
    // Files matching topic patterns get a significant score boost,
    // ensuring domain-relevant files surface even with vague queries.
    const topicMatches = matchThemeTopics(query);

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

      // Theme topic pattern match — domain-aware boosting
      for (const topic of topicMatches) {
        for (const pattern of topic.patterns) {
          if (matchGlobPattern(pattern, meta.path) || matchGlobPattern(pattern, meta.fileName)) {
            score += topic.boost;
            break; // One match per topic is enough
          }
        }
      }

      // Learned term mapping boost (+6)
      if (this.termMappingIndex.size > 0) {
        let termBoostApplied = false;
        for (const word of queryWords) {
          if (termBoostApplied) break;
          const mappedPaths = this.termMappingIndex.get(word);
          if (mappedPaths) {
            for (const fp of mappedPaths) {
              if (meta.path === fp || meta.fileName === fp || meta.path.endsWith(fp)) {
                score += 6;
                termBoostApplied = true;
                break;
              }
            }
          }
        }
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
    const cacheKey = fileIds.sort().join(',');
    const cached = this.depCache.get(cacheKey);
    if (cached) return cached;

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

    const result = [...resolved];
    this.depCache.set(cacheKey, result);
    return result;
  }

  // ── Context building ──────────────────────────────────────────────

  /**
   * Build a context window that fits within the token budget.
   *
   * Inclusion order:
   *  0. Developer memory (Layer 8) — reserved from budget first
   *  1. Priority files (always included first)
   *  2. Requested files
   *  3. Auto-resolved dependencies of (1) and (2)
   *
   * Files that do not fit are recorded in `excluded`.
   */
  buildContext(
    requestedFileIds: string[],
    priorityFileIds?: string[],
    tokenBudget?: number
  ): ContextResult {
    // Reserve tokens for Layer 8 developer memory prompt
    const memoryPrompt = this.getMemoryPrompt();
    const memoryTokens = memoryPrompt ? estimateTokens(memoryPrompt) : 0;
    const maxTokens = tokenBudget ?? this.maxTokens;

    const budget: ContextBudget = {
      maxTokens,
      usedTokens: memoryTokens,
      remainingTokens: maxTokens - memoryTokens,
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
      memoryPrompt: memoryPrompt || undefined,
    };
  }

  /**
   * Select files relevant to the user's current message.
   * Extracts explicit file references, fuzzy-matches natural language,
   * applies theme-aware topic resolution, and always includes the
   * active file with its dependencies.
   * Reserves budget for dependency files before allocating to others.
   */
  selectRelevantFiles(
    userMessage: string,
    recentMessages?: string[],
    activeFilePath?: string,
    budget?: number
  ): ContextResult {
    const tokenBudget = budget ?? this.maxTokens;

    // 1. Extract explicit file references from userMessage
    const explicitPaths = this.extractFileReferences(userMessage);

    // 2. If activeFilePath is provided, find its ID and always include it
    let activeFileId: string | undefined;
    if (activeFilePath) {
      const activeMeta = this.findByPath(activeFilePath);
      activeFileId = activeMeta?.fileId;
    }

    // 3. Theme-aware topic resolution — match user intent to known file patterns
    //    This ensures that "product image not showing" pulls in main-product.liquid,
    //    product-thumbnail.liquid, lazysizes.js, etc. even when the user doesn't
    //    mention specific file names.
    const topicFileIds = this.resolveTopicFiles(userMessage);

    // 4. Resolve dependencies for all explicit references + active file + topic files
    const explicitIds = explicitPaths
      .map((p) => this.findByPath(p)?.fileId)
      .filter((id): id is string => id != null);
    const coreIds = [...new Set([
      ...(activeFileId ? [activeFileId] : []),
      ...explicitIds,
      ...topicFileIds,
    ])];
    const coreWithDeps = this.resolveWithDependencies(coreIds);
    const depIds = coreWithDeps.filter((id) => !coreIds.includes(id));

    // Reserve budget: active → explicit → topic → deps → fuzzy
    const priorityFileIds: string[] = [
      ...(activeFileId ? [activeFileId] : []),
      ...explicitIds.filter((id) => id !== activeFileId),
      ...topicFileIds.filter((id) => id !== activeFileId && !explicitIds.includes(id)),
      ...depIds,
    ];

    // 5. Use fuzzyMatch on userMessage to find additional relevant files
    //    (fuzzyMatch already incorporates theme topic scoring)
    const fuzzyFromCurrent = this.fuzzyMatch(userMessage, 10).map((m) => m.fileId);

    // 6. If recentMessages provided, also fuzzyMatch on recent messages (lower priority)
    const fuzzyFromRecent = recentMessages
      ? recentMessages.flatMap((msg) => this.fuzzyMatch(msg, 5).map((m) => m.fileId))
      : [];
    const fuzzyIds = [...new Set([...fuzzyFromCurrent, ...fuzzyFromRecent])].filter(
      (id) => !priorityFileIds.includes(id)
    );

    // 7. Build context with priority ordering: active -> explicit -> topic -> deps -> fuzzy
    return this.buildContext(fuzzyIds, priorityFileIds, tokenBudget);
  }

  /**
   * Enhanced file selection that combines fuzzy matching with semantic search.
   * Falls back to fuzzy-only if semantic search is unavailable.
   */
  async selectRelevantFilesWithSemantics(
    projectId: string,
    userMessage: string,
    recentMessages?: string[],
    activeFilePath?: string,
    budget?: number,
  ): Promise<ContextResult> {
    // Start with the standard fuzzy selection
    const fuzzyResult = this.selectRelevantFiles(
      userMessage,
      recentMessages,
      activeFilePath,
      budget,
    );

    // EPIC A: Use hybrid search (vector + keyword fusion via RRF)
    try {
      const { hybridSearch } = await import('./hybrid-search');
      const hybridResults = await hybridSearch(
        projectId,
        userMessage,
        Array.from(this.index.values()).map(f => ({ fileId: f.fileId, fileName: f.fileName, content: this.fileContents.get(f.fileId) ?? '' })),
        10,
      );

      if (hybridResults.length > 0) {
        // Merge hybrid results with fuzzy results
        const existingIds = new Set(fuzzyResult.files.map(f => f.fileId));
        const additionalIds = hybridResults
          .filter(r => !existingIds.has(r.fileId) && r.score > 0)
          .map(r => r.fileId);

        if (additionalIds.length > 0) {
          const allPriorityIds = [
            ...fuzzyResult.files.map(f => f.fileId),
            ...additionalIds,
          ];
          return this.buildContext([], allPriorityIds, budget);
        }
      }
    } catch {
      // Hybrid search unavailable -- use fuzzy results only
    }

    return fuzzyResult;
  }

  /**
   * Extract file references from a message (paths, render/include names, asset names).
   */
  private extractFileReferences(text: string): string[] {
    const refs: string[] = [];

    // Direct path mentions (sections/foo.liquid, snippets/bar.liquid, etc.)
    const pathRe =
      /(?:sections|snippets|assets|templates|layout|config|blocks|locales)\/[\w.-]+(?:\.liquid|\.css|\.js|\.json)?/g;
    let m: RegExpExecArray | null;
    while ((m = pathRe.exec(text)) !== null) {
      refs.push(m[0]);
    }

    // {% render 'name' %} or {% include 'name' %}
    const renderRe = /\{%[-\s]*(?:render|include)\s+['"]([^'"]+)['"]/g;
    while ((m = renderRe.exec(text)) !== null) {
      refs.push(`snippets/${m[1]}.liquid`);
    }

    // {{ 'name' | asset_url }}
    const assetRe = /\{\{\s*['"]([^'"]+)['"]\s*\|\s*asset_url/g;
    while ((m = assetRe.exec(text)) !== null) {
      refs.push(`assets/${m[1]}`);
    }

    return [...new Set(refs)];
  }

  // ── Theme topic resolution ───────────────────────────────────────

  /**
   * Resolve theme topic patterns into concrete file IDs from the index.
   * Uses the THEME_TOPIC_MAP to map user intent keywords to file patterns,
   * then matches those patterns against indexed files.
   */
  private resolveTopicFiles(userMessage: string): string[] {
    const topicMatches = matchThemeTopics(userMessage);
    if (topicMatches.length === 0) return [];

    const matchedIds = new Set<string>();

    for (const topic of topicMatches) {
      for (const pattern of topic.patterns) {
        for (const meta of this.index.values()) {
          if (
            matchGlobPattern(pattern, meta.path) ||
            matchGlobPattern(pattern, meta.fileName)
          ) {
            matchedIds.add(meta.fileId);
          }
        }
      }
    }

    return [...matchedIds];
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

// ── LRU Cache of ContextEngine per project ────────────────────────────

const MAX_CACHED_ENGINES = 8;

interface CachedEntry {
  engine: ContextEngine;
  lastUsed: number;
}

const engineCache = new Map<string, CachedEntry>();

/**
 * Returns a ContextEngine for the given project, reusing from cache when
 * available. Evicts the least-recently-used entry when the cache is full.
 */
export function getProjectContextEngine(
  projectId: string,
  maxTokens = 16_000,
): ContextEngine {
  const existing = engineCache.get(projectId);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.engine;
  }

  if (engineCache.size >= MAX_CACHED_ENGINES) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of engineCache) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }
    if (oldestKey) engineCache.delete(oldestKey);
  }

  const engine = new ContextEngine(maxTokens);
  engineCache.set(projectId, { engine, lastUsed: Date.now() });
  return engine;
}

export default ContextEngine;
