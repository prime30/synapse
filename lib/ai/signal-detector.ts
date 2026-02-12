/**
 * AI response signal detection for EPIC 5.
 *
 * Scans AI-generated text to classify its intent (code, plan, error, etc.)
 * and infers the best output rendering mode for ChatInterface.
 *
 * Pure functions — no side effects, no external dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SignalType =
  | 'code_block'
  | 'plan'
  | 'error'
  | 'suggestion'
  | 'refactor';

export interface DetectedSignal {
  type: SignalType;
  confidence: number; // 0-1
  metadata: Record<string, unknown>;
}

export type OutputMode =
  | 'chat'
  | 'code'
  | 'plan'
  | 'review'
  | 'fix'
  | 'generate'
  | 'document';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Case-insensitive match returning every distinct keyword found. */
function matchKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase()));
}

/** Count non-overlapping regex matches. */
function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

// ---------------------------------------------------------------------------
// Individual signal detectors
// ---------------------------------------------------------------------------

function detectCodeBlock(response: string): DetectedSignal | null {
  const codeBlockPattern = /```(\w*)\n[\s\S]*?```/g;
  const matches = [...response.matchAll(codeBlockPattern)];
  if (matches.length === 0) return null;

  const languages = [
    ...new Set(
      matches.map((m) => m[1]).filter((lang): lang is string => lang !== ''),
    ),
  ];

  return {
    type: 'code_block',
    confidence: 0.95,
    metadata: { count: matches.length, languages },
  };
}

function detectPlan(response: string): DetectedSignal | null {
  // Numbered steps: "1. ", "2. ", etc.
  const numberedStepPattern = /^\s*\d+\.\s+/gm;
  const numberedStepCount = countMatches(response, numberedStepPattern);

  // "Step N:" patterns
  const stepNPattern = /\bStep\s+\d+\s*:/gi;
  const stepNCount = countMatches(response, stepNPattern);

  // Plan-related headers (markdown)
  const planHeaderPattern = /^#+\s*(plan|steps|roadmap|approach|strategy)\b/gim;
  const hasPlanHeader = planHeaderPattern.test(response);

  const stepCount = Math.max(numberedStepCount, stepNCount);

  if (stepCount >= 3 || (hasPlanHeader && stepCount >= 1)) {
    return {
      type: 'plan',
      confidence: stepCount >= 3 ? 0.85 : 0.7,
      metadata: { stepCount },
    };
  }

  if (stepCount === 2) {
    return {
      type: 'plan',
      confidence: 0.7,
      metadata: { stepCount },
    };
  }

  return null;
}

function detectError(response: string): DetectedSignal | null {
  // Explicit error patterns (type names / stack-trace-like markers)
  const explicitPatterns = [
    'TypeError',
    'ReferenceError',
    'SyntaxError',
    'RangeError',
  ];
  // Softer error keywords
  const softPatterns = [
    'error',
    'failed',
    'cannot',
    'exception',
    'bug',
    'crash',
  ];

  const explicitFound = matchKeywords(response, explicitPatterns);
  const softFound = matchKeywords(response, softPatterns);

  const allTerms = [...new Set([...explicitFound, ...softFound])];
  if (allTerms.length === 0) return null;

  const confidence = explicitFound.length > 0 ? 0.9 : 0.6;

  return {
    type: 'error',
    confidence,
    metadata: { errorTerms: allTerms },
  };
}

function detectSuggestion(response: string): DetectedSignal | null {
  const keywords = [
    'suggest',
    'recommend',
    'consider',
    'you could',
    'try',
    'alternative',
  ];
  const found = matchKeywords(response, keywords);
  if (found.length === 0) return null;

  return {
    type: 'suggestion',
    confidence: 0.7,
    metadata: { suggestionCount: found.length },
  };
}

function detectRefactor(response: string): DetectedSignal | null {
  const keywords = [
    'refactor',
    'extract',
    'rename',
    'simplify',
    'reorganize',
    'decouple',
    'split',
    'consolidate',
  ];
  const found = matchKeywords(response, keywords);
  if (found.length === 0) return null;

  return {
    type: 'refactor',
    confidence: 0.75,
    metadata: { refactorTerms: found },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan an AI response and return all detected signals.
 *
 * Signals are de-duplicated by type (highest confidence wins) and sorted by
 * confidence descending.
 */
export function detectSignals(response: string): DetectedSignal[] {
  const detectors = [
    detectCodeBlock,
    detectPlan,
    detectError,
    detectSuggestion,
    detectRefactor,
  ];

  const signals: DetectedSignal[] = [];

  for (const detect of detectors) {
    const signal = detect(response);
    if (signal) {
      signals.push(signal);
    }
  }

  // De-dup by type — keep highest confidence for each type
  const byType = new Map<SignalType, DetectedSignal>();
  for (const signal of signals) {
    const existing = byType.get(signal.type);
    if (!existing || signal.confidence > existing.confidence) {
      byType.set(signal.type, signal);
    }
  }

  return [...byType.values()].sort((a, b) => b.confidence - a.confidence);
}

/**
 * Infer the best output rendering mode for ChatInterface based on detected
 * signals.
 */
export function inferOutputMode(signals: DetectedSignal[]): OutputMode {
  const signalMap = new Map<SignalType, DetectedSignal>();
  for (const s of signals) {
    signalMap.set(s.type, s);
  }

  const plan = signalMap.get('plan');
  if (plan && plan.confidence > 0.7) return 'plan';

  const code = signalMap.get('code_block');
  if (code && code.confidence > 0.8) return 'code';

  const error = signalMap.get('error');
  if (error && error.confidence > 0.7) return 'fix';

  const refactor = signalMap.get('refactor');
  if (refactor) return 'code';

  return 'chat';
}
