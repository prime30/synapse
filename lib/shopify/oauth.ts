import crypto from 'crypto';

import type { ShopifyOAuthParams } from '@/lib/types/shopify';
import { APIError } from '@/lib/errors/handler';

export interface ShopifyOAuthConfig {
  apiKey: string;
  apiSecret: string;
  scopes: string[];
  redirectUri: string;
}

export class ShopifyOAuthService {
  private config: ShopifyOAuthConfig;

  constructor() {
    this.config = {
      apiKey: process.env.SHOPIFY_API_KEY ?? '',
      apiSecret: process.env.SHOPIFY_API_SECRET ?? '',
      scopes: ['read_themes', 'write_themes'],
      redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/shopify/callback`,
    };
  }

  /**
   * Build the Shopify OAuth install/authorize URL.
   */
  getInstallUrl(shop: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.apiKey,
      scope: this.config.scopes.join(','),
      redirect_uri: this.config.redirectUri,
      state,
    });
    return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange the temporary authorization code for a permanent access token.
   * POST https://{shop}/admin/oauth/access_token
   */
  async exchangeCodeForToken(shop: string, code: string): Promise<string> {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.config.apiKey,
        client_secret: this.config.apiSecret,
        code,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new APIError(
        `Failed to exchange code for token: ${body}`,
        'OAUTH_TOKEN_EXCHANGE_FAILED',
        response.status
      );
    }

    const data = (await response.json()) as { access_token: string };
    return data.access_token;
  }

  /**
   * Verify the HMAC signature from a Shopify OAuth callback.
   * Uses crypto.timingSafeEqual for constant-time comparison.
   */
  validateHmac(params: ShopifyOAuthParams): boolean {
    const { hmac, ...rest } = params;
    const message = Object.keys(rest)
      .sort()
      .map((key) => `${key}=${rest[key as keyof typeof rest]}`)
      .join('&');

    const generatedHmac = crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(message)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(hmac),
        Buffer.from(generatedHmac)
      );
    } catch {
      // Buffers with different lengths throw — treat as invalid
      return false;
    }
  }

  /**
   * Generate a cryptographically random state string for CSRF protection.
   */
  generateState(): string {
    return crypto.randomBytes(16).toString('hex');
  }
}
