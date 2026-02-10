/**
 * REQ-52 Task 7: Design System Context Provider for Agent Integration.
 *
 * Generates a formatted text block summarising the project's design tokens
 * for inclusion in agent prompts.  Optimised for LLM consumption: clear
 * headings, CSS custom-property names, concrete examples.
 */

import { listByProject } from '../models/token-model';
import type { DesignTokenRow } from '../models/token-model';
import type { TokenCategory } from '../types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class DesignSystemContextProvider {
  /**
   * Generate a human-readable design-system context block for agent prompts.
   *
   * Returns an empty string when no tokens are found (or on error) so agent
   * execution is never blocked.
   */
  async getDesignContext(projectId: string): Promise<string> {
    try {
      const tokens = await listByProject(projectId);
      if (!tokens || tokens.length === 0) return '';
      return formatTokenContext(tokens);
    } catch (error) {
      console.warn(
        '[DesignSystemContextProvider] Failed to load design tokens:',
        error,
      );
      return '';
    }
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Category display order & labels. */
const CATEGORY_META: Record<TokenCategory, { label: string; example: string }> = {
  color: {
    label: 'Color Tokens',
    example: 'Use `var(--color-primary)` in CSS, `{{ settings.color_primary }}` in Liquid.',
  },
  typography: {
    label: 'Typography Tokens',
    example: 'Use `var(--font-heading)` in CSS, `{{ settings.font_heading }}` in Liquid.',
  },
  spacing: {
    label: 'Spacing Tokens',
    example: 'Use `var(--spacing-md)` in CSS for consistent spacing.',
  },
  border: {
    label: 'Border Tokens',
    example: 'Use `var(--border-radius-md)` in CSS.',
  },
  shadow: {
    label: 'Shadow Tokens',
    example: 'Use `var(--shadow-lg)` in CSS.',
  },
  animation: {
    label: 'Animation Tokens',
    example: 'Use `var(--animation-duration)` in CSS.',
  },
};

function formatTokenContext(tokens: DesignTokenRow[]): string {
  // Group by category
  const grouped = new Map<TokenCategory, DesignTokenRow[]>();
  for (const token of tokens) {
    const list = grouped.get(token.category) ?? [];
    list.push(token);
    grouped.set(token.category, list);
  }

  const sections: string[] = ['## Design System Tokens\n'];

  // Iterate in deterministic order
  const orderedCategories: TokenCategory[] = [
    'color',
    'typography',
    'spacing',
    'border',
    'shadow',
    'animation',
  ];

  for (const category of orderedCategories) {
    const catTokens = grouped.get(category);
    if (!catTokens || catTokens.length === 0) continue;

    const meta = CATEGORY_META[category];
    sections.push(`### ${meta.label}`);
    sections.push(meta.example);
    sections.push('');

    for (const t of catTokens) {
      const cssName = `--${t.name}`;
      sections.push(`- \`${cssName}: ${t.value};\`${t.description ? ` — ${t.description}` : ''}`);
    }
    sections.push('');
  }

  // Convention rules
  sections.push('### Convention Rules');
  sections.push('- CSS: Always use `var(--token-name)` instead of hardcoded values.');
  sections.push('- Liquid: Use `{{ settings.token_name }}` for theme setting values.');
  sections.push('- JavaScript: Reference CSS variables via `getComputedStyle` or CSS classes.');
  sections.push('- Never hardcode color hex values, font stacks, or spacing pixel values.');

  return sections.join('\n');
}
