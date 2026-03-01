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
  attachment?: string; // base64-encoded binary content (returned by getAsset for images/fonts)
  public_url?: string; // CDN URL (returned by listAssets for assets/ dir files)
  checksum?: string; // MD5 hash
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

// ── GraphQL response types ────────────────────────────────────────────

export interface GraphQLResponse<T> {
  data: T;
  errors?: Array<{ message: string; locations?: Array<{ line: number; column: number }>; extensions?: { code?: string } }>;
  extensions?: { cost: { requestedQueryCost: number; actualQueryCost: number; throttleStatus: { maximumAvailable: number; currentlyAvailable: number; restoreRate: number } } };
}

// ── Navigation types ──────────────────────────────────────────────────

export interface ShopifyMenu {
  id: string;
  title: string;
  handle: string;
  items: ShopifyMenuItem[];
}

export interface ShopifyMenuItem {
  id: string;
  title: string;
  url: string;
  type: string;
  resource_id?: number | null;
  items?: ShopifyMenuItem[];
}

// ── Page types ────────────────────────────────────────────────────────

export interface ShopifyPage {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  author: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  template_suffix: string | null;
}

// ── Collection types ──────────────────────────────────────────────────

export interface ShopifyCollection {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  image: { src: string; alt: string | null } | null;
  published_at: string | null;
  sort_order: string;
  updated_at: string;
}

// ── Blog types ───────────────────────────────────────────────────────

export interface ShopifyBlog {
  id: number;
  title: string;
  handle: string;
  commentable: string;
  created_at: string;
  updated_at: string;
}

export interface ShopifyArticle {
  id: number;
  title: string;
  handle: string;
  author: string;
  blog_id: number;
  body_html: string;
  image: { src: string; alt: string | null } | null;
  published_at: string | null;
  summary_html: string | null;
  created_at: string;
  updated_at: string;
}

// ── Discount types ────────────────────────────────────────────────────

export interface ShopifyPriceRule {
  id: number;
  title: string;
  value_type: 'fixed_amount' | 'percentage';
  value: string;
  target_type: 'line_item' | 'shipping_line';
  target_selection: 'all' | 'entitled';
  allocation_method: 'across' | 'each';
  starts_at: string;
  ends_at: string | null;
  usage_limit: number | null;
  created_at: string;
  updated_at: string;
}

export interface ShopifyDiscountCode {
  id: number;
  price_rule_id: number;
  code: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

// ── Inventory types ───────────────────────────────────────────────────

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  variants: ShopifyVariant[];
  images: Array<{ id: number; src: string; alt: string | null }>;
  status: 'active' | 'draft' | 'archived';
}

export interface ShopifyVariant {
  id: number;
  title: string;
  sku: string;
  price: string;
  inventory_item_id: number;
  inventory_quantity: number;
}

export interface ShopifyLocation {
  id: number;
  name: string;
  active: boolean;
  address1: string | null;
  city: string | null;
  country: string | null;
}

export interface ShopifyInventoryLevel {
  inventory_item_id: number;
  location_id: number;
  available: number | null;
  updated_at: string;
}

// ── File (CDN) types ──────────────────────────────────────────────────

export interface ShopifyFile {
  id: string;
  alt: string | null;
  createdAt: string;
  fileStatus: 'READY' | 'PROCESSING' | 'FAILED' | 'UPLOADED';
  preview?: { image?: { url: string } };
  url?: string;
  filename?: string;
  mimeType?: string;
}

export class ShopifyAdminAPI {
  private storeDomain: string;
  private accessToken: string;
  private readonly apiVersion = '2025-10';

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
    const [resourcePath, query] = path.split('?');
    const base = `https://${cleanDomain}/admin/api/${this.apiVersion}/${resourcePath}.json`;
    return query ? `${base}?${query}` : base;
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
   * Create a theme, optionally from a public ZIP URL.
   * POST /admin/api/2024-01/themes.json
   * When `src` is provided, the theme is seeded from that ZIP.
   * When `src` is omitted, an empty theme is created (useful for import
   * workflows where files are pushed immediately after creation).
   * New theme is unpublished by default.
   */
  async createTheme(
    name: string,
    src?: string,
    role: 'unpublished' | 'development' = 'unpublished'
  ): Promise<ShopifyTheme> {
    const themePayload: Record<string, unknown> = { name, role };
    if (src) {
      themePayload.src = src;
    }
    const response = await this.request<ShopifyThemeResponse>(
      'POST',
      'themes',
      { theme: themePayload }
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
   * Body: { asset: { key, value } } for text or { asset: { key, attachment } } for binary (base64)
   */
  async putAsset(
    themeId: number,
    key: string,
    value?: string,
    attachment?: string
  ): Promise<ShopifyAsset> {
    const assetBody: Record<string, string> = { key };
    if (attachment) {
      assetBody.attachment = attachment;
    } else if (value) {
      assetBody.value = value;
    }
    const response = await this.request<ShopifyAssetResponse>(
      'PUT',
      `themes/${themeId}/assets`,
      { asset: assetBody }
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

  /**
   * Update a theme (rename, change role, etc.).
   * PUT /admin/api/2024-01/themes/{themeId}.json
   */
  async updateTheme(
    themeId: number,
    fields: { name?: string; role?: string }
  ): Promise<ShopifyTheme> {
    const response = await this.request<ShopifyThemeResponse>(
      'PUT',
      `themes/${themeId}`,
      { theme: fields }
    );
    return response.theme;
  }

  /**
   * Delete a theme.
   * DELETE /admin/api/2024-01/themes/{themeId}.json
   * Cannot delete the live (main) theme.
   */
  async deleteTheme(themeId: number): Promise<void> {
    await this.request<void>('DELETE', `themes/${themeId}`);
  }

  // ── GraphQL API ─────────────────────────────────────────────────────

  /**
   * Execute a GraphQL query against the Shopify Admin API.
   * POST /admin/api/2024-01/graphql.json
   */
  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const cleanDomain = this.storeDomain.replace(/^https?:\/\//, '');
    const url = `https://${cleanDomain}/admin/api/${this.apiVersion}/graphql.json`;
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': this.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });

      if (response.status === 429 && attempt < maxAttempts - 1) {
        const retryAfter = response.headers.get('Retry-After');
        const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : 2;
        await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1000));
        continue;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new APIError(
          `GraphQL error: ${response.status} ${text.slice(0, 200)}`,
          'GRAPHQL_ERROR',
          response.status
        );
      }

      const result = (await response.json()) as GraphQLResponse<T>;

      // Shopify may return a 200 with a THROTTLED error in the body
      const isThrottled = result.errors?.some(
        (e) => e.extensions?.code === 'THROTTLED'
      );
      if (isThrottled && attempt < maxAttempts - 1) {
        const cost = result.extensions as
          | { cost: { requestedQueryCost: number; currentlyAvailable: number; restoreRate: number } }
          | undefined;
        const waitMs = cost?.cost?.restoreRate
          ? Math.ceil(((cost.cost.requestedQueryCost ?? 100) - (cost.cost.currentlyAvailable ?? 0)) / cost.cost.restoreRate) * 1000
          : 2000;
        await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 30_000)));
        continue;
      }

      if (result.errors?.length) {
        throw new APIError(
          `GraphQL errors: ${result.errors.map((e) => e.message).join('; ')}`,
          'GRAPHQL_QUERY_ERROR',
          400
        );
      }

      return result.data;
    }

    throw new APIError('GraphQL request failed after retries', 'GRAPHQL_ERROR', 429);
  }

  /**
   * Duplicate an existing theme via GraphQL.
   * Returns the new theme with all files copied server-side by Shopify.
   * Available in API version 2025-10+.
   */
  async duplicateTheme(themeId: number, name: string): Promise<ShopifyTheme> {
    const gid = `gid://shopify/OnlineStoreTheme/${themeId}`;
    const data = await this.graphql<{
      themeDuplicate: {
        newTheme: { id: string; name: string; role: string; createdAt: string; updatedAt: string } | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(
      `mutation themeDuplicate($id: ID!, $name: String!) {
        themeDuplicate(id: $id, name: $name) {
          newTheme { id name role createdAt updatedAt }
          userErrors { field message }
        }
      }`,
      { id: gid, name }
    );

    const { newTheme, userErrors } = data.themeDuplicate;
    if (userErrors.length > 0) {
      throw new APIError(
        `Theme duplicate failed: ${userErrors.map((e) => e.message).join('; ')}`,
        'THEME_DUPLICATE_FAILED',
        400
      );
    }
    if (!newTheme) {
      throw new APIError('Theme duplicate returned no theme', 'THEME_DUPLICATE_FAILED', 500);
    }

    // Convert GraphQL GID to numeric ID
    const numericId = parseInt(newTheme.id.split('/').pop() ?? '0', 10);
    return {
      id: numericId,
      name: newTheme.name,
      role: newTheme.role as ShopifyTheme['role'],
      created_at: newTheme.createdAt,
      updated_at: newTheme.updatedAt,
    };
  }

  /**
   * Batch upsert up to 50 theme files via GraphQL.
   * Much faster than sequential REST putAsset calls.
   * Available in API version 2024-10+.
   */
  async upsertThemeFiles(
    themeId: number,
    files: Array<{ filename: string; body: { type: 'TEXT'; value: string } }>
  ): Promise<{ upsertedCount: number; errors: string[] }> {
    const gid = `gid://shopify/OnlineStoreTheme/${themeId}`;
    const data = await this.graphql<{
      themeFilesUpsert: {
        upsertedThemeFiles: Array<{ filename: string }> | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(
      `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
        themeFilesUpsert(themeId: $themeId, files: $files) {
          upsertedThemeFiles { filename }
          userErrors { field message }
        }
      }`,
      { themeId: gid, files }
    );

    const { upsertedThemeFiles, userErrors } = data.themeFilesUpsert;
    return {
      upsertedCount: upsertedThemeFiles?.length ?? 0,
      errors: userErrors.map((e) => e.message),
    };
  }

  /**
   * Copy files from one theme to another via GraphQL.
   * Avoids downloading and re-uploading content.
   * Available in API version 2024-10+.
   */
  async copyThemeFiles(
    sourceThemeId: number,
    targetThemeId: number,
    files: string[]
  ): Promise<{ copiedCount: number; errors: string[] }> {
    const sourceGid = `gid://shopify/OnlineStoreTheme/${sourceThemeId}`;
    const targetGid = `gid://shopify/OnlineStoreTheme/${targetThemeId}`;
    const fileInputs = files.map((f) => ({
      src: sourceGid,
      filename: f,
    }));
    const data = await this.graphql<{
      themeFilesCopy: {
        copiedThemeFiles: Array<{ filename: string }> | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(
      `mutation themeFilesCopy($themeId: ID!, $files: [OnlineStoreThemeFilesCopyFileInput!]!) {
        themeFilesCopy(themeId: $themeId, files: $files) {
          copiedThemeFiles { filename }
          userErrors { field message }
        }
      }`,
      { themeId: targetGid, files: fileInputs }
    );

    const { copiedThemeFiles, userErrors } = data.themeFilesCopy;
    return {
      copiedCount: copiedThemeFiles?.length ?? 0,
      errors: userErrors.map((e) => e.message),
    };
  }

  // ── Navigation (Online Store) ───────────────────────────────────────

  /** List all navigation menus. */
  async listMenus(): Promise<ShopifyMenu[]> {
    const data = await this.graphql<{
      menus: { edges: Array<{ node: { id: string; title: string; handle: string; items: Array<{ id: string; title: string; url: string; type: string; resourceId: string | null; items: Array<{ id: string; title: string; url: string; type: string }> }> } }> };
    }>(`{
      menus(first: 50) {
        edges {
          node {
            id
            title
            handle
            items {
              id
              title
              url
              type
              resourceId
              items { id title url type }
            }
          }
        }
      }
    }`);

    return data.menus.edges.map((e) => ({
      id: e.node.id,
      title: e.node.title,
      handle: e.node.handle,
      items: e.node.items.map((item) => ({
        id: item.id,
        title: item.title,
        url: item.url,
        type: item.type,
        resource_id: item.resourceId ? parseInt(item.resourceId.split('/').pop() ?? '0', 10) : null,
        items: item.items?.map((sub) => ({
          id: sub.id,
          title: sub.title,
          url: sub.url,
          type: sub.type,
        })),
      })),
    }));
  }

  // ── Pages (REST) ────────────────────────────────────────────────────

  /** List all pages. */
  async listPages(limit = 50): Promise<ShopifyPage[]> {
    const res = await this.request<{ pages: ShopifyPage[] }>('GET', `pages?limit=${limit}`);
    return res.pages;
  }

  /** Get a page by ID. */
  async getPage(pageId: number): Promise<ShopifyPage> {
    const res = await this.request<{ page: ShopifyPage }>('GET', `pages/${pageId}`);
    return res.page;
  }

  /** Create a page. */
  async createPage(page: { title: string; body_html: string; published?: boolean }): Promise<ShopifyPage> {
    const res = await this.request<{ page: ShopifyPage }>('POST', 'pages', { page });
    return res.page;
  }

  /** Update a page. */
  async updatePage(pageId: number, fields: Partial<Pick<ShopifyPage, 'title' | 'body_html' | 'handle' | 'template_suffix'> & { published: boolean }>): Promise<ShopifyPage> {
    const res = await this.request<{ page: ShopifyPage }>('PUT', `pages/${pageId}`, { page: fields });
    return res.page;
  }

  /** Delete a page. */
  async deletePage(pageId: number): Promise<void> {
    await this.request<void>('DELETE', `pages/${pageId}`);
  }

  // ── Collections (REST) ─────────────────────────────────────────────

  /** List custom collections. */
  async listCustomCollections(limit = 50): Promise<ShopifyCollection[]> {
    const res = await this.request<{ custom_collections: ShopifyCollection[] }>('GET', `custom_collections?limit=${limit}`);
    return res.custom_collections;
  }

  /** List smart collections. */
  async listSmartCollections(limit = 50): Promise<ShopifyCollection[]> {
    const res = await this.request<{ smart_collections: ShopifyCollection[] }>('GET', `smart_collections?limit=${limit}`);
    return res.smart_collections;
  }

  /** List all collections (custom + smart), merged and sorted by title. */
  async listCollections(limit = 50): Promise<ShopifyCollection[]> {
    const [custom, smart] = await Promise.all([
      this.listCustomCollections(limit),
      this.listSmartCollections(limit),
    ]);
    const all = [...custom, ...smart];
    all.sort((a, b) => a.title.localeCompare(b.title));
    return all;
  }

  // ── Blogs + Articles (REST) ────────────────────────────────────────

  /** List blogs. */
  async listBlogs(limit = 50): Promise<ShopifyBlog[]> {
    const res = await this.request<{ blogs: ShopifyBlog[] }>('GET', `blogs?limit=${limit}`);
    return res.blogs;
  }

  /** List articles for a blog. */
  async listArticles(blogId: number, limit = 50): Promise<ShopifyArticle[]> {
    const res = await this.request<{ articles: ShopifyArticle[] }>('GET', `blogs/${blogId}/articles?limit=${limit}`);
    return res.articles;
  }

  // ── Price Rules + Discount Codes (REST) ─────────────────────────────

  /** List price rules. */
  async listPriceRules(limit = 50): Promise<ShopifyPriceRule[]> {
    const res = await this.request<{ price_rules: ShopifyPriceRule[] }>('GET', `price_rules?limit=${limit}`);
    return res.price_rules;
  }

  /** Create a price rule. */
  async createPriceRule(rule: Partial<ShopifyPriceRule>): Promise<ShopifyPriceRule> {
    const res = await this.request<{ price_rule: ShopifyPriceRule }>('POST', 'price_rules', { price_rule: rule });
    return res.price_rule;
  }

  /** Update a price rule. */
  async updatePriceRule(ruleId: number, fields: Partial<ShopifyPriceRule>): Promise<ShopifyPriceRule> {
    const res = await this.request<{ price_rule: ShopifyPriceRule }>('PUT', `price_rules/${ruleId}`, { price_rule: fields });
    return res.price_rule;
  }

  /** Delete a price rule. */
  async deletePriceRule(ruleId: number): Promise<void> {
    await this.request<void>('DELETE', `price_rules/${ruleId}`);
  }

  /** List discount codes for a price rule. */
  async listDiscountCodes(priceRuleId: number): Promise<ShopifyDiscountCode[]> {
    const res = await this.request<{ discount_codes: ShopifyDiscountCode[] }>('GET', `price_rules/${priceRuleId}/discount_codes`);
    return res.discount_codes;
  }

  /** Create a discount code. */
  async createDiscountCode(priceRuleId: number, code: string): Promise<ShopifyDiscountCode> {
    const res = await this.request<{ discount_code: ShopifyDiscountCode }>('POST', `price_rules/${priceRuleId}/discount_codes`, { discount_code: { code } });
    return res.discount_code;
  }

  /** Delete a discount code. */
  async deleteDiscountCode(priceRuleId: number, codeId: number): Promise<void> {
    await this.request<void>('DELETE', `price_rules/${priceRuleId}/discount_codes/${codeId}`);
  }

  // ── Products (GraphQL + REST) ───────────────────────────────────────

  /** List products via REST (legacy — use listProductsGraphQL for variant counts). */
  async listProducts(limit = 50): Promise<ShopifyProduct[]> {
    const res = await this.request<{ products: ShopifyProduct[] }>('GET', `products?limit=${limit}`);
    return res.products;
  }

  /** List products via GraphQL with totalVariants and option names. */
  async listProductsGraphQL(first = 50, after?: string): Promise<{
    products: Array<{
      id: string;
      title: string;
      handle: string;
      status: string;
      totalVariants: number;
      options: Array<{ name: string; values: string[] }>;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  }> {
    const data = await this.graphql<{
      products: {
        edges: Array<{
          node: {
            id: string;
            title: string;
            handle: string;
            status: string;
            totalVariants: number;
            options: Array<{ name: string; values: string[] }>;
          };
        }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    }>(`query($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        edges {
          node {
            id title handle status totalVariants
            options { name values }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`, { first, after });

    return {
      products: data.products.edges.map(e => e.node),
      pageInfo: data.products.pageInfo,
    };
  }

  /**
   * Get a single product by ID or handle via GraphQL.
   * Returns full option structure and first page of variants with cursor pagination.
   */
  async getProductGraphQL(idOrHandle: string, variantFirst = 100, variantAfter?: string): Promise<{
    id: string;
    title: string;
    handle: string;
    status: string;
    totalVariants: number;
    options: Array<{ name: string; values: string[] }>;
    variants: {
      edges: Array<{
        node: {
          id: string;
          title: string;
          sku: string;
          price: string;
          availableForSale: boolean;
          selectedOptions: Array<{ name: string; value: string }>;
          image: { url: string; altText: string | null } | null;
        };
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
    images: { edges: Array<{ node: { url: string; altText: string | null } }> };
  }> {
    const isGid = idOrHandle.startsWith('gid://');
    const isNumeric = /^\d+$/.test(idOrHandle);

    let queryFilter: string;
    let variables: Record<string, unknown>;

    if (isGid || isNumeric) {
      const gid = isGid ? idOrHandle : `gid://shopify/Product/${idOrHandle}`;
      queryFilter = 'product(id: $id)';
      variables = { id: gid, variantFirst, variantAfter };
    } else {
      queryFilter = 'productByHandle(handle: $handle)';
      variables = { handle: idOrHandle, variantFirst, variantAfter };
    }

    const paramDecl = isGid || isNumeric
      ? '$id: ID!, $variantFirst: Int!, $variantAfter: String'
      : '$handle: String!, $variantFirst: Int!, $variantAfter: String';

    const data = await this.graphql<Record<string, {
      id: string;
      title: string;
      handle: string;
      status: string;
      totalVariants: number;
      options: Array<{ name: string; values: string[] }>;
      variants: {
        edges: Array<{
          node: {
            id: string;
            title: string;
            sku: string;
            price: string;
            availableForSale: boolean;
            selectedOptions: Array<{ name: string; value: string }>;
            image: { url: string; altText: string | null } | null;
          };
        }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
      images: { edges: Array<{ node: { url: string; altText: string | null } }> };
    }>>(
      `query(${paramDecl}) {
        ${queryFilter} {
          id title handle status totalVariants
          options { name values }
          variants(first: $variantFirst, after: $variantAfter) {
            edges {
              node {
                id title sku price availableForSale
                selectedOptions { name value }
                image { url altText }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
          images(first: 20) {
            edges { node { url altText } }
          }
        }
      }`,
      variables,
    );

    const key = isGid || isNumeric ? 'product' : 'productByHandle';
    const product = data[key];
    if (!product) {
      throw new APIError(`Product not found: ${idOrHandle}`, 'NOT_FOUND', 404);
    }
    return product;
  }

  // ── Inventory (REST + GraphQL) ──────────────────────────────────────

  /** List locations. */
  async listLocations(): Promise<ShopifyLocation[]> {
    const res = await this.request<{ locations: ShopifyLocation[] }>('GET', 'locations');
    return res.locations;
  }

  /** Get inventory levels for items at locations. */
  async getInventoryLevels(locationId: number, limit = 50): Promise<ShopifyInventoryLevel[]> {
    const res = await this.request<{ inventory_levels: ShopifyInventoryLevel[] }>('GET', `inventory_levels?location_ids=${locationId}&limit=${limit}`);
    return res.inventory_levels;
  }

  /** Set inventory level (adjust stock). Uses GraphQL inventorySetQuantities. */
  async setInventoryLevel(inventoryItemId: number, locationId: number, quantity: number): Promise<void> {
    await this.graphql(`mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        inventoryAdjustmentGroup { reason }
        userErrors { field message }
      }
    }`, {
      input: {
        name: 'available',
        reason: 'correction',
        quantities: [{
          inventoryItemId: `gid://shopify/InventoryItem/${inventoryItemId}`,
          locationId: `gid://shopify/Location/${locationId}`,
          quantity,
        }],
      },
    });
  }

  // ── Files (CDN via GraphQL) ─────────────────────────────────────────

  /** List files from Shopify CDN. */
  async listFiles(first = 50, after?: string): Promise<{ files: ShopifyFile[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }> {
    const data = await this.graphql<{
      files: {
        edges: Array<{ node: ShopifyFile; cursor: string }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    }>(`query($first: Int!, $after: String) {
      files(first: $first, after: $after) {
        edges { node { id alt createdAt fileStatus preview { image { url } } } cursor }
        pageInfo { hasNextPage endCursor }
      }
    }`, { first, after });

    return {
      files: data.files.edges.map((e) => e.node),
      pageInfo: data.files.pageInfo,
    };
  }

  /** Delete files by IDs (GraphQL GIDs). */
  async deleteFiles(fileIds: string[]): Promise<void> {
    await this.graphql(`mutation($fileIds: [ID!]!) {
      fileDelete(fileIds: $fileIds) { deletedFileIds userErrors { field message } }
    }`, { fileIds });
  }

  // ── Storefront API bridge ───────────────────────────────────────────

  /** Get the store's storefront access token for the Storefront API. */
  get domain(): string {
    return this.storeDomain.replace(/^https?:\/\//, '');
  }

  /** Fetch products via REST for preview data bridging. */
  async listProductsForPreview(limit = 10): Promise<ShopifyProduct[]> {
    const res = await this.request<{ products: ShopifyProduct[] }>('GET', `products?limit=${limit}&fields=id,title,handle,variants,images,status`);
    return res.products;
  }

  /**
   * Register required webhooks with Shopify via REST API.
   * Idempotent: checks existing webhooks and only creates missing ones.
   */
  async registerWebhooks(callbackUrl: string): Promise<void> {
    const requiredTopics = ['themes/update', 'app/uninstalled'];

    const existing = await this.request<{
      webhooks: Array<{ id: number; topic: string; address: string }>;
    }>('GET', 'webhooks');

    const registeredTopics = new Set(
      existing.webhooks
        .filter((w) => w.address === callbackUrl)
        .map((w) => w.topic),
    );

    for (const topic of requiredTopics) {
      if (registeredTopics.has(topic)) continue;
      try {
        await this.request<unknown>('POST', 'webhooks', {
          webhook: { topic, address: callbackUrl, format: 'json' },
        });
      } catch (err) {
        console.warn(`[Webhooks] Failed to register ${topic}:`, err);
      }
    }
  }
}
