/**
 * Smart prompt suggestion engine.
 *
 * Two modes:
 *   - Contextual (pre-prompt): based on active file, path patterns, project state
 *   - Response (post-response): based on what the agent just did
 *
 * Uses weighted scoring with action history and frequency dampening.
 */

export interface Suggestion {
  id: string;
  label: string;
  prompt: string;
  /** Visual category for icon/color theming */
  category: 'build' | 'optimize' | 'test' | 'deploy' | 'explore' | 'fix';
  /** Raw relevance score (higher = more relevant) */
  score: number;
  /** Human-readable reason for why this suggestion is relevant (shown in tooltip in EPIC 2) */
  reason?: string;
}

export interface SuggestionContext {
  filePath: string | null;
  fileLanguage: string | null;
  selection: string | null;
  /** Whether a Shopify store is connected */
  hasShopifyConnection: boolean;
  /** Number of files in the project */
  fileCount: number;
  /** Last action that was taken (for arc detection) */
  lastAction?: string | null;
}

// ── Signal weights ───────────────────────────────────────────────────────────

const W_FILE_TYPE = 1.0;
const W_PATH_PATTERN = 0.9;
const W_PROJECT_STATE = 0.7;
const W_RECENCY = 0.8;
const W_NOVELTY = 0.6;
const FREQUENCY_PENALTY = 0.5;

// ── Pre-prompt suggestion catalog ────────────────────────────────────────────

interface CatalogEntry {
  id: string;
  label: string;
  prompt: string;
  category: Suggestion['category'];
  /** Conditions: match any = eligible, more matches = higher score */
  signals: {
    fileLanguages?: string[];
    pathPatterns?: RegExp[];
    requiresShopify?: boolean;
    emptyProject?: boolean;
    noFile?: boolean;
  };
}

const CATALOG: CatalogEntry[] = [
  // ── Liquid file context ──────────────────────────────────────────
  { id: 'liquid-schema', label: 'Add schema settings', prompt: 'Add a schema block with useful settings to this section. Include common settings like heading, description, background color, and spacing.', category: 'build', signals: { fileLanguages: ['liquid'], pathPatterns: [/sections\//] } },
  { id: 'liquid-responsive', label: 'Make it responsive', prompt: 'Make this section fully responsive. Add mobile-first breakpoints, flexible layouts, and ensure it looks great on all screen sizes.', category: 'optimize', signals: { fileLanguages: ['liquid'] } },
  { id: 'liquid-a11y', label: 'Improve accessibility', prompt: 'Audit this file for accessibility issues. Add proper ARIA attributes, semantic HTML, focus management, and screen reader support.', category: 'optimize', signals: { fileLanguages: ['liquid'] } },
  { id: 'liquid-performance', label: 'Optimize performance', prompt: 'Optimize this Liquid template for performance. Minimize render-blocking, use lazy loading for images, reduce unnecessary loops, and leverage Shopify caching.', category: 'optimize', signals: { fileLanguages: ['liquid'] } },
  { id: 'liquid-blocks', label: 'Add section blocks', prompt: 'Add customizable blocks to this section so merchants can add, remove, and reorder content in the theme editor.', category: 'build', signals: { fileLanguages: ['liquid'], pathPatterns: [/sections\//] } },

  // ── CSS file context ─────────────────────────────────────────────
  { id: 'css-variables', label: 'Convert to CSS variables', prompt: 'Refactor hardcoded values in this CSS to use CSS custom properties. Create a clean variable system for colors, spacing, and typography.', category: 'optimize', signals: { fileLanguages: ['css'] } },
  { id: 'css-responsive', label: 'Add breakpoints', prompt: 'Add responsive breakpoints to this CSS. Use mobile-first approach with clean media queries for tablet and desktop.', category: 'build', signals: { fileLanguages: ['css'] } },
  { id: 'css-darkmode', label: 'Add dark mode', prompt: 'Add dark mode support using CSS custom properties and prefers-color-scheme media query. Ensure smooth color transitions.', category: 'build', signals: { fileLanguages: ['css'] } },

  // ── JavaScript file context ──────────────────────────────────────
  { id: 'js-errors', label: 'Add error handling', prompt: 'Add proper error handling to this JavaScript. Add try/catch blocks, null checks, graceful fallbacks, and user-friendly error messages.', category: 'fix', signals: { fileLanguages: ['javascript'] } },
  { id: 'js-a11y', label: 'Make interactive & accessible', prompt: 'Make the interactive elements in this file accessible. Add keyboard navigation, ARIA attributes, focus management, and screen reader announcements.', category: 'optimize', signals: { fileLanguages: ['javascript'] } },
  { id: 'js-web-component', label: 'Convert to web component', prompt: 'Refactor this JavaScript into a proper Shopify web component (custom element). Follow Shopify Dawn patterns with connectedCallback and proper lifecycle.', category: 'optimize', signals: { fileLanguages: ['javascript'] } },

  // ── Template patterns ────────────────────────────────────────────
  { id: 'template-dynamic', label: 'Add dynamic content', prompt: 'Add dynamic Liquid content to this template. Use metafields, product data, and collection properties to make it data-driven.', category: 'build', signals: { pathPatterns: [/templates\//] } },
  { id: 'snippet-reusable', label: 'Extract to snippet', prompt: 'Extract the main component in this file into a reusable Shopify snippet. Make it accept parameters via render tag for maximum reusability.', category: 'optimize', signals: { pathPatterns: [/sections\//, /templates\//] } },

  // ── JSON settings ────────────────────────────────────────────────
  { id: 'json-settings', label: 'Enhance theme settings', prompt: 'Review and enhance the settings in this JSON template. Add useful customization options that merchants would want in the theme editor.', category: 'build', signals: { fileLanguages: ['json'], pathPatterns: [/templates\//, /config\//] } },

  // ── No file selected / empty state ───────────────────────────────
  { id: 'hero-section', label: 'Build a hero section', prompt: 'Create a new hero section with a full-width image/video background, headline, subheading, and CTA button. Include schema settings for all content.', category: 'build', signals: { noFile: true } },
  { id: 'product-card', label: 'Create product card', prompt: 'Build a reusable product card snippet with image, title, price, compare-at price, badges (sale, sold out), and quick-add button.', category: 'build', signals: { noFile: true } },
  { id: 'newsletter-form', label: 'Add newsletter signup', prompt: 'Create a newsletter signup section with email input, submit button, success/error states, and Shopify Customer API integration.', category: 'build', signals: { noFile: true } },
  { id: 'collection-grid', label: 'Build collection grid', prompt: 'Create a collection page grid section with filtering, sorting, pagination, and responsive layout. Use Shopify section rendering API.', category: 'build', signals: { noFile: true } },
  { id: 'explore-theme', label: 'Analyze theme structure', prompt: 'Analyze the overall structure of this theme. Identify the main sections, templates, and snippets. Suggest improvements to the architecture.', category: 'explore', signals: { noFile: true } },

  // ── Shopify-connected actions ────────────────────────────────────
  { id: 'push-review', label: 'Review before pushing', prompt: 'Review all pending changes before I push to Shopify. List what files changed and highlight any potential issues.', category: 'deploy', signals: { requiresShopify: true } },
  { id: 'theme-audit', label: 'Full theme audit', prompt: 'Run a comprehensive audit of the entire theme. Check for performance issues, accessibility problems, Liquid best practices, and deprecated features.', category: 'test', signals: { requiresShopify: true } },

  // ── File linking suggestions ──────────────────────────────────────
  { id: 'link-related-css', label: 'Open related CSS', prompt: 'Open the CSS file that corresponds to this section so I can work on both the template and styles together.', category: 'explore', signals: { fileLanguages: ['liquid'], pathPatterns: [/sections\//] } },
  { id: 'link-related-js', label: 'Open related JS', prompt: 'Open the JavaScript file that corresponds to this section so I can work on the template and interactivity together.', category: 'explore', signals: { fileLanguages: ['liquid'], pathPatterns: [/sections\//] } },
  { id: 'review-component', label: 'Review full component', prompt: 'Review this component across all its files (Liquid template, CSS styles, and JavaScript). Identify inconsistencies and suggest improvements that span all three.', category: 'explore', signals: { fileLanguages: ['liquid', 'css', 'javascript'] } },
];

// ── Response-based suggestion patterns ───────────────────────────────────────

interface ResponsePattern {
  id: string;
  label: string;
  prompt: string;
  category: Suggestion['category'];
  /** Signal functions: return true if pattern matches the response */
  detect: (response: string) => boolean;
  /** Priority order (lower = shown first) */
  priority: number;
}

const RESPONSE_PATTERNS: ResponsePattern[] = [
  // Code changes made
  { id: 'post-test', label: 'Test in preview', prompt: 'The changes look good. Let me check the preview to verify everything renders correctly.', category: 'test', priority: 1, detect: (r) => /\b(created|added|updated|modified|changed|wrote)\b/i.test(r) && /\b(file|section|template|snippet|css|javascript)\b/i.test(r) },
  { id: 'post-push', label: 'Push to Shopify', prompt: 'Push these changes to the Shopify dev theme so I can see them live.', category: 'deploy', priority: 2, detect: (r) => /\b(created|added|updated|changed)\b/i.test(r) },
  { id: 'post-diff', label: 'Show me the diff', prompt: 'Show me a diff of what changed so I can review before pushing.', category: 'test', priority: 3, detect: (r) => /\b(changed|modified|updated|refactored)\b/i.test(r) },

  // Explanation given
  { id: 'post-implement', label: 'Implement this', prompt: 'Great explanation. Now implement it in the actual code.', category: 'build', priority: 1, detect: (r) => /\b(you (could|can|should)|approach|strategy|option|consider)\b/i.test(r) && !/\b(created|wrote|added)\b/i.test(r) },
  { id: 'post-example', label: 'Show me an example', prompt: 'Can you show me a concrete code example of this approach?', category: 'explore', priority: 2, detect: (r) => /\b(concept|pattern|architecture|approach)\b/i.test(r) },

  // Error fix
  { id: 'post-similar', label: 'Check for similar issues', prompt: 'Check the rest of the theme for similar issues and fix them all.', category: 'fix', priority: 2, detect: (r) => /\b(fix|fixed|error|bug|issue|problem|resolved)\b/i.test(r) },
  { id: 'post-prevent', label: 'Prevent this in future', prompt: 'How can I prevent this type of issue in the future? Add any necessary validation or guards.', category: 'fix', priority: 3, detect: (r) => /\b(fix|fixed|error|bug)\b/i.test(r) },

  // Section/component created
  { id: 'post-customize', label: 'Add more settings', prompt: 'Add more customization settings to this section so merchants have full control in the theme editor.', category: 'build', priority: 2, detect: (r) => /\b(section|component|snippet)\b/i.test(r) && /\b(created|built|added)\b/i.test(r) },
  { id: 'post-responsive', label: 'Make it responsive', prompt: 'Now make this responsive and ensure it looks great on mobile, tablet, and desktop.', category: 'optimize', priority: 3, detect: (r) => /\b(section|component|layout)\b/i.test(r) && /\b(created|built|added)\b/i.test(r) },

  // Multi-file changes
  { id: 'post-open-modified', label: 'Open all modified files', prompt: 'Open all the files that were just modified so I can review the changes across the component.', category: 'explore', priority: 2, detect: (r) => (r.match(/\b(modified|updated|changed)\b/gi) ?? []).length >= 2 },
  { id: 'post-link-files', label: 'Link these files together', prompt: 'Link the files that were just modified together so they always open as a group.', category: 'explore', priority: 4, detect: (r) => (r.match(/\b(file|template|stylesheet|script)\b/gi) ?? []).length >= 2 },

  // General next steps
  { id: 'post-more', label: 'What else can we improve?', prompt: 'What other improvements would you suggest for this theme? Focus on the highest-impact changes.', category: 'explore', priority: 10, detect: () => true },
];

// ── Scoring engine ───────────────────────────────────────────────────────────

function scoreEntry(
  entry: CatalogEntry,
  ctx: SuggestionContext,
  shownIds: Set<string>,
): number {
  let score = 0;
  const { signals } = entry;

  // File language match
  if (signals.fileLanguages?.length) {
    if (ctx.fileLanguage && signals.fileLanguages.includes(ctx.fileLanguage)) {
      score += W_FILE_TYPE;
    } else {
      return -1; // requires specific language but none matches
    }
  }

  // Path pattern match
  if (signals.pathPatterns?.length) {
    const pathMatch = ctx.filePath && signals.pathPatterns.some((p) => p.test(ctx.filePath!));
    if (pathMatch) {
      score += W_PATH_PATTERN;
    }
  }

  // Shopify connection required
  if (signals.requiresShopify && !ctx.hasShopifyConnection) return -1;
  if (signals.requiresShopify && ctx.hasShopifyConnection) score += W_PROJECT_STATE;

  // Empty project / no file
  if (signals.emptyProject && ctx.fileCount === 0) score += W_PROJECT_STATE;
  if (signals.noFile && !ctx.filePath) score += W_FILE_TYPE;
  if (signals.noFile && ctx.filePath) return -1; // only show when no file selected

  // Novelty: penalize recently shown
  if (shownIds.has(entry.id)) {
    score -= FREQUENCY_PENALTY;
  } else {
    score += W_NOVELTY;
  }

  return score;
}

/** Generate a human-readable reason for why a suggestion is relevant. */
function generateReason(entry: CatalogEntry, ctx: SuggestionContext): string {
  const parts: string[] = [];

  if (entry.signals.fileLanguages?.length && ctx.fileLanguage) {
    parts.push(`You're editing a ${ctx.fileLanguage} file`);
  }
  if (entry.signals.pathPatterns?.length && ctx.filePath) {
    const dirMatch = ctx.filePath.match(/^([^/]+)\//);
    if (dirMatch) parts.push(`in the ${dirMatch[1]}/ directory`);
  }
  if (entry.signals.requiresShopify) {
    parts.push('Store is connected');
  }
  if (entry.signals.noFile) {
    parts.push('No file is selected');
  }

  return parts.length > 0 ? parts.join(', ') : 'Recommended action';
}

/**
 * Get contextual suggestions for the pre-prompt state.
 * Returns top 4 suggestions sorted by score.
 */
export function getContextualSuggestions(
  ctx: SuggestionContext,
  recentlyShownIds: Set<string> = new Set(),
): Suggestion[] {
  const scored = CATALOG
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, ctx, recentlyShownIds),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return scored.map(({ entry, score }) => ({
    id: entry.id,
    label: entry.label,
    prompt: entry.prompt,
    category: entry.category,
    score,
    reason: generateReason(entry, ctx),
  }));
}

/**
 * Get response-based suggestions after an agent reply.
 * Analyzes the response content and returns top 3 next-best-actions.
 */
export function getResponseSuggestions(
  responseContent: string,
  ctx: SuggestionContext,
  recentlyShownIds: Set<string> = new Set(),
): Suggestion[] {
  const matched = RESPONSE_PATTERNS
    .filter((p) => p.detect(responseContent))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 4);

  return matched
    .map((p) => ({
      id: p.id,
      label: p.label,
      prompt: p.prompt,
      category: p.category,
      score: 10 - p.priority - (recentlyShownIds.has(p.id) ? FREQUENCY_PENALTY : 0),
      reason: 'Based on the AI response',
    }))
    .filter((s) => s.score > 0)
    .slice(0, 3);
}

/**
 * Detect conversation arc and suggest the next logical step.
 * Pattern: explain → implement → test → optimize → deploy
 */
export function getArcSuggestion(
  recentActions: string[],
): Suggestion | null {
  const last = recentActions[recentActions.length - 1];
  const secondLast = recentActions[recentActions.length - 2];

  if (last === 'explain' && secondLast !== 'implement') {
    return { id: 'arc-implement', label: "Let's build it", prompt: "Let's implement this. Write the code based on what you just explained.", category: 'build', score: 10, reason: 'Follow up on the explanation' };
  }
  if (last === 'implement' || last === 'code_change') {
    return { id: 'arc-test', label: 'Verify in preview', prompt: 'Check the preview to verify the changes render correctly.', category: 'test', score: 10, reason: 'Verify the changes you just made' };
  }
  if (last === 'test') {
    return { id: 'arc-optimize', label: 'Optimize further', prompt: 'The changes work. What optimizations would make this even better? Consider performance, accessibility, and responsiveness.', category: 'optimize', score: 10, reason: 'Changes are working — time to improve' };
  }
  if (last === 'optimize') {
    return { id: 'arc-deploy', label: 'Push to store', prompt: 'Everything looks great. Push the changes to the Shopify dev theme.', category: 'deploy', score: 10, reason: 'Optimizations complete — ready to publish' };
  }

  return null;
}

/**
 * Detect whether an AI response contains code blocks.
 * Returns the count and languages found.
 */
export function detectCodeBlocks(response: string): { count: number; languages: string[] } {
  const codeBlockRe = /```(\w*)\n[\s\S]*?```/g;
  const languages: string[] = [];
  let count = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRe.exec(response)) !== null) {
    count++;
    if (match[1]) {
      languages.push(match[1]);
    }
  }

  return { count, languages: [...new Set(languages)] };
}

/**
 * Detect whether an AI response contains a plan/steps structure.
 * Returns true if the response appears to outline numbered steps or a plan.
 */
export function detectPlanSignal(response: string): boolean {
  // Check for numbered steps pattern (1. ... 2. ... 3. ...)
  const numberedSteps = response.match(/^\s*\d+\.\s+/gm);
  if (numberedSteps && numberedSteps.length >= 3) return true;

  // Check for "Step N:" pattern
  const stepPattern = response.match(/\bStep\s+\d+/gi);
  if (stepPattern && stepPattern.length >= 2) return true;

  // Check for plan-like headers
  const planHeaders = /\b(plan|approach|strategy|steps to|here'?s (the|my) plan)\b/i;
  if (planHeaders.test(response) && numberedSteps && numberedSteps.length >= 2) return true;

  return false;
}
