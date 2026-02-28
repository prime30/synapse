import crypto from 'crypto';

import { APIError } from '@/lib/errors/handler';

export interface OnlineTokenResponse {
  access_token: string;
  scope?: string;
  expires_in?: number;
  associated_user_scope?: string;
  associated_user?: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    email_verified: boolean;
    account_owner: boolean;
    locale: string;
    collaborator: boolean;
  };
}

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
      scopes: [
        // Phase 1 scopes (no Shopify app review needed)
        'read_themes', 'write_themes',
        'read_content', 'write_content',
        'read_online_store_navigation', 'write_online_store_navigation',
        'read_discounts', 'write_discounts',
        'read_files', 'write_files',
        'read_products',
        'read_inventory',
      ],
      redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/shopify/callback`,
    };
  }

  /** The canonical list of OAuth scopes requested during install. */
  get scopes(): string[] {
    return this.config.scopes;
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
   * Exchange the temporary authorization code for an access token.
   * POST https://{shop}/admin/oauth/access_token
   *
   * For online tokens (grant_options[]=per-user), the response includes
   * `associated_user` and `expires_in` in addition to `access_token`.
   */
  async exchangeCodeForToken(shop: string, code: string): Promise<OnlineTokenResponse> {
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

    const data = await response.json() as OnlineTokenResponse;
    return data;
  }

  /**
   * Verify the HMAC signature from a Shopify OAuth callback.
   * Shopify signs ALL query params except `hmac`, so we must include every
   * parameter (e.g. `host`) — not just a typed subset.
   */
  validateHmac(params: Record<string, string>): boolean {
    const hmac = params.hmac;
    if (!hmac) return false;

    const message = Object.keys(params)
      .filter((k) => k !== 'hmac')
      .sort()
      .map((key) => `${key}=${params[key]}`)
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
