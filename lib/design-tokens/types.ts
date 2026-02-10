/**
 * REQ-52: Design System Analysis & Token Management
 * Core type definitions for the design token extraction engine.
 */

// ---------------------------------------------------------------------------
// Token categories
// ---------------------------------------------------------------------------

export type TokenCategory =
  | 'color'
  | 'typography'
  | 'spacing'
  | 'shadow'
  | 'border'
  | 'animation';

// ---------------------------------------------------------------------------
// Extracted token (from parsers — Task 1)
// ---------------------------------------------------------------------------

/** A single extracted token with full source-location metadata. */
export interface ExtractedToken {
  /** Unique ID (generated during extraction). */
  id: string;
  /** Token name if one was detected (CSS custom-property, Liquid setting, etc.). Null for hardcoded values. */
  name: string | null;
  /** Semantic category. */
  category: TokenCategory;
  /** Raw CSS/JSON/JS value string. */
  value: string;
  /** File path the token was found in. */
  filePath: string;
  /** 1-based line number in source. */
  lineNumber: number;
  /** Surrounding source code for context. */
  context: string;
}

// ---------------------------------------------------------------------------
// Inferred token (after grouping/naming — Task 2)
// ---------------------------------------------------------------------------

export interface InferredToken extends ExtractedToken {
  suggestedName: string;
  confidence: number;
  groupId: string;
  inconsistencies: string[];
}

export interface TokenGroup {
  id: string;
  tokens: ExtractedToken[];
  category: TokenCategory;
  /** Human-readable pattern description, e.g. "shades of blue", "4px spacing scale". */
  pattern: string;
}

export interface ScalePattern {
  baseValue: number;
  ratio: number;
  values: number[];
}

export interface NameSuggestion {
  name: string;
  confidence: number;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Aggregated (simple) design tokens — used by the API
// ---------------------------------------------------------------------------

/** Aggregated design tokens extracted from a project's theme files. */
export interface DesignTokens {
  colors: string[];
  fonts: string[];
  fontSizes: string[];
  spacing: string[];
  radii: string[];
  shadows: string[];
}

/** Design tokens with full source tracking. */
export interface DesignToken {
  value: string;
  source?: string;
}

export interface DesignTokensDetailed {
  colors: DesignToken[];
  fonts: DesignToken[];
  fontSizes: DesignToken[];
  spacing: DesignToken[];
  radii: DesignToken[];
  shadows: DesignToken[];
}

/** Empty DesignTokens for merging / initialization. */
export function emptyTokens(): DesignTokens {
  return {
    colors: [],
    fonts: [],
    fontSizes: [],
    spacing: [],
    radii: [],
    shadows: [],
  };
}
