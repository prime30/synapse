/**
 * Next Steps Generator – produces ranked chips after each AI response.
 * Used by EPIC U7 for contextual follow-up suggestions.
 */

import type { ThemeGapResult } from './theme-gap-detector';

export interface NextStepChip {
  id: string;
  label: string;
  category: 'completion' | 'neighbor' | 'cx_insight';
  prompt: string;
  impact?: 'high' | 'medium' | 'low';
  description?: string;
  affectedFiles?: string[];
}

export interface NextStepContext {
  lastResponseContent: string;
  touchedFiles: string[];
  themeGaps: ThemeGapResult;
  dismissedPatterns: string[];
  recentChipHistory: string[];
  mode: string;
  /** patternId -> click count (for chip learning / ranking boost) */
  clickCounts?: Record<string, number>;
}

const IMPACT_WEIGHT: Record<'high' | 'medium' | 'low', number> = {
  high: 0.8,
  medium: 0.5,
  low: 0.3,
};

const CATEGORY_WEIGHT = 0.5;
const PROXIMITY_WEIGHT = 1.0;
const ABSENCE_WEIGHT = 0.9;
const RECENCY_PENALTY = 0.6;
const CLICK_WEIGHT = 0.1;
const MAX_CLICK_BOOST = 2.0;
const MAX_CHIPS = 5;
const MIN_PER_CATEGORY = 1;

/**
 * Generates ranked next-step chips in three categories:
 * 1. Completion – based on what was just done
 * 2. Neighbor – related files/sections to what was touched
 * 3. CX insight – missing patterns related to touched files
 */
export function generateNextStepChips(context: NextStepContext): NextStepChip[] {
  const chips: Array<NextStepChip & { score: number; category: NextStepChip['category'] }> = [];

  // 1. Completion chips (infer from lastResponseContent and touchedFiles)
  const completionChips = buildCompletionChips(context);
  chips.push(...completionChips);

  // 2. Neighbor chips (related sections/files)
  const neighborChips = buildNeighborChips(context);
  chips.push(...neighborChips);

  // 3. CX insight chips (missing patterns related to touched files)
  const cxChips = buildCxChips(context);
  chips.push(...cxChips);

  // Score and rank
  const scored = chips.map((c) => ({
    ...c,
    score: computeScore(c, context),
  }));

  // Apply recency dampening and click-count boost
  const dampened = scored.map((c) => {
    let s = c.score * (context.recentChipHistory.includes(c.id) ? RECENCY_PENALTY : 1);
    const clickCount = context.clickCounts?.[c.id] ?? 0;
    const clickBoost = Math.min(1.0 + clickCount * CLICK_WEIGHT, MAX_CLICK_BOOST);
    s *= clickBoost;
    return { ...c, score: s };
  });

  // Sort by score descending
  dampened.sort((a, b) => b.score - a.score);

  // Ensure at least 1 from each category when applicable
  const result = selectWithCategoryBalance(dampened);

  return result.map(({ score: _s, ...chip }) => chip);
}

function buildCompletionChips(context: NextStepContext): Array<NextStepChip & { score: number; category: 'completion' }> {
  const chips: Array<NextStepChip & { score: number; category: 'completion' }> = [];
  const { touchedFiles, lastResponseContent } = context;

  if (touchedFiles.length === 0) return chips;

  const lower = lastResponseContent.toLowerCase();

  if (lower.includes('section') || touchedFiles.some((f) => f.includes('sections/'))) {
    chips.push({
      id: 'completion-schema',
      label: 'Add schema settings',
      category: 'completion',
      prompt: 'Add a schema block with useful settings to this section',
      score: 0.8,
      affectedFiles: touchedFiles.filter((f) => f.includes('sections/')),
    });
  }
  if (lower.includes('product') || touchedFiles.some((f) => f.includes('product'))) {
    chips.push({
      id: 'completion-responsive',
      label: 'Make responsive',
      category: 'completion',
      prompt: 'Make this section fully responsive for mobile and tablet',
      score: 0.7,
      affectedFiles: touchedFiles,
    });
  }
  if (lower.includes('cart') || touchedFiles.some((f) => f.includes('cart'))) {
    chips.push({
      id: 'completion-cart-drawer',
      label: 'Add cart drawer',
      category: 'completion',
      prompt: 'Add a cart drawer that slides out from the side',
      score: 0.8,
      affectedFiles: touchedFiles,
    });
  }
  if (lower.includes('header') || touchedFiles.some((f) => f.includes('header'))) {
    chips.push({
      id: 'completion-sticky-header',
      label: 'Make header sticky',
      category: 'completion',
      prompt: 'Make the header sticky on scroll',
      score: 0.7,
      affectedFiles: touchedFiles,
    });
  }

  return chips.slice(0, 3); // Limit completion chips
}

function buildNeighborChips(context: NextStepContext): Array<NextStepChip & { score: number; category: 'neighbor' }> {
  const chips: Array<NextStepChip & { score: number; category: 'neighbor' }> = [];
  const { touchedFiles } = context;

  const sectionNeighbors: Record<string, { label: string; prompt: string }> = {
    'main-product': { label: 'Improve product page', prompt: 'Improve the product page layout and UX' },
    'main-collection': { label: 'Improve collection page', prompt: 'Improve the collection page with filters and sorting' },
    'main-cart': { label: 'Improve cart experience', prompt: 'Improve the cart with upsells and free shipping bar' },
    header: { label: 'Improve header', prompt: 'Improve the header with search and navigation' },
    footer: { label: 'Improve footer', prompt: 'Improve the footer with links and trust elements' },
  };

  for (const path of touchedFiles) {
    for (const [section, { label, prompt }] of Object.entries(sectionNeighbors)) {
      if (path.includes(section)) {
        chips.push({
          id: `neighbor-${section}`,
          label,
          category: 'neighbor',
          prompt,
          score: PROXIMITY_WEIGHT,
          affectedFiles: [path],
        });
        break;
      }
    }
  }

  return [...new Map(chips.map((c) => [c.id, c])).values()].slice(0, 3);
}

function buildCxChips(context: NextStepContext): Array<NextStepChip & { score: number; category: 'cx_insight' }> {
  const chips: Array<NextStepChip & { score: number; category: 'cx_insight' }> = [];
  const { themeGaps, touchedFiles, dismissedPatterns } = context;

  const missing = themeGaps.missing.filter((p) => !dismissedPatterns.includes(p.id));
  const partial = themeGaps.partial.filter((p) => !dismissedPatterns.includes(p.id));

  const candidates = [...missing, ...partial];

  for (const pattern of candidates) {
    const touchesRelated = touchedFiles.some((f) =>
      pattern.relatedFiles.some((rf) => f.includes(rf.replace(/\*/g, '')) || f.includes(rf.split('/').pop() ?? ''))
    );
    const proximity = touchesRelated ? PROXIMITY_WEIGHT : 0.3;
    const absence = ABSENCE_WEIGHT;
    const impact = IMPACT_WEIGHT[pattern.impact];

    chips.push({
      id: `cx-${pattern.id}`,
      label: pattern.name,
      category: 'cx_insight',
      prompt: pattern.promptTemplate,
      impact: pattern.impact,
      description: pattern.description,
      score: proximity + absence * 0.5 + impact * 0.5,
      affectedFiles: pattern.relatedFiles,
    });
  }

  return chips.slice(0, 10); // Limit before selection
}

function computeScore(
  chip: NextStepChip & { score: number; category: NextStepChip['category'] },
  context: NextStepContext
): number {
  let score = chip.score;
  if (chip.impact) score += IMPACT_WEIGHT[chip.impact] * 0.3;
  return score;
}

function selectWithCategoryBalance(
  chips: Array<NextStepChip & { score: number }>
): Array<NextStepChip & { score: number }> {
  const byCategory = {
    completion: chips.filter((c) => c.category === 'completion'),
    neighbor: chips.filter((c) => c.category === 'neighbor'),
    cx_insight: chips.filter((c) => c.category === 'cx_insight'),
  };

  const result: Array<NextStepChip & { score: number }> = [];
  const used = new Set<string>();

  // Ensure at least 1 from each category when available
  for (const cat of ['completion', 'neighbor', 'cx_insight'] as const) {
    const list = byCategory[cat];
    const top = list.find((c) => !used.has(c.id));
    if (top) {
      result.push(top);
      used.add(top.id);
    }
  }

  // Fill remaining slots by score
  const rest = chips.filter((c) => !used.has(c.id)).sort((a, b) => b.score - a.score);
  for (const c of rest) {
    if (result.length >= MAX_CHIPS) break;
    result.push(c);
    used.add(c.id);
  }

  return result.slice(0, MAX_CHIPS).sort((a, b) => b.score - a.score);
}
