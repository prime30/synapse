/**
 * Common Shopify workflows the PM agent can recognize and delegate optimally.
 * Each workflow maps user intent to the right sequence of specialist agents.
 */

export interface WorkflowStep {
  agent: 'liquid' | 'css' | 'javascript' | 'json';
  focus: string;
  priority: 'required' | 'optional';
}

export interface ShopifyWorkflow {
  id: string;
  name: string;
  description: string;
  /** Regex patterns or keywords to match against user requests */
  triggers: RegExp[];
  /** Ordered steps for the workflow */
  steps: WorkflowStep[];
  /** Specific instructions for the PM to include in delegation */
  pmGuidance: string;
}

export const SHOPIFY_WORKFLOWS: ShopifyWorkflow[] = [
  {
    id: 'add-a-section',
    name: 'Add a section',
    description:
      'Add a new section to a theme. Requires Liquid (section file + schema), CSS (styles), and optionally JSON (add to template).',
    triggers: [
      /add\s+(?:a\s+)?(?:new\s+)?section/i,
      /create\s+(?:a\s+)?section/i,
      /implement\s+(?:a\s+)?section/i,
      /new\s+section\s+for/i,
    ],
    steps: [
      {
        agent: 'liquid',
        focus: 'Create section file with schema (settings, blocks)',
        priority: 'required',
      },
      {
        agent: 'css',
        focus: 'Section styles and layout',
        priority: 'required',
      },
      {
        agent: 'json',
        focus: 'Add section to template JSON if needed',
        priority: 'optional',
      },
    ],
    pmGuidance:
      'Delegate to Liquid first for section file and schema. CSS must style the section. JSON agent only if user wants the section added to a specific template.',
  },
  {
    id: 'redesign-the-header',
    name: 'Redesign the header',
    description:
      'Redesign the theme header. Needs Liquid (structure), CSS (styling), and JS (mobile menu, cart drawer).',
    triggers: [
      /redesign\s+(?:the\s+)?header/i,
      /update\s+(?:the\s+)?header/i,
      /change\s+(?:the\s+)?header/i,
      /header\s+redesign/i,
      /redesign\s+header/i,
      /mobile\s+menu|cart\s+drawer/i,
    ],
    steps: [
      {
        agent: 'liquid',
        focus: 'Header structure, navigation markup, schema',
        priority: 'required',
      },
      {
        agent: 'css',
        focus: 'Header layout, responsive styles, visual design',
        priority: 'required',
      },
      {
        agent: 'javascript',
        focus: 'Mobile menu toggle, cart drawer, interactive behavior',
        priority: 'required',
      },
    ],
    pmGuidance:
      'All three agents are required. Liquid defines structure, CSS handles layout and styling, JS handles mobile menu and cart drawer interactions. Coordinate so JS targets the correct Liquid markup.',
  },
  {
    id: 'optimize-performance',
    name: 'Optimize performance',
    description:
      'Optimize theme performance. Needs Liquid (loop limits, capture), CSS (critical CSS), and asset checks (image sizing).',
    triggers: [
      /optimize\s+performance/i,
      /improve\s+performance/i,
      /speed\s+up\s+(?:the\s+)?(?:theme|site|store)/i,
      /performance\s+optimization/i,
      /reduce\s+(?:page\s+)?load\s+time/i,
      /critical\s+css|loop\s+limits/i,
    ],
    steps: [
      {
        agent: 'liquid',
        focus: 'Loop limits, capture usage, lazy loading, reduce DOM',
        priority: 'required',
      },
      {
        agent: 'css',
        focus: 'Critical CSS, above-the-fold styles, unused CSS removal',
        priority: 'required',
      },
      {
        agent: 'javascript',
        focus: 'Defer non-critical scripts, image sizing checks',
        priority: 'optional',
      },
    ],
    pmGuidance:
      'Liquid and CSS are primary. Focus on loop limits and capture in Liquid; extract critical CSS. JS optional for deferring scripts or image optimization logic.',
  },
  {
    id: 'add-product-feature',
    name: 'Add product feature',
    description:
      'Add a product-related feature. Needs Liquid (template), JS (interactivity), and Schema (settings).',
    triggers: [
      /add\s+(?:a\s+)?product\s+feature/i,
      /product\s+page\s+(?:feature|enhancement)/i,
      /add\s+(?:to\s+)?product\s+(?:page|template)/i,
      /product\s+template\s+(?:change|update)/i,
      /product\s+interactivity|product\s+carousel/i,
    ],
    steps: [
      {
        agent: 'liquid',
        focus: 'Product template markup, section schema, metafields',
        priority: 'required',
      },
      {
        agent: 'javascript',
        focus: 'Product interactivity (variants, gallery, add-to-cart)',
        priority: 'required',
      },
      {
        agent: 'json',
        focus: 'Schema settings for product section',
        priority: 'optional',
      },
    ],
    pmGuidance:
      'Liquid defines the product template structure; JS handles variant switching, gallery, and add-to-cart. Schema settings may be embedded in Liquid section.',
  },
  {
    id: 'fix-mobile-layout',
    name: 'Fix mobile layout',
    description:
      'Fix responsive/mobile layout issues. Primarily CSS (responsive), possibly Liquid (conditional rendering).',
    triggers: [
      /fix\s+mobile\s+layout/i,
      /mobile\s+(?:layout|responsive)\s+(?:fix|issue|broken)/i,
      /responsive\s+(?:design|layout)\s+(?:fix|broken)/i,
      /mobile\s+view\s+(?:broken|wrong|issue)/i,
      /break\s+on\s+mobile|doesn't\s+work\s+on\s+mobile/i,
    ],
    steps: [
      {
        agent: 'css',
        focus: 'Responsive breakpoints, flexbox/grid, viewport units',
        priority: 'required',
      },
      {
        agent: 'liquid',
        focus: 'Conditional rendering for mobile vs desktop',
        priority: 'optional',
      },
    ],
    pmGuidance:
      'CSS is primary for responsive fixes. Liquid optional only if mobile needs different markup (e.g., hide/show elements). Start with CSS media queries.',
  },
];

/**
 * Tests the user request against all workflow triggers and returns the first match.
 */
export function detectWorkflow(userRequest: string): ShopifyWorkflow | null {
  const trimmed = userRequest.trim();
  if (!trimmed) return null;

  for (const workflow of SHOPIFY_WORKFLOWS) {
    for (const trigger of workflow.triggers) {
      if (trigger.test(trimmed)) {
        return workflow;
      }
    }
  }
  return null;
}

/**
 * Formats the workflow into a delegation hint string for the PM prompt.
 */
export function getWorkflowDelegationHint(workflow: ShopifyWorkflow): string {
  const requiredSteps = workflow.steps
    .filter((s) => s.priority === 'required')
    .map(
      (s) => `- ${s.agent}: ${s.focus}`,
    )
    .join('\n');
  const optionalSteps = workflow.steps
    .filter((s) => s.priority === 'optional')
    .map(
      (s) => `- ${s.agent} (optional): ${s.focus}`,
    )
    .join('\n');

  let hint = `Workflow: ${workflow.name}\n`;
  hint += `Description: ${workflow.description}\n\n`;
  hint += `Required steps:\n${requiredSteps}\n`;
  if (optionalSteps) {
    hint += `\nOptional steps:\n${optionalSteps}\n`;
  }
  hint += `\nPM guidance: ${workflow.pmGuidance}`;

  return hint;
}
