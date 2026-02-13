/**
 * Preference Learner — learns from user accept/reject/edit patterns
 * on AI suggestions to build a preference model.
 *
 * EPIC 14: Tracks which AI suggestions users accept, reject, or edit
 * and builds a model of their preferred coding style.
 */

import type { Preference, CreateMemoryInput, MemoryEntry } from './developer-memory';

// ── Types ─────────────────────────────────────────────────────────────

export type UserAction = 'accept' | 'reject' | 'edit';

/**
 * A single observed user interaction with an AI suggestion.
 */
export interface SuggestionInteraction {
  /** What the AI suggested */
  suggestion: string;
  /** What the user did with it */
  action: UserAction;
  /** If edited, what the user changed it to */
  editedResult?: string;
  /** Category of the suggestion */
  category: Preference['category'];
  /** When this interaction happened */
  timestamp: string;
  /** Optional context about what was being worked on */
  context?: string;
}

/**
 * Aggregated pattern from multiple interactions.
 */
export interface LearnedPattern {
  preference: Preference;
  /** Confidence score (0-1) based on observation frequency and consistency */
  confidence: number;
  /** Source interactions that contributed to this pattern */
  interactionCount: number;
}

// ── Pattern extraction ────────────────────────────────────────────────

/**
 * Group interactions by category and compute preference patterns.
 */
function groupByCategory(
  interactions: SuggestionInteraction[]
): Map<Preference['category'], SuggestionInteraction[]> {
  const groups = new Map<Preference['category'], SuggestionInteraction[]>();

  for (const interaction of interactions) {
    const existing = groups.get(interaction.category) ?? [];
    existing.push(interaction);
    groups.set(interaction.category, existing);
  }

  return groups;
}

/**
 * Analyze a group of interactions to extract acceptance/rejection patterns.
 */
function analyzeGroup(
  category: Preference['category'],
  interactions: SuggestionInteraction[]
): LearnedPattern[] {
  const results: LearnedPattern[] = [];

  // Count accept/reject/edit ratios
  const accepted = interactions.filter((i) => i.action === 'accept');
  const rejected = interactions.filter((i) => i.action === 'reject');
  const edited = interactions.filter((i) => i.action === 'edit');

  // Find common patterns in accepted suggestions
  const acceptedPatterns = findCommonPatterns(accepted.map((i) => i.suggestion));
  for (const pattern of acceptedPatterns) {
    if (pattern.frequency >= 2) {
      results.push({
        preference: {
          category,
          preference: `Prefers: ${pattern.description}`,
          observationCount: pattern.frequency,
        },
        confidence: computeConfidence(pattern.frequency, interactions.length),
        interactionCount: pattern.frequency,
      });
    }
  }

  // Find common patterns in rejected suggestions (anti-patterns)
  const rejectedPatterns = findCommonPatterns(rejected.map((i) => i.suggestion));
  for (const pattern of rejectedPatterns) {
    if (pattern.frequency >= 2) {
      results.push({
        preference: {
          category,
          preference: `Avoids suggestions with: ${pattern.description}`,
          antiPattern: pattern.description,
          observationCount: pattern.frequency,
        },
        confidence: computeConfidence(pattern.frequency, interactions.length),
        interactionCount: pattern.frequency,
      });
    }
  }

  // Analyze edit patterns (what users consistently change)
  if (edited.length >= 2) {
    const editPatterns = analyzeEdits(edited);
    results.push(...editPatterns.map((ep) => ({
      ...ep,
      preference: { ...ep.preference, category },
    })));
  }

  return results;
}

/**
 * Find common textual patterns across a list of suggestion strings.
 */
function findCommonPatterns(
  texts: string[]
): Array<{ description: string; frequency: number }> {
  if (texts.length < 2) return [];

  const patterns: Array<{ description: string; frequency: number }> = [];

  // Look for common structural indicators
  const indicators: Array<{ test: RegExp; label: string }> = [
    { test: /\bconst\b/, label: 'const declarations' },
    { test: /\blet\b/, label: 'let declarations' },
    { test: /\bvar\b/, label: 'var declarations' },
    { test: /=>\s*\{/, label: 'arrow functions with block body' },
    { test: /=>\s*[^{]/, label: 'arrow functions with implicit return' },
    { test: /\bfunction\b/, label: 'function keyword declarations' },
    { test: /['"]use strict['"]/, label: 'strict mode' },
    { test: /\basync\b/, label: 'async patterns' },
    { test: /\btry\s*\{/, label: 'try-catch blocks' },
    { test: /\/\*\*/, label: 'JSDoc comments' },
    { test: /\/\/\s/, label: 'inline comments' },
    { test: /\bclass\s+\w/, label: 'class-based patterns' },
    { test: /\{%[-\s]*render\b/, label: '{% render %} tags' },
    { test: /\{%[-\s]*include\b/, label: '{% include %} tags' },
    { test: /var\(--/, label: 'CSS custom properties' },
    { test: /!important/, label: '!important usage' },
    { test: /@media/, label: 'media queries' },
    { test: /data-[\w-]+=/, label: 'data attributes' },
  ];

  for (const { test, label } of indicators) {
    const matchCount = texts.filter((t) => test.test(t)).length;
    if (matchCount >= 2 && matchCount / texts.length > 0.5) {
      patterns.push({ description: label, frequency: matchCount });
    }
  }

  return patterns;
}

/**
 * Analyze edit patterns — what users consistently change about AI suggestions.
 */
function analyzeEdits(
  edited: SuggestionInteraction[]
): LearnedPattern[] {
  const results: LearnedPattern[] = [];

  // Detect common edit transformations
  const editsWithResults = edited.filter((e) => e.editedResult);

  if (editsWithResults.length < 2) return results;

  // Check if users consistently shorten outputs
  const shortenCount = editsWithResults.filter(
    (e) => (e.editedResult?.length ?? 0) < e.suggestion.length * 0.7
  ).length;

  if (shortenCount >= 2 && shortenCount / editsWithResults.length > 0.5) {
    results.push({
      preference: {
        category: 'style',
        preference: 'Prefers shorter, more concise AI outputs',
        observationCount: shortenCount,
      },
      confidence: computeConfidence(shortenCount, editsWithResults.length),
      interactionCount: shortenCount,
    });
  }

  // Check if users consistently lengthen outputs
  const lengthenCount = editsWithResults.filter(
    (e) => (e.editedResult?.length ?? 0) > e.suggestion.length * 1.3
  ).length;

  if (lengthenCount >= 2 && lengthenCount / editsWithResults.length > 0.5) {
    results.push({
      preference: {
        category: 'style',
        preference: 'Prefers more detailed, verbose AI outputs',
        observationCount: lengthenCount,
      },
      confidence: computeConfidence(lengthenCount, editsWithResults.length),
      interactionCount: lengthenCount,
    });
  }

  // Check if users consistently add comments
  const addCommentCount = editsWithResults.filter((e) => {
    const origComments = (e.suggestion.match(/\/\/|\/\*|\{%[-\s]*comment/g) ?? []).length;
    const editComments = (e.editedResult?.match(/\/\/|\/\*|\{%[-\s]*comment/g) ?? []).length;
    return editComments > origComments;
  }).length;

  if (addCommentCount >= 2) {
    results.push({
      preference: {
        category: 'style',
        preference: 'Prefers more comments in generated code',
        observationCount: addCommentCount,
      },
      confidence: computeConfidence(addCommentCount, editsWithResults.length),
      interactionCount: addCommentCount,
    });
  }

  return results;
}

/**
 * Compute a confidence score based on observation frequency.
 */
function computeConfidence(
  observedCount: number,
  totalInteractions: number
): number {
  if (totalInteractions === 0) return 0;

  // Base confidence from ratio
  const ratio = observedCount / totalInteractions;

  // Boost from absolute count (more observations = more confident)
  const countBoost = Math.min(observedCount / 10, 0.3);

  return Math.min(ratio * 0.7 + countBoost, 0.95);
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Learn user preferences from a list of suggestion interactions.
 * Analyzes patterns across accepted, rejected, and edited suggestions.
 */
export function learnPreferences(
  interactions: SuggestionInteraction[]
): LearnedPattern[] {
  if (interactions.length < 2) return [];

  const groups = groupByCategory(interactions);
  const results: LearnedPattern[] = [];

  for (const [category, groupInteractions] of groups) {
    results.push(...analyzeGroup(category, groupInteractions));
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}

/**
 * Incrementally update existing preference memories with new interactions.
 * Merges with existing preferences to increase or decrease confidence.
 */
export function updatePreferencesIncremental(
  existing: MemoryEntry[],
  newInteractions: SuggestionInteraction[]
): { updated: MemoryEntry[]; created: LearnedPattern[] } {
  const newPatterns = learnPreferences(newInteractions);
  const updated: MemoryEntry[] = [];
  const created: LearnedPattern[] = [];

  for (const pattern of newPatterns) {
    // Check if this preference already exists
    const match = existing.find((e) => {
      if (e.type !== 'preference') return false;
      const p = e.content as Preference;
      return (
        p.category === pattern.preference.category &&
        p.preference === pattern.preference.preference
      );
    });

    if (match) {
      // Update existing: bump observation count and recalculate confidence
      const existingPref = match.content as Preference;
      const updatedEntry = {
        ...match,
        content: {
          ...existingPref,
          observationCount:
            existingPref.observationCount + pattern.preference.observationCount,
        } satisfies Preference,
        confidence: Math.min(
          match.confidence * 0.7 + pattern.confidence * 0.3,
          0.95
        ),
      };
      updated.push(updatedEntry);
    } else {
      created.push(pattern);
    }
  }

  return { updated, created };
}

/**
 * Convert learned patterns into memory entries ready for persistence.
 */
export function preferencesToMemoryInputs(
  patterns: LearnedPattern[],
  projectId: string,
  userId: string
): CreateMemoryInput[] {
  return patterns.map((lp) => ({
    projectId,
    userId,
    type: 'preference' as const,
    content: lp.preference,
    confidence: lp.confidence,
  }));
}
