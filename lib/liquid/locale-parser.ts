/**
 * Parses and flattens Shopify locale JSON files (e.g. locales/en.default.json)
 * into a flat list of dot-notation key paths for translation completions.
 */

export interface LocaleEntry {
  key: string;
  value: string;
}

/**
 * Recursively flattens a nested locale object into dot-notation LocaleEntry list.
 * Arrays are skipped (Shopify locales don't use array values).
 */
export function flattenLocaleObject(
  obj: Record<string, unknown>,
  prefix = ''
): LocaleEntry[] {
  const entries: LocaleEntry[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      continue;
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      entries.push(...flattenLocaleObject(value as Record<string, unknown>, fullKey));
    } else {
      entries.push({ key: fullKey, value: String(value) });
    }
  }

  return entries;
}

/**
 * Parses raw locale JSON text and returns flattened LocaleEntry list.
 * Returns empty array for empty JSON, invalid JSON, or non-object roots.
 */
export function parseLocaleJSON(json: string): LocaleEntry[] {
  if (!json || json.trim() === '') {
    return [];
  }

  try {
    const parsed = JSON.parse(json);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return [];
    }
    return flattenLocaleObject(parsed as Record<string, unknown>);
  } catch {
    return [];
  }
}
