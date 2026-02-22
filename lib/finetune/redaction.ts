/**
 * Deterministic data sanitization pipeline for training data.
 *
 * Redacts:
 *   - API keys and tokens (Shopify, Supabase, Anthropic, OpenAI, etc.)
 *   - Email addresses and URLs with credentials
 *   - Store-specific identifiers (myshopify.com domains, store names)
 *   - IP addresses
 *   - File paths containing user home directories
 *
 * Normalization:
 *   - Replaces store names with canonical placeholders
 *   - Normalizes file paths to Unix-style
 *   - Strips ANSI color codes from terminal output
 */

import { createHash } from 'node:crypto';

// ── Redaction Patterns ───────────────────────────────────────────────────────

interface RedactionRule {
  id: string;
  pattern: RegExp;
  replacement: string | ((match: string) => string);
}

const RULES: RedactionRule[] = [
  {
    id: 'shopify_api_key',
    pattern: /shpat_[a-f0-9]{32,}/gi,
    replacement: 'shpat_REDACTED',
  },
  {
    id: 'shopify_secret',
    pattern: /shpss_[a-f0-9]{32,}/gi,
    replacement: 'shpss_REDACTED',
  },
  {
    id: 'anthropic_key',
    pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/g,
    replacement: 'sk-ant-REDACTED',
  },
  {
    id: 'openai_key',
    pattern: /sk-[a-zA-Z0-9]{20,}/g,
    replacement: 'sk-REDACTED',
  },
  {
    id: 'google_key',
    pattern: /AIza[a-zA-Z0-9_-]{35}/g,
    replacement: 'GOOGLE_API_KEY_REDACTED',
  },
  {
    id: 'supabase_key',
    pattern: /eyJ[a-zA-Z0-9_-]{100,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    replacement: 'SUPABASE_JWT_REDACTED',
  },
  {
    id: 'generic_bearer',
    pattern: /Bearer\s+[a-zA-Z0-9_.-]{20,}/gi,
    replacement: 'Bearer REDACTED',
  },
  {
    id: 'email',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: 'user@example.com',
  },
  {
    id: 'ip_address',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: '0.0.0.0',
  },
  {
    id: 'myshopify_domain',
    pattern: /[a-zA-Z0-9-]+\.myshopify\.com/g,
    replacement: 'example-store.myshopify.com',
  },
  {
    id: 'shopify_admin_url',
    pattern: /https:\/\/[a-zA-Z0-9-]+\.myshopify\.com\/admin[^\s]*/g,
    replacement: 'https://example-store.myshopify.com/admin/REDACTED',
  },
  {
    id: 'url_with_credentials',
    pattern: /https?:\/\/[^:]+:[^@]+@[^\s]+/g,
    replacement: 'https://REDACTED:REDACTED@example.com',
  },
  {
    id: 'windows_home',
    pattern: /C:\\Users\\[a-zA-Z0-9._-]+/gi,
    replacement: 'C:\\Users\\user',
  },
  {
    id: 'unix_home',
    pattern: /\/home\/[a-zA-Z0-9._-]+/g,
    replacement: '/home/user',
  },
  {
    id: 'mac_home',
    pattern: /\/Users\/[a-zA-Z0-9._-]+/g,
    replacement: '/Users/user',
  },
  {
    id: 'uuid',
    pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    replacement: (match: string) => {
      const hash = createHash('sha256').update(match).digest('hex').slice(0, 12);
      return `00000000-0000-0000-0000-${hash}`;
    },
  },
  {
    id: 'ansi_codes',
    pattern: /\x1B\[[0-9;]*[a-zA-Z]/g,
    replacement: '',
  },
];

// ── Public API ───────────────────────────────────────────────────────────────

export interface RedactionResult {
  text: string;
  rulesApplied: string[];
  redactionCount: number;
}

/**
 * Apply all redaction rules to input text.
 * Deterministic: same input always produces same output.
 */
export function redactText(input: string): RedactionResult {
  let text = input;
  const rulesApplied: string[] = [];
  let redactionCount = 0;

  for (const rule of RULES) {
    const matches = text.match(rule.pattern);
    if (matches && matches.length > 0) {
      rulesApplied.push(rule.id);
      redactionCount += matches.length;
      if (typeof rule.replacement === 'string') {
        text = text.replace(rule.pattern, rule.replacement);
      } else {
        text = text.replace(rule.pattern, rule.replacement);
      }
    }
  }

  return { text, rulesApplied, redactionCount };
}

/**
 * Normalize file paths to Unix-style for consistency.
 */
export function normalizePaths(input: string): string {
  return input.replace(/\\/g, '/');
}

/**
 * Full sanitization pipeline: redact, normalize, and strip.
 */
export function sanitize(input: string): RedactionResult {
  const result = redactText(input);
  result.text = normalizePaths(result.text);
  return result;
}

/**
 * Generate a content fingerprint for deduplication.
 */
export function contentFingerprint(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}
