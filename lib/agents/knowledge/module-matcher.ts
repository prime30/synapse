/**
 * Knowledge module matcher — scores user messages against keyword sets
 * and selects relevant modules within a token budget.
 */

import { loadSkillFiles } from './skill-loader';
import { buildVocabulary, semanticScore } from './module-embeddings';
import { AI_FEATURES } from '@/lib/ai/feature-flags';

export interface KnowledgeModule {
  id: string;
  keywords: string[];
  content: string;
  tokenEstimate: number;
  alwaysLoad?: boolean;
}

import { LIQUID_CORE, LIQUID_CORE_KEYWORDS, LIQUID_CORE_TOKENS } from './liquid-core';
import { LIQUID_FILTERS, LIQUID_FILTERS_KEYWORDS, LIQUID_FILTERS_TOKENS } from './liquid-filters';
import { LIQUID_OBJECTS, LIQUID_OBJECTS_KEYWORDS, LIQUID_OBJECTS_TOKENS } from './liquid-objects';
import { A11Y_PATTERNS, A11Y_PATTERNS_KEYWORDS, A11Y_PATTERNS_TOKENS } from './a11y-patterns';
import { CSS_JS_STANDARDS, CSS_JS_STANDARDS_KEYWORDS, CSS_JS_STANDARDS_TOKENS } from './css-js-standards';
import { PACKING_SLIP_REFERENCE, PACKING_SLIP_REFERENCE_KEYWORDS, PACKING_SLIP_REFERENCE_TOKENS } from './liquid-reference';
import { DIAGNOSTIC_STRATEGY, DIAGNOSTIC_STRATEGY_KEYWORDS, DIAGNOSTIC_STRATEGY_TOKENS } from './diagnostic-strategy';
import { CX_PATTERNS_SUMMARY, CX_PATTERNS_SUMMARY_KEYWORDS, CX_PATTERNS_SUMMARY_TOKENS } from './cx-patterns-summary';
import { PERFORMANCE_PATTERNS, PERFORMANCE_PATTERNS_KEYWORDS, PERFORMANCE_PATTERNS_TOKENS } from './performance-patterns';
import { VARIANT_PATTERNS, VARIANT_PATTERNS_KEYWORDS, VARIANT_PATTERNS_TOKENS } from './variant-patterns';

const MODULES: KnowledgeModule[] = [
  {
    id: 'liquid-core',
    keywords: LIQUID_CORE_KEYWORDS,
    content: LIQUID_CORE,
    tokenEstimate: LIQUID_CORE_TOKENS,
    alwaysLoad: true,
  },
  {
    id: 'liquid-filters',
    keywords: LIQUID_FILTERS_KEYWORDS,
    content: LIQUID_FILTERS,
    tokenEstimate: LIQUID_FILTERS_TOKENS,
  },
  {
    id: 'liquid-objects',
    keywords: LIQUID_OBJECTS_KEYWORDS,
    content: LIQUID_OBJECTS,
    tokenEstimate: LIQUID_OBJECTS_TOKENS,
  },
  {
    id: 'a11y-patterns',
    keywords: A11Y_PATTERNS_KEYWORDS,
    content: A11Y_PATTERNS,
    tokenEstimate: A11Y_PATTERNS_TOKENS,
  },
  {
    id: 'css-js-standards',
    keywords: CSS_JS_STANDARDS_KEYWORDS,
    content: CSS_JS_STANDARDS,
    tokenEstimate: CSS_JS_STANDARDS_TOKENS,
  },
  {
    id: 'diagnostic-strategy',
    keywords: DIAGNOSTIC_STRATEGY_KEYWORDS,
    content: DIAGNOSTIC_STRATEGY,
    tokenEstimate: DIAGNOSTIC_STRATEGY_TOKENS,
  },
  {
    id: 'cx-patterns-summary',
    keywords: CX_PATTERNS_SUMMARY_KEYWORDS,
    content: CX_PATTERNS_SUMMARY,
    tokenEstimate: CX_PATTERNS_SUMMARY_TOKENS,
  },
  {
    id: 'performance-patterns',
    keywords: PERFORMANCE_PATTERNS_KEYWORDS,
    content: PERFORMANCE_PATTERNS,
    tokenEstimate: PERFORMANCE_PATTERNS_TOKENS,
  },
  {
    id: 'variant-patterns',
    keywords: VARIANT_PATTERNS_KEYWORDS,
    content: VARIANT_PATTERNS,
    tokenEstimate: VARIANT_PATTERNS_TOKENS,
  },
  {
    id: 'packing-slip-reference',
    keywords: PACKING_SLIP_REFERENCE_KEYWORDS,
    content: PACKING_SLIP_REFERENCE,
    tokenEstimate: PACKING_SLIP_REFERENCE_TOKENS,
  },
];

/**
 * Score user message against module keywords and return matching modules
 * that fit within the token budget. Always-load modules are included first.
 * When projectDir is provided, custom SKILL.md files from projectDir/skills/
 * are also included. When marketplaceModules is provided, installed marketplace
 * skills are included. Disabled skill IDs are excluded from matching.
 */
export function matchKnowledgeModules(
  userMessage: string,
  maxTokenBudget: number = 2500,
  projectDir?: string,
  disabledSkillIds?: Set<string>,
  marketplaceModules?: KnowledgeModule[]
): KnowledgeModule[] {
  const allModules = [...MODULES];
  if (projectDir) {
    allModules.push(...loadSkillFiles(projectDir));
  }
  if (marketplaceModules?.length) {
    allModules.push(...marketplaceModules);
  }

  const filtered = disabledSkillIds
    ? allModules.filter((m) => !disabledSkillIds.has(m.id))
    : allModules;

  const lower = userMessage.toLowerCase();
  const vocabulary = buildVocabulary(filtered);

  const scored = filtered
    .map((m) => {
      const keywordScore = m.alwaysLoad ? 100 : m.keywords.filter((kw) => lower.includes(kw)).length;

      let score: number;

      if (AI_FEATURES.semanticSkillMatching) {
        const semScore = semanticScore(userMessage, m, vocabulary);
        score =
          keywordScore > 0
            ? keywordScore + semScore * 2 // Boost if keywords also match
            : semScore * 3; // Semantic-only match (catches "make it look better" → cx-patterns)
      } else {
        score = keywordScore;
      }

      return { module: m, score };
    })
    .filter((s) => s.score > 0.1)
    .sort((a, b) => b.score - a.score);

  const selected: KnowledgeModule[] = [];
  let budget = maxTokenBudget;

  for (const { module } of scored) {
    if (module.tokenEstimate <= budget) {
      selected.push(module);
      budget -= module.tokenEstimate;
    }
  }

  return selected;
}

/**
 * Get all available knowledge modules (built-in + custom from projectDir + marketplace).
 * Used by the skills API to list modules for the UI.
 */
export function getAllKnowledgeModules(
  projectDir?: string,
  marketplaceModules?: KnowledgeModule[]
): KnowledgeModule[] {
  const all = [...MODULES];
  if (projectDir) {
    all.push(...loadSkillFiles(projectDir));
  }
  if (marketplaceModules?.length) {
    all.push(...marketplaceModules);
  }
  return all;
}

/**
 * Build the injected knowledge block string from matched modules.
 */
export function buildKnowledgeBlock(modules: KnowledgeModule[]): string {
  if (modules.length === 0) return '';
  return (
    '\n\n## Loaded Knowledge Modules\n\n' +
    modules.map((m) => m.content).join('\n\n')
  );
}
