/**
 * Phase 0: Test whether Shopify development themes bypass the session cookie
 * requirement for `preview_theme_id`.
 *
 * Usage:
 *   npx tsx scripts/test-dev-theme-preview.ts
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * (reads Shopify credentials from the first active shopify_connection)
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ── Env ────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── Token decryption (mirrors lib/shopify/token-manager.ts) ───────────

function getEncryptionKey(): Buffer {
  const explicit = process.env.SHOPIFY_ENCRYPTION_KEY;
  if (explicit) return Buffer.from(explicit, 'hex');
  if (SERVICE_ROLE_KEY) {
    return crypto.createHash('sha256').update(SERVICE_ROLE_KEY).digest();
  }
  throw new Error('No encryption key available');
}

function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();
  const colonIndex = encrypted.indexOf(':');
  if (colonIndex === -1) throw new Error('Invalid encrypted token format');
  const iv = Buffer.from(encrypted.slice(0, colonIndex), 'hex');
  const ciphertext = encrypted.slice(colonIndex + 1);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ── Shopify Admin API (minimal subset) ────────────────────────────────

const API_VERSION = '2025-10';
const MARKER = `SYNAPSE_DEV_THEME_TEST_${Date.now()}`;

async function shopifyRequest<T>(
  domain: string,
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const cleanDomain = domain.replace(/^https?:\/\//, '');
  const url = `https://${cleanDomain}/admin/api/${API_VERSION}/${path}.json`;
  const res = await fetch(url, {
    method,
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify ${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('Phase 0: Testing if development themes bypass session cookie requirement\n');

  // 1. Find an active Shopify connection
  const { data: conn, error } = await supabase
    .from('shopify_connections')
    .select('id, store_domain, access_token_encrypted')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (error || !conn) {
    console.error('No active Shopify connection found:', error?.message);
    process.exit(1);
  }

  const storeDomain = conn.store_domain;
  const accessToken = decryptToken(conn.access_token_encrypted);
  console.log(`Store: ${storeDomain}`);

  // 2. Create a development theme
  console.log('Creating development theme...');
  let themeId: number;
  try {
    const { theme } = await shopifyRequest<{ theme: { id: number; role: string } }>(
      storeDomain,
      accessToken,
      'POST',
      'themes',
      { theme: { name: 'synapse-preview-test', role: 'development' } },
    );
    themeId = theme.id;
    console.log(`Created development theme: ${themeId} (role: ${theme.role})`);
  } catch (err) {
    console.error('Failed to create development theme:', err);
    process.exit(1);
  }

  try {
    // 3. Push a marker template
    console.log('Pushing marker template...');
    await shopifyRequest(storeDomain, accessToken, 'PUT', `themes/${themeId}/assets`, {
      asset: {
        key: 'templates/index.liquid',
        value: `<!-- ${MARKER} --><html><body>${MARKER}</body></html>`,
      },
    });

    // Push required theme files so Shopify will serve the preview
    await shopifyRequest(storeDomain, accessToken, 'PUT', `themes/${themeId}/assets`, {
      asset: {
        key: 'layout/theme.liquid',
        value: `<!DOCTYPE html><html><head><meta charset="utf-8">{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>`,
      },
    });

    await shopifyRequest(storeDomain, accessToken, 'PUT', `themes/${themeId}/assets`, {
      asset: {
        key: 'config/settings_schema.json',
        value: JSON.stringify([{
          name: 'theme_info',
          theme_name: 'Synapse Test',
          theme_version: '1.0.0',
          theme_author: 'Synapse',
          theme_documentation_url: 'https://synapse.shop',
          theme_support_url: 'https://synapse.shop',
        }]),
      },
    });

    await shopifyRequest(storeDomain, accessToken, 'PUT', `themes/${themeId}/assets`, {
      asset: {
        key: 'config/settings_data.json',
        value: JSON.stringify({ current: {} }),
      },
    });

    // Wait a few seconds for Shopify to process
    console.log('Waiting 5s for Shopify to process assets...');
    await new Promise((r) => setTimeout(r, 5000));

    // 4. Fetch storefront with preview_theme_id and NO cookies
    const cleanDomain = storeDomain.replace(/^https?:\/\//, '');
    const previewUrl = `https://${cleanDomain}/?preview_theme_id=${themeId}`;
    console.log(`Fetching: ${previewUrl} (no cookies, redirect: follow)`);

    const res = await fetch(previewUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html',
      },
    });

    console.log(`Response: ${res.status} ${res.statusText}`);
    console.log(`Final URL: ${res.url}`);

    const html = await res.text();
    const found = html.includes(MARKER);

    console.log(`\nMarker "${MARKER}" found in response: ${found}`);
    console.log(`Response length: ${html.length} chars`);

    // Also check if preview_theme_id survived in the final URL
    const finalUrlHasPreview = res.url.includes('preview_theme_id');
    console.log(`Final URL has preview_theme_id: ${finalUrlHasPreview}`);

    // Show a snippet around the marker if found
    if (found) {
      const idx = html.indexOf(MARKER);
      console.log(`Context: ...${html.slice(Math.max(0, idx - 50), idx + MARKER.length + 50)}...`);
    } else {
      // Show some of the HTML to help debug
      console.log(`\nFirst 500 chars of response:\n${html.slice(0, 500)}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Development themes bypass session cookie: ${found ? 'YES' : 'NO'}`);
    console.log('='.repeat(60));

    if (!found) {
      // Additional test: try with _ab=0&_fd=0&_sc=1 params
      console.log('\nRetrying with _ab=0&_fd=0&_sc=1 params...');
      const retryUrl = `https://${cleanDomain}/?_ab=0&_fd=0&_sc=1&preview_theme_id=${themeId}`;
      const retryRes = await fetch(retryUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html',
        },
      });
      const retryHtml = await retryRes.text();
      const retryFound = retryHtml.includes(MARKER);
      console.log(`With _sc=1 params — marker found: ${retryFound}`);
      if (retryFound) {
        console.log('\n** Development theme + _sc=1 works! **');
      }
    }
  } finally {
    // 5. Cleanup: delete the test theme
    console.log('\nCleaning up: deleting test theme...');
    try {
      await shopifyRequest(storeDomain, accessToken, 'DELETE', `themes/${themeId}`, undefined);
      console.log('Test theme deleted.');
    } catch (err) {
      console.error('Failed to delete test theme (clean up manually):', err);
    }
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
