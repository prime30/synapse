import { APIError } from '@/lib/errors/handler';

export interface ShopifyTheme {
  id: number;
  name: string;
  role: 'main' | 'unpublished' | 'demo' | 'development';
  created_at: string;
  updated_at: string;
}

export interface ShopifyAsset {
  key: string; // e.g. "templates/product.liquid"
  value?: string; // file content (text files)
  content_type: string;
  size: number;
  created_at: string;
  updated_at: string;
}

interface ShopifyThemesResponse {
  themes: ShopifyTheme[];
}

interface ShopifyThemeResponse {
  theme: ShopifyTheme;
}

interface ShopifyAssetsResponse {
  assets: ShopifyAsset[];
}

interface ShopifyAssetResponse {
  asset: ShopifyAsset;
}

export class ShopifyAdminAPI {
  private storeDomain: string;
  private accessToken: string;
  private readonly apiVersion = '2024-01';

  constructor(storeDomain: string, accessToken: string) {
    this.storeDomain = storeDomain;
    this.accessToken = accessToken;
  }

  /**
   * Build the API URL for a given path.
   * Returns: https://{storeDomain}/admin/api/2024-01/{path}.json
   */
  private apiUrl(path: string): string {
    // Ensure storeDomain doesn't have protocol
    const cleanDomain = this.storeDomain.replace(/^https?:\/\//, '');
    return `https://${cleanDomain}/admin/api/${this.apiVersion}/${path}.json`;
  }

  /**
   * Make an authenticated request to the Shopify Admin API.
   * Handles rate limiting (retry-after header) and errors (4xx, 5xx).
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = this.apiUrl(path);
    const headers: HeadersInit = {
      'X-Shopify-Access-Token': this.accessToken,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      throw new APIError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR',
        500
      );
    }

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : 2;
      
      // Wait for the retry period
      await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1000));
      
      // Retry the request once
      try {
        response = await fetch(url, options);
      } catch (error) {
        throw new APIError(
          `Network error on retry: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'NETWORK_ERROR',
          500
        );
      }
    }

    // Handle errors
    if (!response.ok) {
      let errorMessage = `Shopify API error: ${response.status} ${response.statusText}`;
      let errorCode = 'SHOPIFY_API_ERROR';

      try {
        const errorData = await response.json();
        if (errorData.errors) {
          errorMessage = Array.isArray(errorData.errors)
            ? errorData.errors.join(', ')
            : typeof errorData.errors === 'object'
            ? JSON.stringify(errorData.errors)
            : String(errorData.errors);
        } else if (errorData.error) {
          errorMessage = String(errorData.error);
        }
      } catch {
        // If JSON parsing fails, use the default error message
      }

      // Map HTTP status codes to appropriate error codes
      if (response.status === 401) {
        errorCode = 'UNAUTHORIZED';
        throw APIError.unauthorized(errorMessage, errorCode);
      } else if (response.status === 403) {
        errorCode = 'FORBIDDEN';
        throw APIError.forbidden(errorMessage, errorCode);
      } else if (response.status === 404) {
        errorCode = 'NOT_FOUND';
        throw APIError.notFound(errorMessage, errorCode);
      } else if (response.status === 429) {
        errorCode = 'RATE_LIMITED';
        throw APIError.tooManyRequests(errorMessage, errorCode);
      } else if (response.status >= 400 && response.status < 500) {
        errorCode = 'CLIENT_ERROR';
        throw new APIError(errorMessage, errorCode, response.status);
      } else {
        errorCode = 'SERVER_ERROR';
        throw new APIError(errorMessage, errorCode, response.status);
      }
    }

    // Parse response
    try {
      const data = await response.json();
      return data as T;
    } catch (error) {
      throw new APIError(
        `Failed to parse response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PARSE_ERROR',
        500
      );
    }
  }

  /**
   * List all themes for the store.
   * GET /admin/api/2024-01/themes.json
   */
  async listThemes(): Promise<ShopifyTheme[]> {
    const response = await this.request<ShopifyThemesResponse>(
      'GET',
      'themes'
    );
    return response.themes;
  }

  /**
   * Get a specific theme by ID.
   * GET /admin/api/2024-01/themes/{themeId}.json
   */
  async getTheme(themeId: number): Promise<ShopifyTheme> {
    const response = await this.request<ShopifyThemeResponse>(
      'GET',
      `themes/${themeId}`
    );
    return response.theme;
  }

  /**
   * Create a theme from a public ZIP URL.
   * POST /admin/api/2024-01/themes.json
   * Requires theme src (public URL to theme zip). New theme is unpublished by default.
   */
  async createTheme(
    name: string,
    src: string,
    role: 'unpublished' | 'development' = 'unpublished'
  ): Promise<ShopifyTheme> {
    const response = await this.request<ShopifyThemeResponse>(
      'POST',
      'themes',
      { theme: { name, src, role } }
    );
    return response.theme;
  }

  /**
   * List all assets for a theme.
   * GET /admin/api/2024-01/themes/{themeId}/assets.json
   */
  async listAssets(themeId: number): Promise<ShopifyAsset[]> {
    const response = await this.request<ShopifyAssetsResponse>(
      'GET',
      `themes/${themeId}/assets`
    );
    return response.assets;
  }

  /**
   * Get a specific asset by key.
   * GET /admin/api/2024-01/themes/{themeId}/assets.json?asset[key]={key}
   */
  async getAsset(themeId: number, key: string): Promise<ShopifyAsset> {
    const encodedKey = encodeURIComponent(key);
    const response = await this.request<ShopifyAssetResponse>(
      'GET',
      `themes/${themeId}/assets?asset[key]=${encodedKey}`
    );
    return response.asset;
  }

  /**
   * Create or update an asset.
   * PUT /admin/api/2024-01/themes/{themeId}/assets.json
   * Body: { asset: { key, value } }
   */
  async putAsset(
    themeId: number,
    key: string,
    value: string
  ): Promise<ShopifyAsset> {
    const response = await this.request<ShopifyAssetResponse>(
      'PUT',
      `themes/${themeId}/assets`,
      {
        asset: {
          key,
          value,
        },
      }
    );
    return response.asset;
  }

  /**
   * Delete an asset.
   * DELETE /admin/api/2024-01/themes/{themeId}/assets.json?asset[key]={key}
   */
  async deleteAsset(themeId: number, key: string): Promise<void> {
    const encodedKey = encodeURIComponent(key);
    await this.request<void>(
      'DELETE',
      `themes/${themeId}/assets?asset[key]=${encodedKey}`
    );
  }
}
