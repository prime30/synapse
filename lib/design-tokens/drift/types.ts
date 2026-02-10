/**
 * REQ-52 Task 6: Design drift detection types.
 *
 * Types for detecting hardcoded values that drift from the stored design
 * token palette and for generating tokenisation suggestions.
 */

import type { TokenCategory } from '../types';

// ---------------------------------------------------------------------------
// Drift detection results
// ---------------------------------------------------------------------------

/** Full drift analysis result for a single file. */
export interface DriftResult {
  /** Path of the analysed file. */
  filePath: string;
  /** Values that don't match any existing design token. */
  hardcodedValues: DriftItem[];
  /** Values that are *close* to an existing token (but not exact). */
  nearMatches: DriftItem[];
  /** Actionable suggestions to replace hardcoded values with tokens. */
  suggestions: TokenizationSuggestion[];
}

/** A single hardcoded or near-match value found during drift detection. */
export interface DriftItem {
  /** The raw value found in source (e.g. "#3B82F5", "16px"). */
  value: string;
  /** 1-based line number in the source file. */
  lineNumber: number;
  /** Surrounding source context. */
  context: string;
  /** Semantic category of the value. */
  category: TokenCategory;
}

/** Suggestion to replace a hardcoded value with an existing design token. */
export interface TokenizationSuggestion {
  /** The hardcoded value found in source. */
  hardcodedValue: string;
  /** 1-based line number where the value was found. */
  lineNumber: number;
  /** Name of the existing token that should be used instead. */
  suggestedToken: string;
  /** Ready-to-use replacement string, e.g. "var(--color-primary)". */
  suggestedReplacement: string;
  /** Match quality score from 0 (no match) to 1 (exact match). */
  confidence: number;
  /** Human-readable explanation of why this suggestion was made. */
  reason: string;
}
