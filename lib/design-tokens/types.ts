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
  | 'animation'
  | 'breakpoint'
  | 'layout'
  | 'zindex'
  | 'a11y';

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
  /** Optional extraction metadata (keyframes, state, etc.). */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Inferred token (after grouping/naming — Task 2)
// ---------------------------------------------------------------------------

export type TokenTier = 'primitive' | 'semantic' | 'component';

export interface InferredToken extends ExtractedToken {
  suggestedName: string;
  confidence: number;
  groupId: string;
  inconsistencies: string[];
  /** Three-tier hierarchy: primitive (raw values), semantic (role-based), component (UI-specific). */
  tier: TokenTier;
  /** When value is var(--other-token), the ID of the referenced token. */
  semantic_parent_id?: string | null;
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
  animation: string[];
  breakpoints: string[];
  layout: string[];
  zindex: string[];
  a11y: string[];
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
  animation: DesignToken[];
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
    animation: [],
    breakpoints: [],
    layout: [],
    zindex: [],
    a11y: [],
  };
}
