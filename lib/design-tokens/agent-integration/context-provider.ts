/**
 * REQ-52 Task 7: Design System Context Provider for Agent Integration.
 *
 * Generates a formatted text block summarising the project's design tokens
 * for inclusion in agent prompts.  Optimised for LLM consumption: clear
 * headings, CSS custom-property names, concrete examples.
 */

import { listByProject } from '../models/token-model';
import { getDriftEvents } from '../drift-events';
import { detectTypographicScale } from '../inference/scale-detector';
import { extractNumericValue } from '../inference/token-grouping';
import type { DesignTokenRow, DesignComponentRow } from '../models/token-model';
import type { TokenCategory, TokenTier } from '../types';
import { listComponentsByProject } from '../components/component-persistence';
import { TokenExtractor } from '../token-extractor';
import { downloadFromStorage } from '@/lib/storage/files';
import { analyzeSchemaConventions } from '../schema-conventions';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function getFilesClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
  }
  const { createClient } = await import('@/lib/supabase/server');
  return createClient();
}

async function fetchFallbackFiles(projectId: string): Promise<{ content: string; filePath: string }[]> {
  const supabase = await getFilesClient();
  const result: { content: string; filePath: string }[] = [];

  const { data: schemaFile } = await supabase
    .from('files')
    .select('path, content, storage_path')
    .eq('project_id', projectId)
    .eq('path', 'config/settings_schema.json')
    .maybeSingle();

  if (schemaFile) {
    let content = schemaFile.content ?? '';
    if (schemaFile.storage_path && !content) {
      try {
        content = await downloadFromStorage(schemaFile.storage_path);
      } catch { /* ignore */ }
    }
    if (content) result.push({ content, filePath: schemaFile.path });
  }

  const { data: cssFiles } = await supabase
    .from('files')
    .select('path, content, storage_path')
    .eq('project_id', projectId)
    .like('path', 'assets/%')
    .limit(20);

  if (cssFiles) {
    const cssPaths = cssFiles.filter(
      (f) => f.path.endsWith('.css') || f.path.endsWith('.scss'),
    );
    for (const f of cssPaths.slice(0, 3)) {
      let content = f.content ?? '';
      if (f.storage_path && !content) {
        try {
          content = await downloadFromStorage(f.storage_path);
        } catch { /* ignore */ }
      }
      if (content) result.push({ content, filePath: f.path });
    }
  }

  return result;
}

async function fetchSectionFiles(projectId: string): Promise<{ path: string; content: string }[]> {
  const supabase = await getFilesClient();
  const { data } = await supabase
    .from('files')
    .select('path, content, storage_path')
    .eq('project_id', projectId)
    .like('path', 'sections/%')
    .limit(50);

  if (!data) return [];
  const result: { path: string; content: string }[] = [];
  for (const f of data) {
    if (!f.path.endsWith('.liquid')) continue;
    let content = f.content ?? '';
    if ((f as { storage_path?: string }).storage_path && !content) {
      try {
        content = await downloadFromStorage((f as { storage_path: string }).storage_path);
      } catch { /* ignore */ }
    }
    if (content) result.push({ path: f.path, content });
  }
  return result;
}

export class DesignSystemContextProvider {
  /**
   * Generate a human-readable design-system context block for agent prompts.
   *
   * Returns an empty string when no tokens are found (or on error) so agent
   * execution is never blocked.
   */
  async getDesignContext(projectId: string): Promise<string> {
    try {
      const [tokens, components] = await Promise.all([
        listByProject(projectId),
        listComponentsByProject(projectId).catch(() => [] as DesignComponentRow[]),
      ]);

      const driftEvents = getDriftEvents(projectId, 3);
      const forceIncludeTokenNames = new Set(
        driftEvents.filter((e) => e.expectedToken).map((e) => e.expectedToken!.toLowerCase()),
      );

      let tokenContext = '';
      let tokensForContext: DesignTokenRow[] = tokens ?? [];
      if (tokens && tokens.length > 0) {
        tokenContext = formatTokenContext(tokens, { forceIncludeTokenNames });
      } else {
        const fallbackFiles = await fetchFallbackFiles(projectId);
        if (fallbackFiles.length === 0) return '';

        const extractor = new TokenExtractor();
        const extracted = extractor.extractFromFiles(fallbackFiles);
        if (extracted.length === 0) return '';

        console.warn('[DesignContext] Using fallback extraction -- DB tokens not yet available');
        const rows: DesignTokenRow[] = extracted.map((t) => ({
          id: t.id,
          project_id: projectId,
          name: t.name ?? t.id,
          category: t.category,
          value: t.value,
          aliases: [],
          description: t.context || null,
          metadata: {},
          semantic_parent_id: null,
          created_at: '',
          updated_at: '',
        }));
        tokensForContext = rows;
        tokenContext = formatTokenContext(rows, { forceIncludeTokenNames });
      }

      const buttonSection = formatButtonSystemContext(components);
      if (buttonSection) {
        tokenContext += '\n\n' + buttonSection;
      }

      const colorSchemesSection = formatColorSchemesContext(tokensForContext);
      if (colorSchemesSection) {
        tokenContext += '\n\n' + colorSchemesSection;
      }

      const iconSection = formatIconContext(components);
      if (iconSection) {
        tokenContext += '\n\n' + iconSection;
      }

      try {
        const schemaSection = await formatSchemaConventionsContext(projectId);
        if (schemaSection) {
          tokenContext += '\n\n' + schemaSection;
        }
      } catch {
        // Schema conventions fetch may fail outside request scope (e.g. tests)
      }

      return tokenContext;
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

/** Infer tier from token name (matches inference/index.ts heuristics). */
function inferTierFromName(name: string): TokenTier {
  const COMPONENT = ['button', 'card', 'nav', 'header', 'footer', 'modal', 'form'];
  const SEMANTIC = ['primary', 'secondary', 'accent', 'error', 'success', 'warning', 'background', 'foreground', 'text', 'heading', 'body'];
  const parts = name.toLowerCase().split(/[-_.]/);
  for (const part of parts) {
    if (COMPONENT.includes(part)) return 'component';
    if (SEMANTIC.includes(part)) return 'semantic';
  }
  return 'primitive';
}

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
  breakpoint: {
    label: 'Breakpoint Tokens',
    example: 'Use `var(--breakpoint-md)` or media queries for responsive design.',
  },
  layout: {
    label: 'Layout Tokens',
    example: 'Use `var(--container-max-width)` for container widths.',
  },
  zindex: {
    label: 'Z-Index Tokens',
    example: 'Use `var(--z-modal)` for stacking order.',
  },
  a11y: {
    label: 'Accessibility Tokens',
    example: 'Use focus-visible styles and prefers-reduced-motion.',
  },
};

// ---------------------------------------------------------------------------
// Project-specific design rules (generated from extracted tokens/components)
// ---------------------------------------------------------------------------

/**
 * Generate project-specific design rules from extracted tokens and components.
 * Rules are per-category and only emitted for categories that have data.
 * Designed to be appended to the style profile (~400-600 tokens).
 */
export function buildProjectDesignRules(
  tokens: DesignTokenRow[],
  components?: DesignComponentRow[],
): string {
  if (tokens.length === 0 && (!components || components.length === 0)) {
    return '';
  }

  if (tokens.length < 10 && (!components || components.length === 0)) {
    return 'Project has limited design tokens. Prefer existing tokens; avoid introducing new values.';
  }

  const grouped = new Map<TokenCategory, DesignTokenRow[]>();
  for (const t of tokens) {
    const list = grouped.get(t.category) ?? [];
    list.push(t);
    grouped.set(t.category, list);
  }

  const rules: string[] = [];

  // Colors
  const colors = grouped.get('color');
  if (colors && colors.length > 0) {
    rules.push('**Colors**');
    const temp = detectPaletteTemperature(colors);
    rules.push(`- Palette temperature: ${temp}`);

    const ramps = colors.filter(
      (c) => c.metadata?.ramp === true && typeof c.metadata?.step === 'number',
    );
    if (ramps.length > 0) {
      const rampGroups = new Map<string, DesignTokenRow[]>();
      for (const r of ramps) {
        const parent = (r.metadata?.rampName as string) ?? r.name.replace(/-\d+$/, '');
        const list = rampGroups.get(parent) ?? [];
        list.push(r);
        rampGroups.set(parent, list);
      }
      for (const [name, steps] of rampGroups) {
        const stepNums = steps
          .map((s) => s.metadata?.step as number)
          .sort((a, b) => a - b);
        rules.push(
          `- Ramp \`${name}\`: steps ${stepNums.join(', ')}. Use low steps for backgrounds, high for text.`,
        );
      }
    }

    if (colors.length < 5) {
      rules.push('- Limited palette. Do not introduce new colors without consolidating.');
    }
  }

  // Typography
  const typo = grouped.get('typography');
  if (typo && typo.length > 0) {
    rules.push('**Typography**');
    const fonts = typo.filter(
      (t) => t.name.includes('font') && !t.name.includes('size'),
    );
    const sizes = typo.filter((t) => t.name.includes('size'));

    if (fonts.length > 0) {
      rules.push(
        `- Fonts: ${fonts.map((f) => `\`${f.name}: ${f.value}\``).join(', ')}`,
      );
      rules.push('- Do not introduce new typefaces.');
    }
    if (sizes.length > 0) {
      const fontSizeNums = sizes
        .map((t) => extractNumericValue(t.value))
        .filter((n): n is number => n !== null && n > 0);
      const typoScale = detectTypographicScale(fontSizeNums);
      if (typoScale) {
        rules.push(
          `- Typographic scale: base ${typoScale.baseSize}px, ratio ${typoScale.ratio}. Use scale values only.`,
        );
      } else {
        rules.push('- Use the defined font-size scale. Max 3 font-size levels per section.');
      }
    }
  }

  // Spacing
  const spacing = grouped.get('spacing');
  if (spacing && spacing.length > 0) {
    rules.push('**Spacing**');
    const scale = detectSpacingScale(spacing);
    if (scale) {
      rules.push(`- Spacing scale: base ${scale}px. Use scale values only.`);
    } else {
      rules.push('- Use existing spacing tokens. Do not hardcode pixel values.');
    }
  }

  // Animation
  const animation = grouped.get('animation');
  if (animation && animation.length > 0) {
    rules.push('**Animation**');
    rules.push('- Use defined transition/duration tokens for all animations.');
  }

  // Borders / Shadows
  const borders = grouped.get('border');
  if (borders && borders.length > 0) {
    rules.push('**Borders**');
    rules.push('- Use existing border-radius and border tokens.');
  }

  const shadows = grouped.get('shadow');
  if (shadows && shadows.length > 0) {
    rules.push('**Shadows**');
    rules.push('- Use existing shadow tokens. No heavy box-shadow additions.');
  }

  // Buttons (from components)
  if (components && components.length > 0) {
    const buttons = components.filter(
      (c) =>
        c.name.toLowerCase().includes('button') ||
        c.name.toLowerCase().includes('btn') ||
        c.name.toLowerCase().includes('cta'),
    );
    if (buttons.length > 0) {
      rules.push('**Buttons**');
      const variants = buttons.flatMap((b) => b.variants).filter(Boolean);
      const baseClass = buttons[0]?.name ?? 'button';
      if (variants.length > 0) {
        rules.push(
          `- Button system: \`${baseClass}\` with variants: ${variants.join(', ')}. Do not add new button classes.`,
        );
      } else {
        rules.push(
          `- Button component: \`${baseClass}\`. Reuse existing button patterns.`,
        );
      }
    }
  }

  return rules.join('\n');
}

/**
 * Fetch tokens + components for a project and build design rules.
 * Convenience wrapper used by the style profile builder and API routes.
 */
export async function getProjectDesignRules(
  projectId: string,
): Promise<{ rules: string; tokens: DesignTokenRow[]; components: DesignComponentRow[] }> {
  let tokens: DesignTokenRow[] = [];
  let components: DesignComponentRow[] = [];

  try {
    tokens = await listByProject(projectId);
  } catch (err) {
    console.warn('[ContextProvider] Token fetch failed:', err);
  }

  try {
    components = await listComponentsByProject(projectId);
  } catch (err) {
    console.warn('[ContextProvider] Component fetch failed:', err);
  }

  const rules = buildProjectDesignRules(tokens, components);
  return { rules, tokens, components };
}

// ---------------------------------------------------------------------------
// Rule generation helpers
// ---------------------------------------------------------------------------

function detectPaletteTemperature(colors: DesignTokenRow[]): string {
  let warm = 0;
  let cool = 0;

  for (const c of colors) {
    const val = c.value.toLowerCase();
    const hue = parseHue(val);
    if (hue === null) continue;

    // Warm: reds, oranges, yellows (0-60, 300-360)
    // Cool: greens, blues, purples (120-270)
    if ((hue >= 0 && hue <= 60) || hue >= 300) warm++;
    else if (hue >= 120 && hue <= 270) cool++;
  }

  if (warm === 0 && cool === 0) return 'neutral';
  if (warm > cool * 1.5) return 'warm';
  if (cool > warm * 1.5) return 'cool';
  return 'neutral';
}

function parseHue(cssColor: string): number | null {
  // oklch(L C H) or hsl(H, S%, L%)
  const oklch = cssColor.match(/oklch\(\s*[\d.]+%?\s+[\d.]+\s+([\d.]+)/);
  if (oklch) return parseFloat(oklch[1]);

  const hsl = cssColor.match(/hsl\(\s*([\d.]+)/);
  if (hsl) return parseFloat(hsl[1]);

  // Hex → approximate hue via simple RGB conversion
  const hex = cssColor.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const r = parseInt(hex[1].substring(0, 2), 16) / 255;
    const g = parseInt(hex[1].substring(2, 4), 16) / 255;
    const b = parseInt(hex[1].substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (d < 0.01) return null; // achromatic
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
    return h;
  }

  return null;
}

function detectSpacingScale(spacing: DesignTokenRow[]): number | null {
  const nums = spacing
    .map((s) => parseFloat(s.value))
    .filter((n) => !isNaN(n) && n > 0)
    .sort((a, b) => a - b);

  if (nums.length < 3) return null;

  // Check for common base-N scales (4, 8)
  for (const base of [4, 8]) {
    const allMatch = nums.every((n) => n % base === 0);
    if (allMatch) return base;
  }

  return null;
}

/** Token priority tiers for smart truncation. P0 = highest. */
const TOKEN_PRIORITY: Record<string, number> = {
  // P0: Brand colors
  primary: 0,
  secondary: 0,
  accent: 0,
  'text': 0,
  'background': 0,
  'color-primary': 0,
  'color-secondary': 0,
  'color-accent': 0,
  'color-text': 0,
  'color-background': 0,
  // P1: Button system (handled separately in formatButtonSystemContext)
  // P2: Typography + key spacing
  'font-heading': 2,
  'font-body': 2,
  'font-size-base': 2,
  'spacing-md': 2,
  'spacing-sm': 2,
  'spacing-lg': 2,
  // P3: Animation defaults
  'animation-duration': 3,
  'transition-duration': 3,
};

function tokenPriority(t: DesignTokenRow, forceInclude?: Set<string>): number {
  const name = t.name.toLowerCase();
  if (forceInclude?.has(name)) return -1;
  for (const [key, p] of Object.entries(TOKEN_PRIORITY)) {
    if (name.includes(key)) return p;
  }
  if (t.category === 'color') return 0;
  if (t.category === 'typography' || t.category === 'spacing') return 2;
  if (t.category === 'animation') return 3;
  return 4;
}

const TRUNCATION_NOTICE =
  '\n\n*(Design context truncated. Use `get_design_tokens` tool for full list or ramp details.)*';

/** ~4 chars per token for LLM budget. */
function charsToTokens(chars: number): number {
  return Math.floor(chars / 4);
}

function formatTokenContext(
  tokens: DesignTokenRow[],
  options?: { maxTokens?: number; forceIncludeTokenNames?: Set<string> },
): string {
  const maxTokens = options?.maxTokens;
  const forceInclude = options?.forceIncludeTokenNames;
  const COMPACT_THRESHOLD = 40;

  // Phase 7b: Compact summary when token count exceeds 40 and no maxTokens
  if (!maxTokens && tokens.length > COMPACT_THRESHOLD) {
    return formatCompactTokenSummary(tokens, forceInclude);
  }

  // Group by tier first, then by category within each tier
  const byTier = new Map<TokenTier, Map<TokenCategory, DesignTokenRow[]>>();
  const orderedTiers: TokenTier[] = ['primitive', 'semantic', 'component'];
  for (const t of tokens) {
    const tier = (t.metadata?.tier as TokenTier) ?? inferTierFromName(t.name);
    if (!byTier.has(tier)) byTier.set(tier, new Map());
    const catMap = byTier.get(tier)!;
    const list = catMap.get(t.category) ?? [];
    list.push(t);
    catMap.set(t.category, list);
  }

  const orderedCategories: TokenCategory[] = [
    'color',
    'typography',
    'spacing',
    'border',
    'shadow',
    'animation',
    'breakpoint',
    'layout',
    'zindex',
    'a11y',
  ];

  const sections: string[] = ['## Design System Tokens\n'];
  let budgetUsed = 0;

  for (const tier of orderedTiers) {
    const catMap = byTier.get(tier);
    if (!catMap || catMap.size === 0) continue;

    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
    sections.push(`### ${tierLabel} Tokens\n`);
    budgetUsed += charsToTokens(tierLabel.length + 15);

    for (const category of orderedCategories) {
      const catTokens = catMap.get(category);
      if (!catTokens || catTokens.length === 0) continue;

      const meta = CATEGORY_META[category];
      const header = `#### ${meta.label}\n${meta.example}\n\n`;
      if (maxTokens && budgetUsed + charsToTokens(header.length) > maxTokens) break;
      sections.push(header);
      budgetUsed += charsToTokens(header.length);

      const sorted = [...catTokens].sort(
        (a, b) => tokenPriority(a, forceInclude) - tokenPriority(b, forceInclude),
      );
      for (const t of sorted) {
        const line = `- \`--${t.name}: ${t.value};\`${t.description ? ` — ${t.description}` : ''}\n`;
        if (maxTokens && budgetUsed + charsToTokens(line.length) > maxTokens) {
          sections.push(TRUNCATION_NOTICE);
          return sections.join('');
        }
        sections.push(line);
        budgetUsed += charsToTokens(line.length);
      }
      sections.push('');
    }
  }

  // Convention rules
  const rules =
    '### Convention Rules\n' +
    '- CSS: Always use `var(--token-name)` instead of hardcoded values.\n' +
    '- Liquid: Use `{{ settings.token_name }}` for theme setting values.\n' +
    '- JavaScript: Reference CSS variables via `getComputedStyle` or CSS classes.\n' +
    '- Never hardcode color hex values, font stacks, or spacing pixel values.\n';
  if (maxTokens && budgetUsed + charsToTokens(rules.length) > maxTokens) {
    sections.push(TRUNCATION_NOTICE);
    return sections.join('');
  }
  sections.push(rules);

  return sections.join('');
}

function formatCompactTokenSummary(tokens: DesignTokenRow[], forceInclude?: Set<string>): string {
  const grouped = new Map<TokenCategory, DesignTokenRow[]>();
  for (const t of tokens) {
    const list = grouped.get(t.category) ?? [];
    list.push(t);
    grouped.set(t.category, list);
  }

  const lines: string[] = [
    '## Design System Tokens (summary)',
    '',
    '### Brand Colors',
    ...(grouped.get('color') ?? [])
      .filter((c) => {
        const n = c.name.toLowerCase();
        return (
          n.includes('primary') ||
          n.includes('secondary') ||
          n.includes('accent') ||
          n.includes('text') ||
          n.includes('background')
        );
      })
      .slice(0, 8)
      .map((c) => `- \`--${c.name}: ${c.value}\``),
    '',
    '### Typography',
  ];
  const typo = grouped.get('typography') ?? [];
  const fonts = typo.filter((t) => t.name.includes('font') && !t.name.includes('size'));
  const sizes = typo.filter((t) => t.name.includes('size'));
  if (fonts.length) lines.push(`- Fonts: ${fonts.map((f) => f.value).join(', ')}`);
  if (sizes.length) lines.push(`- Base size: ${sizes[0]?.value ?? '—'}`);
  lines.push('');

  const spacing = grouped.get('spacing') ?? [];
  if (spacing.length) {
    lines.push('### Spacing (core scale)');
    const scale = detectSpacingScale(spacing);
    lines.push(`- ${scale ? `Base ${scale}px` : 'Use existing tokens'}`);
    lines.push('');
  }

  const anim = grouped.get('animation') ?? [];
  if (anim.length) {
    lines.push('### Animation defaults');
    lines.push('- Use defined transition/duration tokens.');
    lines.push('');
  }

  if (forceInclude && forceInclude.size > 0) {
    const driftTokens = tokens.filter((t) => forceInclude.has(t.name.toLowerCase()));
    if (driftTokens.length > 0) {
      lines.push('### Prioritized (frequently hardcoded — use these)');
      for (const t of driftTokens.slice(0, 8)) {
        lines.push(`- \`--${t.name}: ${t.value}\``);
      }
      lines.push('');
    }
  }

  lines.push('### Convention Rules');
  lines.push('- CSS: `var(--token-name)`. Liquid: `{{ settings.token_name }}`.');
  lines.push('- Never hardcode colors, fonts, or spacing.');
  lines.push('');
  lines.push(
    '**For full token list or ramp details: use `get_design_tokens` tool.**',
  );
  return lines.join('\n');
}

function formatColorSchemesContext(tokens: DesignTokenRow[]): string {
  const schemeTokens = tokens.filter(
    (t) => t.metadata?.scheme && t.metadata?.role && t.category === 'color',
  );
  if (schemeTokens.length === 0) return '';

  const byScheme = new Map<string, DesignTokenRow[]>();
  for (const t of schemeTokens) {
    const scheme = String(t.metadata!.scheme);
    const list = byScheme.get(scheme) ?? [];
    list.push(t);
    byScheme.set(scheme, list);
  }

  const lines: string[] = ['### Color Schemes', ''];
  for (const [scheme, items] of byScheme) {
    const roleValues = items
      .map((t) => `${String(t.metadata!.role)}: ${t.value}`)
      .join(', ');
    lines.push(`- **${scheme}**: ${roleValues}`);
  }
  lines.push('');
  lines.push('Use existing color scheme values. Do not introduce new scheme colors.');
  return lines.join('\n');
}

function formatButtonSystemContext(components: DesignComponentRow[]): string {
  const buttons = components.filter(
    (c) =>
      c.name.toLowerCase().includes('button') ||
      c.name.toLowerCase().includes('btn') ||
      c.name.toLowerCase().includes('cta'),
  );
  if (buttons.length === 0) return '';

  const lines: string[] = ['### Button System', ''];

  for (const btn of buttons) {
    lines.push(`**${btn.name}** (${btn.file_path})`);
    if (btn.variants && btn.variants.length > 0) {
      lines.push(`- Variants: ${btn.variants.join(', ')}`);
    }
    const tokenSet = btn.preview_data?.buttonTokenSet as Record<string, Record<string, string>> | undefined;
    if (tokenSet && typeof tokenSet === 'object') {
      for (const [variant, tokens] of Object.entries(tokenSet)) {
        if (tokens && typeof tokens === 'object') {
          const parts = Object.entries(tokens)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}: ${v}`);
          if (parts.length > 0) {
            lines.push(`- \`${variant}\`: ${parts.join(', ')}`);
          }
        }
      }
    }
    lines.push('');
  }

  lines.push('Use existing button classes and variants. Do not introduce new button styles.');
  return lines.join('\n');
}

/** Format schema conventions for agent context (Phase 10d). */
async function formatSchemaConventionsContext(projectId: string): Promise<string> {
  const sectionFiles = await fetchSectionFiles(projectId);
  if (sectionFiles.length === 0) return '';
  const conventions = analyzeSchemaConventions(sectionFiles);
  const settingEntries = Object.entries(conventions.settingIds);
  const blockTypes = conventions.blockTypes;
  if (settingEntries.length === 0 && blockTypes.length === 0) return '';

  const lines: string[] = ['### Schema Conventions', ''];
  if (settingEntries.length > 0) {
    const settingStr = settingEntries
      .slice(0, 12)
      .map(([id, type]) => `${id} (${type})`)
      .join(', ');
    lines.push(`Standard settings: ${settingStr}`);
  }
  if (blockTypes.length > 0) {
    lines.push(`Standard block types: ${blockTypes.slice(0, 10).join(', ')}`);
  }
  return lines.join('\n');
}

/** Format icon catalog for agent context (Phase 10c). */
function formatIconContext(components: DesignComponentRow[]): string {
  const icons: string[] = [];
  for (const c of components) {
    const meta = c.preview_data?.iconMetadata as
      | { name: string; viewBox?: string; fillPattern?: string }
      | undefined;
    if (meta?.name) icons.push(meta.name);
  }
  if (icons.length === 0) return '';
  const unique = [...new Set(icons)].sort();
  return (
    '### Available Icons\n' +
    `Available icons: ${unique.join(', ')}. Use \`{% render 'icon-NAME' %}\` to include.\n`
  );
}
