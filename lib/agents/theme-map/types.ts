/**
 * Theme Intelligence Map — pre-computed structural understanding of an entire theme.
 *
 * Generated once by feeding ALL theme files to a large-context model (Grok 4),
 * cached, and used for instant file routing on every user request. Replaces
 * per-request scouting, chunking, and context-engine scoring.
 */

export interface ThemeMapFeature {
  /** Line range [start, end] (1-based) */
  lines: [number, number];
  /** What this feature does */
  description: string;
  /** Searchable keywords for prompt matching */
  keywords: string[];
}

export interface ThemeMapFile {
  /** e.g. "snippets/product-form-dynamic.liquid" */
  path: string;
  /** One-sentence purpose */
  purpose: string;
  /** Named features within this file, keyed by slug */
  features: Record<string, ThemeMapFeature>;
  /** Files this file depends on (renders, includes, imports) */
  dependsOn: string[];
  /** Files that render/include this file */
  renderedBy: string[];
  /** Notable patterns or conventions in this file */
  patterns: string[];
  /** LLM-generated functional summary */
  llmSummary?: string;
  /** SHA-256 of content when summary was generated */
  summaryContentHash?: string;
  /** SHA-256 of current content for fingerprint gate */
  contentHash?: string;
}

export interface ThemeMap {
  projectId: string;
  generatedAt: string;
  modelUsed: string;
  /** Total files analyzed */
  fileCount: number;
  /** Map version for cache invalidation */
  version: number;
  /** File entries keyed by path */
  files: Record<string, ThemeMapFile>;
  /** Theme-wide patterns (e.g. "uses t4s- prefix for all custom classes") */
  globalPatterns: string[];
  /** Theme-wide dependency graph summary */
  entryPoints: string[];
  /** Schema version (2 = supports summaries) */
  schemaVersion?: number;
  /** Detected theme framework */
  framework?: string;
  /** Signals that led to framework detection */
  frameworkSignals?: string[];
  /** Indexing status for UI feedback */
  intelligenceStatus?: 'pending' | 'indexing' | 'ready' | 'enriching' | 'stale';
}

export interface ThemeMapLookupResult {
  /** Primary target files with line ranges */
  targets: Array<{
    path: string;
    purpose: string;
    features: Array<{
      name: string;
      lines: [number, number];
      description: string;
    }>;
    patterns: string[];
  }>;
  /** Related files the agent may need to read */
  related: string[];
  /** Whether the map had a confident match */
  confident: boolean;
  /** Theme-wide conventions (from globalPatterns) */
  conventions: string[];
}
