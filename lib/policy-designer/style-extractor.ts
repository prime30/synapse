import type { ThemeStyles } from './types';

const DEFAULT_STYLES: ThemeStyles = {
  primaryColor: '#1a1a1a',
  secondaryColor: '#666666',
  accentColor: '#0066cc',
  bodyFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  headingFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  backgroundColor: '#ffffff',
  textColor: '#444444',
};

/**
 * Parse the design-token context markdown (from DesignSystemContextProvider)
 * and extract colors and fonts into a ThemeStyles object.
 *
 * The context format uses lines like:
 *   - `--color-primary: #1a1a1a;` — Primary brand color
 *   - `--font-heading: "Playfair Display", serif;`
 */
export function extractThemeStyles(designTokens: string): ThemeStyles {
  if (!designTokens) return getDefaultStyles();

  const styles = getDefaultStyles();

  const lines = designTokens.split('\n');
  for (const line of lines) {
    const tokenMatch = line.match(/`--([^:]+):\s*([^;`]+);?`/);
    if (!tokenMatch) continue;

    const [, name, value] = tokenMatch;
    const trimmedValue = value.trim();

    if (matchesTokenName(name, ['color-primary', 'color-brand', 'color-heading'])) {
      styles.primaryColor = trimmedValue;
    } else if (matchesTokenName(name, ['color-secondary'])) {
      styles.secondaryColor = trimmedValue;
    } else if (matchesTokenName(name, ['color-accent', 'color-link', 'color-interactive'])) {
      styles.accentColor = trimmedValue;
    } else if (matchesTokenName(name, ['color-background', 'color-bg', 'color-page-bg'])) {
      styles.backgroundColor = trimmedValue;
    } else if (matchesTokenName(name, ['color-text', 'color-body', 'color-body-text'])) {
      styles.textColor = trimmedValue;
    } else if (matchesTokenName(name, ['font-body', 'font-base'])) {
      styles.bodyFont = trimmedValue;
    } else if (matchesTokenName(name, ['font-heading', 'font-display'])) {
      styles.headingFont = trimmedValue;
    }
  }

  return styles;
}

function matchesTokenName(name: string, candidates: string[]): boolean {
  const normalized = name.toLowerCase();
  return candidates.some((c) => normalized === c || normalized.endsWith(`-${c.split('-').pop()}`));
}

export function getDefaultStyles(): ThemeStyles {
  return { ...DEFAULT_STYLES };
}
