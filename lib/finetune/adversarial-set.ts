/**
 * Adversarial and negative training examples.
 *
 * These capture common failure modes the model should learn to avoid:
 *   - Loop bait: prompts that trigger infinite lookup/edit cycles
 *   - Vague megaprompts: requests that should trigger clarification
 *   - Conflicting constraints: impossible requirements
 *   - No-op edit traps: edits that look like changes but aren't
 *   - Mode confusion: prompts that tempt the model into the wrong mode
 *   - Deprecated API usage: prompts that tempt usage of deprecated Shopify APIs
 */

import type { SFTExample, PreferenceExample, ConversationTurn } from './dataset-schema';
import type { IntentMode } from './behavior-spec';

// ── Adversarial Scenario Definitions ─────────────────────────────────────────

export interface AdversarialScenario {
  id: string;
  category:
    | 'loop_bait'
    | 'vague_megaprompt'
    | 'conflicting_constraints'
    | 'noop_edit_trap'
    | 'mode_confusion'
    | 'deprecated_api'
    | 'hallucination_bait';
  mode: IntentMode;
  prompt: string;
  contextFiles?: Array<{ path: string; content: string }>;
  expectedBehavior: string;
  correctResponse: string;
  incorrectResponse: string;
}

// ── Scenarios ────────────────────────────────────────────────────────────────

export const ADVERSARIAL_SCENARIOS: AdversarialScenario[] = [
  // Loop bait
  {
    id: 'loop_bait_reread',
    category: 'loop_bait',
    mode: 'code',
    prompt: 'Make the product card look better.',
    expectedBehavior:
      'Should ask for clarification about what "better" means (colors, spacing, typography, layout) rather than reading files repeatedly.',
    correctResponse:
      'I can help improve the product card. To make targeted changes, I need to understand what you mean by "better." Here are your options:\n\n1. [RECOMMENDED] Improve spacing and typography for a cleaner look\n2. Update colors and borders to match a modern aesthetic\n3. Add hover animations and micro-interactions\n4. Restructure the card layout (image position, content hierarchy)\n\nWhich direction should I focus on?',
    incorrectResponse:
      'Let me read all the files first... [reads product-card.liquid] [reads theme.css] [reads product-card.liquid again] [reads theme.css again] I need to read more files to understand the full picture...',
  },
  {
    id: 'loop_bait_circular',
    category: 'loop_bait',
    mode: 'code',
    prompt:
      'Fix the product page. Check everything and make sure it all works perfectly.',
    expectedBehavior:
      'Should scope the request and ask which aspect to fix rather than entering an endless read/check loop.',
    correctResponse:
      'I can help fix the product page. "Fix everything" is quite broad - let me help narrow this down:\n\n1. [RECOMMENDED] Run diagnostics and fix any Liquid syntax or schema errors\n2. Fix layout/styling issues (specify which ones you see)\n3. Fix JavaScript functionality (variant selector, add-to-cart, etc.)\n4. Fix accessibility issues (WCAG compliance)\n\nWhich area should I start with?',
    incorrectResponse:
      'Let me check everything... [reads 15 files] [searches for errors] [reads the same files again] [runs diagnostics] [reads files again] Everything looks fine but let me check once more...',
  },

  // Vague megaprompts
  {
    id: 'vague_implement_everything',
    category: 'vague_megaprompt',
    mode: 'code',
    prompt: 'Implement all the features we discussed.',
    expectedBehavior:
      'Should ask which specific features and in what order, since there is no conversation history.',
    correctResponse:
      'I don\'t have context about which features were discussed. Could you list the specific features you\'d like implemented? I\'ll then create a prioritized plan with dependencies.\n\nFor example:\n- Feature name and which pages it affects\n- Any specific design requirements\n- Priority order if you have a preference',
    incorrectResponse:
      'Sure, I\'ll implement everything now. Let me start by redesigning the entire theme...',
  },
  {
    id: 'vague_make_it_modern',
    category: 'vague_megaprompt',
    mode: 'code',
    prompt: 'Make the theme modern.',
    expectedBehavior:
      'Should ask what "modern" means in context: design trends, performance, code patterns, etc.',
    correctResponse:
      '"Modern" can mean several things for a Shopify theme. Which aspects should I focus on?\n\n1. [RECOMMENDED] Visual modernization: clean typography, generous spacing, subtle animations\n2. Code modernization: migrate to Shopify 2.0 section architecture, modern Liquid patterns\n3. Performance: lazy loading, critical CSS, reduced JavaScript\n4. Accessibility: WCAG 2.1 AA compliance, semantic HTML, ARIA attributes\n\nI can create a phased plan once you pick a direction.',
    incorrectResponse:
      'I\'ll modernize everything. Let me rewrite all the templates, CSS, and JavaScript...',
  },

  // Conflicting constraints
  {
    id: 'conflicting_schema_break',
    category: 'conflicting_constraints',
    mode: 'code',
    prompt:
      'Remove all section schemas but keep the Customizer working with all current settings.',
    expectedBehavior:
      'Should explain that removing schemas would break Customizer and offer alternatives.',
    correctResponse:
      'Removing section schemas would break the Customizer entirely - schemas are what define the settings that appear in the Customizer UI. Without them, merchants lose all visual editing capability.\n\nAlternatives:\n1. [RECOMMENDED] Simplify schemas by removing unused settings while keeping essential ones\n2. Consolidate settings into theme-level settings_schema.json instead of per-section\n3. Keep schemas but reorganize them for better Customizer UX\n\nWhich approach works for your goal?',
    incorrectResponse:
      'Sure, I\'ll remove all the schemas now. Here are the changes...',
  },

  // No-op edit traps
  {
    id: 'noop_same_content',
    category: 'noop_edit_trap',
    mode: 'code',
    prompt: 'Update the product card border radius to 8px.',
    contextFiles: [
      {
        path: 'assets/theme.css',
        content: '.product-card { border-radius: 8px; border: 1px solid #ddd; }',
      },
    ],
    expectedBehavior:
      'Should detect the value is already 8px and inform the user rather than making a no-op edit.',
    correctResponse:
      'The product card border radius is already set to `8px` in `assets/theme.css`. No changes needed. Would you like to change it to a different value?',
    incorrectResponse:
      'I\'ll update the border radius to 8px now.\n\n### What I\'ve changed\n- Updated `assets/theme.css` border-radius to 8px.\n\n### Why this helps\n- Ensures consistent border radius.',
  },

  // Mode confusion
  {
    id: 'mode_confusion_ask_as_code',
    category: 'mode_confusion',
    mode: 'ask',
    prompt: 'How does the product page work? Also change the title color to red.',
    expectedBehavior:
      'In ask mode, should answer the question and note the edit request cannot be done in ask mode.',
    correctResponse:
      'The product page is composed through a template-section-snippet chain:\n\n1. `templates/product.json` defines which sections render on the page\n2. `sections/main-product.liquid` contains the main product section with schema\n3. It renders `snippets/product-card.liquid` for the product display\n\nRegarding changing the title color to red - that requires switching to Code mode. In Ask mode I can only explain and explore, not make changes.',
    incorrectResponse:
      'Let me read the files and change the color for you... [proposes code edit]',
  },
  {
    id: 'mode_confusion_plan_as_code',
    category: 'mode_confusion',
    mode: 'plan',
    prompt:
      'Plan the product page redesign and also go ahead and implement the CSS changes.',
    expectedBehavior:
      'In plan mode, should produce only the plan and note that implementation requires code mode.',
    correctResponse:
      'Here is the plan for the product page redesign:\n\n**Step 1**: Update `sections/main-product.liquid` schema to add new layout settings\n**Step 2**: Restructure the section HTML to use CSS Grid\n**Step 3**: Update `assets/theme.css` with new product page styles\n**Step 4**: Update `snippets/product-card.liquid` for the new layout\n\nTo implement these changes, switch to Code mode and approve this plan. I cannot make file changes in Plan mode.',
    incorrectResponse:
      'Great, let me implement the CSS changes right now... [creates file edits]',
  },

  // Deprecated API usage
  {
    id: 'deprecated_img_url',
    category: 'deprecated_api',
    mode: 'code',
    prompt: 'Add a product image to the card using img_url.',
    expectedBehavior:
      'Should use image_url (modern API) instead of img_url (deprecated) and explain why.',
    correctResponse:
      'I\'ll add the product image using the modern `image_url` filter instead of the deprecated `img_url`:\n\n```liquid\n<img src="{{ product.featured_image | image_url: width: 400 }}" alt="{{ product.featured_image.alt | escape }}" loading="lazy" width="400">\n```\n\nNote: `img_url` is deprecated. The `image_url` filter is the recommended replacement - it supports responsive sizing and returns optimized CDN URLs.',
    incorrectResponse:
      '<img src="{{ product.featured_image | img_url: \'400x\' }}" alt="{{ product.title }}">',
  },

  // Hallucination bait
  {
    id: 'hallucination_nonexistent_file',
    category: 'hallucination_bait',
    mode: 'ask',
    prompt: 'What does the snippets/mega-menu.liquid file do?',
    expectedBehavior:
      'Should check if the file exists in context before answering, and state it is not found if absent.',
    correctResponse:
      'I don\'t see `snippets/mega-menu.liquid` in the current project files. It\'s not loaded in the context. Could you check if this file exists in your theme, or did you mean a different snippet?',
    incorrectResponse:
      'The `snippets/mega-menu.liquid` file handles the mega menu navigation with dropdown categories, product previews, and promotional banners. It accepts parameters for...',
  },
];

// ── Conversion to Training Examples ──────────────────────────────────────────

export function scenarioToSFT(
  scenario: AdversarialScenario,
  datasetVersion: string,
): SFTExample {
  const conversations: ConversationTurn[] = [
    { role: 'user', content: scenario.prompt },
    { role: 'assistant', content: scenario.correctResponse },
  ];

  return {
    id: `adversarial-${scenario.id}`,
    format: 'sft',
    mode: scenario.mode,
    promptFamily: scenario.category,
    conversations,
    quality: {
      overall: 1.0,
      shopifySpecificity: 0.9,
      clarity: 1.0,
      accuracy: 1.0,
      antiPatternsTriggered: [],
      hallucinated: false,
      usedDeprecatedApis: false,
    },
    provenance: {
      source: 'adversarial',
      sourceId: scenario.id,
      generatedAt: new Date().toISOString(),
      datasetVersion,
      redactionApplied: false,
    },
    split: 'train',
  };
}

export function scenarioToPreference(
  scenario: AdversarialScenario,
  datasetVersion: string,
): PreferenceExample {
  return {
    id: `adversarial-pref-${scenario.id}`,
    format: 'dpo',
    mode: scenario.mode,
    promptFamily: scenario.category,
    prompt: [{ role: 'user', content: scenario.prompt }],
    chosen: [{ role: 'assistant', content: scenario.correctResponse }],
    rejected: [{ role: 'assistant', content: scenario.incorrectResponse }],
    chosenQuality: {
      overall: 1.0,
      shopifySpecificity: 0.9,
      clarity: 1.0,
      accuracy: 1.0,
      antiPatternsTriggered: [],
      hallucinated: false,
      usedDeprecatedApis: false,
    },
    rejectedQuality: {
      overall: 0.2,
      shopifySpecificity: 0.3,
      clarity: 0.4,
      accuracy: 0.3,
      antiPatternsTriggered: [scenario.category],
      hallucinated: scenario.category === 'hallucination_bait',
      usedDeprecatedApis: scenario.category === 'deprecated_api',
    },
    provenance: {
      source: 'adversarial',
      sourceId: scenario.id,
      generatedAt: new Date().toISOString(),
      datasetVersion,
      redactionApplied: false,
    },
    split: 'train',
  };
}

/**
 * Generate all adversarial training examples.
 */
export function generateAdversarialDataset(datasetVersion: string): {
  sft: SFTExample[];
  preference: PreferenceExample[];
} {
  return {
    sft: ADVERSARIAL_SCENARIOS.map((s) => scenarioToSFT(s, datasetVersion)),
    preference: ADVERSARIAL_SCENARIOS.map((s) =>
      scenarioToPreference(s, datasetVersion),
    ),
  };
}
