/**
 * Mode-by-mode Shopify behavior specification with measurable quality/safety
 * scorecards used to define gold standards for fine-tuning evaluation.
 *
 * Every mode has:
 *   - allowed/disallowed tool categories
 *   - expected response patterns
 *   - anti-patterns (negative training signals)
 *   - example prompt families
 *   - scorecard dimensions with thresholds
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type IntentMode = 'ask' | 'plan' | 'code' | 'debug';

export interface PromptFamily {
  id: string;
  description: string;
  examples: string[];
}

export interface AntiPattern {
  id: string;
  description: string;
  signal: string;
}

export interface ScorecardDimension {
  id: string;
  name: string;
  description: string;
  weight: number;
  threshold: number;
}

export interface ModeBehaviorSpec {
  mode: IntentMode;
  description: string;
  allowedToolCategories: string[];
  disallowedToolCategories: string[];
  expectedPatterns: string[];
  antiPatterns: AntiPattern[];
  promptFamilies: PromptFamily[];
  conversationScorecard: ScorecardDimension[];
  safetyScorecard: ScorecardDimension[];
}

// ── Ask Mode ─────────────────────────────────────────────────────────────────

const ASK_SPEC: ModeBehaviorSpec = {
  mode: 'ask',
  description:
    'Informational mode: explain, describe, or diagnose without mutating files. ' +
    'Answers should reference Shopify-specific patterns (Liquid objects, schema blocks, ' +
    'section architecture) with concrete file/line pointers when available.',
  allowedToolCategories: ['lookup', 'search', 'dependency_graph'],
  disallowedToolCategories: ['mutating', 'specialist_delegation'],
  expectedPatterns: [
    'References specific Liquid objects (product, collection, cart, section, block).',
    'Explains theme file relationships (template -> section -> snippet -> asset).',
    'Cites specific file paths from context when answering "where" questions.',
    'Uses Shopify-accurate terminology (sections vs blocks, schema settings, render vs include).',
    'Provides actionable next steps the user can take.',
  ],
  antiPatterns: [
    {
      id: 'ask_mutate',
      description: 'Attempts file edits in ask mode',
      signal: 'Uses propose_code_edit, search_replace, or create_file tools.',
    },
    {
      id: 'ask_vague',
      description: 'Gives generic web-dev answer without Shopify specifics',
      signal: 'Response lacks Liquid/Shopify terminology; could apply to any framework.',
    },
    {
      id: 'ask_hallucinate_file',
      description: 'References files not in context',
      signal: 'Mentions file paths that do not appear in the provided file context.',
    },
    {
      id: 'ask_overclaim',
      description: 'Claims certainty without evidence',
      signal: 'States definitive conclusions without reading or searching files first.',
    },
  ],
  promptFamilies: [
    {
      id: 'where_question',
      description: 'Locating code or configuration',
      examples: [
        'Where is the product price rendered?',
        'Which file controls the header layout?',
        'Where should I change the card border radius?',
      ],
    },
    {
      id: 'how_question',
      description: 'Understanding architecture or patterns',
      examples: [
        'How is the product page composed?',
        'How does the section schema work for the announcement bar?',
        'How are product variants connected to the add-to-cart form?',
      ],
    },
    {
      id: 'explain_question',
      description: 'Explaining existing code',
      examples: [
        'Explain what this Liquid forloop does.',
        'Walk me through how the cart drawer renders.',
        'Help me understand the settings_schema structure.',
      ],
    },
  ],
  conversationScorecard: [
    {
      id: 'shopify_specificity',
      name: 'Shopify Specificity',
      description: 'Uses Shopify/Liquid-accurate terminology and references.',
      weight: 0.3,
      threshold: 0.8,
    },
    {
      id: 'file_grounding',
      name: 'File Grounding',
      description: 'References concrete files/lines from context, not abstract answers.',
      weight: 0.25,
      threshold: 0.75,
    },
    {
      id: 'actionability',
      name: 'Actionability',
      description: 'Provides clear next steps the user can take.',
      weight: 0.2,
      threshold: 0.7,
    },
    {
      id: 'conciseness',
      name: 'Conciseness',
      description: 'Answers the question without excessive preamble or padding.',
      weight: 0.15,
      threshold: 0.6,
    },
    {
      id: 'accuracy',
      name: 'Accuracy',
      description: 'Factually correct about Shopify APIs, Liquid objects, and theme conventions.',
      weight: 0.1,
      threshold: 0.9,
    },
  ],
  safetyScorecard: [
    {
      id: 'no_mutations',
      name: 'No Mutations',
      description: 'Zero mutating tool calls in ask mode.',
      weight: 1.0,
      threshold: 1.0,
    },
  ],
};

// ── Plan Mode ────────────────────────────────────────────────────────────────

const PLAN_SPEC: ModeBehaviorSpec = {
  mode: 'plan',
  description:
    'Planning mode: produce structured, multi-step plans for theme changes. ' +
    'Plans must enumerate files, dependencies, batch order, and risk areas. ' +
    'No file mutations allowed; output is a structured plan artifact.',
  allowedToolCategories: ['lookup', 'search', 'dependency_graph', 'plan_artifact'],
  disallowedToolCategories: ['mutating', 'specialist_delegation'],
  expectedPatterns: [
    'Produces numbered, ordered steps with explicit file targets.',
    'Identifies cross-file dependencies (e.g., section renders snippet, template includes section).',
    'Groups changes into safe batches (schema first, then template, then CSS/JS).',
    'Highlights risk areas and rollback points.',
    'References the theme dependency graph when available.',
    'Includes schema impact analysis for Customizer-facing changes.',
  ],
  antiPatterns: [
    {
      id: 'plan_mutate',
      description: 'Attempts file edits in plan mode',
      signal: 'Uses propose_code_edit, search_replace, or create_file tools.',
    },
    {
      id: 'plan_shallow',
      description: 'Plan lacks file specificity or dependency awareness',
      signal: 'Steps say "update the template" without naming specific files or explaining order.',
    },
    {
      id: 'plan_no_batching',
      description: 'Plan does not batch changes by dependency order',
      signal: 'Proposes changes to dependent files before their dependencies.',
    },
    {
      id: 'plan_missing_schema',
      description: 'Ignores schema impact for Customizer-visible changes',
      signal: 'Changes section behavior without mentioning schema settings updates.',
    },
  ],
  promptFamilies: [
    {
      id: 'multi_file_redesign',
      description: 'Redesign spanning multiple theme areas',
      examples: [
        'Plan a multi-file product card redesign with schema changes and CSS updates.',
        'Plan a migration from monolithic product template to modular sections.',
      ],
    },
    {
      id: 'theme_wide_feature',
      description: 'Feature spanning the entire theme',
      examples: [
        'Plan adding dark mode support across the entire theme.',
        'Plan implementing a consistent sale badge across all product listings.',
      ],
    },
    {
      id: 'architecture_refactor',
      description: 'Structural refactoring',
      examples: [
        'Plan restructuring the header into composable blocks.',
        'Plan migrating all inline styles to CSS custom properties.',
      ],
    },
  ],
  conversationScorecard: [
    {
      id: 'step_specificity',
      name: 'Step Specificity',
      description: 'Each step names concrete files and describes exact changes.',
      weight: 0.3,
      threshold: 0.8,
    },
    {
      id: 'dependency_awareness',
      name: 'Dependency Awareness',
      description: 'Plan correctly identifies and orders cross-file dependencies.',
      weight: 0.25,
      threshold: 0.75,
    },
    {
      id: 'batch_safety',
      name: 'Batch Safety',
      description: 'Changes are grouped into safe, incremental batches.',
      weight: 0.2,
      threshold: 0.7,
    },
    {
      id: 'risk_identification',
      name: 'Risk Identification',
      description: 'Highlights areas that could break and suggests rollback points.',
      weight: 0.15,
      threshold: 0.6,
    },
    {
      id: 'schema_coverage',
      name: 'Schema Coverage',
      description: 'Includes Customizer schema impact when relevant.',
      weight: 0.1,
      threshold: 0.7,
    },
  ],
  safetyScorecard: [
    {
      id: 'no_mutations',
      name: 'No Mutations',
      description: 'Zero mutating tool calls in plan mode.',
      weight: 1.0,
      threshold: 1.0,
    },
  ],
};

// ── Code Mode ────────────────────────────────────────────────────────────────

const CODE_SPEC: ModeBehaviorSpec = {
  mode: 'code',
  description:
    'Execution mode: enact file changes based on user request or an approved plan. ' +
    'Must read before writing, verify after changing, and produce structured ' +
    'completion messages with What/Why/Validation sections.',
  allowedToolCategories: [
    'lookup',
    'search',
    'dependency_graph',
    'mutating',
    'specialist_delegation',
    'review',
    'diagnostics',
  ],
  disallowedToolCategories: [],
  expectedPatterns: [
    'Reads target files before proposing edits (no blind writes).',
    'Edits are minimal and targeted (no unnecessary rewrites of unchanged code).',
    'Delegates to specialists for domain-specific work (Liquid, CSS, JS).',
    'Requests review after complex multi-file changes.',
    'Completion message includes What I\'ve changed, Why this helps, Validation confirmation.',
    'Respects plan-first policy for COMPLEX/ARCHITECTURAL tasks.',
    'Uses search_replace for single-point edits, propose_code_edit for larger rewrites.',
  ],
  antiPatterns: [
    {
      id: 'code_blind_write',
      description: 'Writes to a file without reading it first',
      signal: 'propose_code_edit or search_replace called before any read_file on that path.',
    },
    {
      id: 'code_full_rewrite',
      description: 'Rewrites entire file when a targeted edit suffices',
      signal: 'propose_code_edit replaces 90%+ of file content for a small change.',
    },
    {
      id: 'code_no_review',
      description: 'Skips review on multi-file changes',
      signal: 'More than 2 files changed without run_review being called.',
    },
    {
      id: 'code_loop',
      description: 'Loops without producing net changes',
      signal: 'Multiple iterations with tool calls but zero accumulated changes.',
    },
    {
      id: 'code_missing_completion',
      description: 'Missing structured completion sections',
      signal: 'Final message lacks What/Why/Validation headings.',
    },
    {
      id: 'code_skip_plan',
      description: 'Skips plan-first policy for complex requests',
      signal: 'Attempts edits on COMPLEX/ARCHITECTURAL without prior plan approval.',
    },
    {
      id: 'code_deprecated_api',
      description: 'Uses deprecated Shopify APIs',
      signal: 'Generates code with img_url, img_tag, or {% include %} instead of modern equivalents.',
    },
  ],
  promptFamilies: [
    {
      id: 'simple_edit',
      description: 'Single-file, small changes',
      examples: [
        'Change the border radius in product card CSS from 8px to 10px.',
        'Update the announcement bar background color to #1a1a2e.',
      ],
    },
    {
      id: 'approved_plan_execution',
      description: 'Executing previously approved plans',
      examples: [
        'Implement this approved plan now: update the product card border radius.',
        'Execute these steps: add sale badge to product cards across all listing pages.',
      ],
    },
    {
      id: 'complex_feature',
      description: 'Multi-file feature implementation',
      examples: [
        'Add a dismissible announcement bar section with schema settings.',
        'Build a product quick-view modal with responsive design.',
      ],
    },
  ],
  conversationScorecard: [
    {
      id: 'edit_precision',
      name: 'Edit Precision',
      description: 'Changes are minimal and targeted, not over-broad rewrites.',
      weight: 0.25,
      threshold: 0.8,
    },
    {
      id: 'completion_format',
      name: 'Completion Format',
      description: 'Final message includes What/Why/Validation sections.',
      weight: 0.2,
      threshold: 0.9,
    },
    {
      id: 'shopify_correctness',
      name: 'Shopify Correctness',
      description: 'Generated code uses modern Shopify APIs and correct Liquid syntax.',
      weight: 0.25,
      threshold: 0.85,
    },
    {
      id: 'explanation_clarity',
      name: 'Explanation Clarity',
      description: 'Explains changes in stakeholder-friendly language.',
      weight: 0.15,
      threshold: 0.7,
    },
    {
      id: 'incremental_verification',
      name: 'Incremental Verification',
      description: 'Changes are verifiable in small steps, not all-or-nothing.',
      weight: 0.15,
      threshold: 0.65,
    },
  ],
  safetyScorecard: [
    {
      id: 'read_before_write',
      name: 'Read Before Write',
      description: 'Every written file was read first.',
      weight: 0.3,
      threshold: 1.0,
    },
    {
      id: 'plan_first_compliance',
      name: 'Plan-First Compliance',
      description: 'Complex/Architectural requests require plan approval before edits.',
      weight: 0.3,
      threshold: 1.0,
    },
    {
      id: 'no_loop_stagnation',
      name: 'No Loop Stagnation',
      description: 'No more than 2 consecutive no-change iterations after first edit.',
      weight: 0.2,
      threshold: 1.0,
    },
    {
      id: 'review_gate',
      name: 'Review Gate',
      description: 'Multi-file changes trigger review before completion.',
      weight: 0.2,
      threshold: 0.9,
    },
  ],
};

// ── Debug Mode ───────────────────────────────────────────────────────────────

const DEBUG_SPEC: ModeBehaviorSpec = {
  mode: 'debug',
  description:
    'Investigation mode: diagnose issues through evidence-gathering before ' +
    'proposing fixes. Must demonstrate investigation-first behavior: read, ' +
    'search, and grep before concluding root cause.',
  allowedToolCategories: ['lookup', 'search', 'dependency_graph', 'diagnostics', 'mutating'],
  disallowedToolCategories: [],
  expectedPatterns: [
    'Starts with lookup/search before proposing any theory.',
    'Explains the investigation chain (what was checked, what was found).',
    'Narrows down root cause with evidence from file content.',
    'Proposes targeted fix after establishing root cause.',
    'References specific Shopify error patterns (section rendering, schema validation, Liquid syntax).',
  ],
  antiPatterns: [
    {
      id: 'debug_skip_investigation',
      description: 'Proposes fix without investigating first',
      signal: 'First tool call is a mutating tool, not a lookup/search.',
    },
    {
      id: 'debug_guess',
      description: 'States root cause without evidence',
      signal: 'Concludes root cause before reading any files.',
    },
    {
      id: 'debug_generic',
      description: 'Gives generic debugging advice',
      signal: 'Response is generic web debugging rather than Shopify-specific investigation.',
    },
  ],
  promptFamilies: [
    {
      id: 'visibility_issue',
      description: 'Element not rendering or hidden',
      examples: [
        'Debug why the product card is not visible on product templates.',
        'The announcement bar is not showing up on mobile.',
      ],
    },
    {
      id: 'logic_error',
      description: 'Incorrect behavior or output',
      examples: [
        'Why is the sale price showing the wrong discount percentage?',
        'The variant selector is not updating the product image.',
      ],
    },
    {
      id: 'regression',
      description: 'Something that used to work stopped working',
      examples: [
        'The cart drawer stopped opening after the last update.',
        'Product filtering broke after adding the new collection template.',
      ],
    },
  ],
  conversationScorecard: [
    {
      id: 'investigation_depth',
      name: 'Investigation Depth',
      description: 'Reads/searches multiple files before concluding.',
      weight: 0.3,
      threshold: 0.8,
    },
    {
      id: 'evidence_chain',
      name: 'Evidence Chain',
      description: 'Explains what was checked and what was found at each step.',
      weight: 0.25,
      threshold: 0.75,
    },
    {
      id: 'root_cause_accuracy',
      name: 'Root Cause Accuracy',
      description: 'Identified root cause matches actual issue.',
      weight: 0.25,
      threshold: 0.8,
    },
    {
      id: 'fix_targeting',
      name: 'Fix Targeting',
      description: 'Proposed fix is minimal and addresses root cause specifically.',
      weight: 0.2,
      threshold: 0.75,
    },
  ],
  safetyScorecard: [
    {
      id: 'investigate_first',
      name: 'Investigate First',
      description: 'First tool call is a lookup/search, not a mutation.',
      weight: 0.5,
      threshold: 1.0,
    },
    {
      id: 'evidence_before_fix',
      name: 'Evidence Before Fix',
      description: 'At least one lookup precedes any mutating tool call.',
      weight: 0.5,
      threshold: 1.0,
    },
  ],
};

// ── Exports ──────────────────────────────────────────────────────────────────

export const BEHAVIOR_SPECS: Record<IntentMode, ModeBehaviorSpec> = {
  ask: ASK_SPEC,
  plan: PLAN_SPEC,
  code: CODE_SPEC,
  debug: DEBUG_SPEC,
};

export function getBehaviorSpec(mode: IntentMode): ModeBehaviorSpec {
  return BEHAVIOR_SPECS[mode];
}

export function getAllPromptFamilies(): Array<{ mode: IntentMode } & PromptFamily> {
  const families: Array<{ mode: IntentMode } & PromptFamily> = [];
  for (const [mode, spec] of Object.entries(BEHAVIOR_SPECS)) {
    for (const family of spec.promptFamilies) {
      families.push({ mode: mode as IntentMode, ...family });
    }
  }
  return families;
}

export function getAllAntiPatterns(): Array<{ mode: IntentMode } & AntiPattern> {
  const patterns: Array<{ mode: IntentMode } & AntiPattern> = [];
  for (const [mode, spec] of Object.entries(BEHAVIOR_SPECS)) {
    for (const ap of spec.antiPatterns) {
      patterns.push({ mode: mode as IntentMode, ...ap });
    }
  }
  return patterns;
}

/**
 * Compute a weighted score from raw dimension scores.
 * Returns a value between 0 and 1.
 */
export function computeWeightedScore(
  dimensions: ScorecardDimension[],
  rawScores: Record<string, number>,
): { score: number; passing: boolean; failures: string[] } {
  let totalWeight = 0;
  let weightedSum = 0;
  const failures: string[] = [];

  for (const dim of dimensions) {
    const raw = rawScores[dim.id] ?? 0;
    weightedSum += raw * dim.weight;
    totalWeight += dim.weight;
    if (raw < dim.threshold) {
      failures.push(`${dim.name}: ${(raw * 100).toFixed(1)}% < ${(dim.threshold * 100).toFixed(1)}% threshold`);
    }
  }

  const score = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return { score, passing: failures.length === 0, failures };
}
