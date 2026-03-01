/**
 * Phase 9b: Shopify Color Scheme Parser
 *
 * Parses settings_data.json for color_schemes structure.
 * Extracts color sets per scheme, detects light/dark relationships,
 * and returns scheme data for the ingestion pipeline.
 */

export interface ColorSchemeSettings {
  background?: string;
  text?: string;
  button?: string;
  accent?: string;
  [key: string]: string | undefined;
}

export interface ParsedColorScheme {
  id: string;
  name: string;
  settings: ColorSchemeSettings;
  /** When detected: this scheme is the dark variant of the referenced scheme. */
  darkVariantOf?: string;
}

export interface ParsedColorSchemeData {
  schemes: ParsedColorScheme[];
  /** Map of scheme id -> role -> color value for token metadata. */
  schemeTokens: Array<{
    scheme: string;
    role: string;
    value: string;
    metadata: { scheme: string; role: string };
  }>;
}

/**
 * Parse settings_data.json for color_schemes structure.
 * Expects: { current: { color_schemes: { scheme1: { settings: { ... } }, ... } } }
 */
export function parseColorSchemes(content: string): ParsedColorSchemeData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  const current = (parsed as Record<string, unknown>)?.current;
  if (!current || typeof current !== 'object') return null;

  const colorSchemes = (current as Record<string, unknown>)?.color_schemes as Record<string, unknown> | null | undefined;
  if (!colorSchemes || typeof colorSchemes !== 'object') return null;

  const schemes: ParsedColorScheme[] = [];
  const schemeTokens: ParsedColorSchemeData['schemeTokens'] = [];

  const schemeIds = Object.keys(colorSchemes);
  const darkKeywords = ['dark', 'night', 'black'];

  for (const id of schemeIds) {
    const scheme = colorSchemes[id] as Record<string, unknown> | undefined;
    if (!scheme || typeof scheme !== 'object') continue;

    const settings = scheme.settings as Record<string, string> | undefined;
    if (!settings || typeof settings !== 'object') continue;

    const colorSettings: ColorSchemeSettings = {};
    for (const [key, val] of Object.entries(settings)) {
      if (typeof val === 'string' && /^#|^rgb|^hsl/.test(val.trim())) {
        colorSettings[key] = val.trim();
        schemeTokens.push({
          scheme: id,
          role: key,
          value: val.trim(),
          metadata: { scheme: id, role: key },
        });
      }
    }

    if (Object.keys(colorSettings).length === 0) continue;

    const name = id.replace(/[-_]/g, ' ');
    const parsedScheme: ParsedColorScheme = { id, name, settings: colorSettings };

    // Detect dark variant: scheme name contains dark/night/black, or id ends with -dark
    const idLower = id.toLowerCase();
    if (darkKeywords.some((k) => idLower.includes(k))) {
      // Try to find a light counterpart (e.g. dawn-dark -> dawn)
      const possibleLight = schemeIds.find((other) => {
        if (other === id) return false;
        const oLower = other.toLowerCase();
        return (
          idLower.startsWith(oLower) ||
          idLower.endsWith('-' + oLower) ||
          oLower.startsWith(idLower.replace(/-(dark|night|black)$/, ''))
        );
      });
      if (possibleLight) parsedScheme.darkVariantOf = possibleLight;
    }

    schemes.push(parsedScheme);
  }

  return { schemes, schemeTokens };
}
