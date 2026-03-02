import { logger } from '../logger.js';

const API_VERSION = '2025-01';
const MAX_RETRIES = 2;

export interface Theme {
  id: number;
  name: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  title: string;
  handle: string;
  status: string;
  variants: Array<{ id: string; title: string; price: string; sku: string }>;
  images: Array<{ id: string; src: string; alt: string | null }>;
  metafields: Array<{ namespace: string; key: string; value: string; type: string }>;
}

export interface Resource {
  id: string;
  title: string;
  handle: string;
}

export class ShopifyAPIClient {
  private store: string;
  private accessToken: string;
  private baseUrl: string;

  constructor(store: string, accessToken: string) {
    this.store = store;
    this.accessToken = accessToken;
    const host = store.includes('.') ? store : `${store}.myshopify.com`;
    this.baseUrl = `https://${host}/admin/api/${API_VERSION}`;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'X-Shopify-Access-Token': this.accessToken,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, { ...options, headers });

        if (response.status === 429) {
          const retryAfter = parseFloat(response.headers.get('Retry-After') ?? '2');
          logger.warn(`Shopify rate limited, retrying after ${retryAfter}s`);
          await this.sleep(retryAfter * 1000);
          continue;
        }

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Shopify API error ${response.status}: ${errorBody}`);
        }

        return (await response.json()) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES) {
          logger.warn(`Shopify request failed (attempt ${attempt + 1}), retrying`, { error: lastError.message });
          await this.sleep(1000 * (attempt + 1));
        }
      }
    }

    throw lastError ?? new Error('Shopify API request failed');
  }

  private async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}/graphql.json`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (response.status === 429) {
      const retryAfter = parseFloat(response.headers.get('Retry-After') ?? '2');
      await this.sleep(retryAfter * 1000);
      return this.graphql(query, variables);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Shopify GraphQL error ${response.status}: ${errorBody}`);
    }

    const result = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };

    if (result.errors?.length) {
      throw new Error(`Shopify GraphQL errors: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    return result.data as T;
  }

  async listThemes(): Promise<Theme[]> {
    const result = await this.request<{ themes: Theme[] }>('/themes.json');
    return result.themes;
  }

  async getAsset(themeId: string, key: string): Promise<string> {
    const result = await this.request<{ asset: { value?: string; attachment?: string } }>(
      `/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`
    );

    if (result.asset.value !== undefined) return result.asset.value;
    if (result.asset.attachment) return Buffer.from(result.asset.attachment, 'base64').toString('utf-8');
    throw new Error(`Asset "${key}" has no content`);
  }

  async getProduct(productId?: string, handle?: string): Promise<Product> {
    if (handle) {
      const data = await this.graphql<{
        productByHandle: {
          id: string;
          title: string;
          handle: string;
          status: string;
          variants: { edges: Array<{ node: { id: string; title: string; price: string; sku: string } }> };
          images: { edges: Array<{ node: { id: string; url: string; altText: string | null } }> };
          metafields: { edges: Array<{ node: { namespace: string; key: string; value: string; type: string } }> };
        } | null;
      }>(`{
        productByHandle(handle: "${handle}") {
          id title handle status
          variants(first: 50) { edges { node { id title price sku } } }
          images(first: 20) { edges { node { id url altText } } }
          metafields(first: 20) { edges { node { namespace key value type } } }
        }
      }`);

      if (!data.productByHandle) throw new Error(`Product with handle "${handle}" not found`);
      return this.mapGraphQLProduct(data.productByHandle);
    }

    if (productId) {
      const numericId = productId.replace(/\D/g, '');
      const result = await this.request<{ product: { id: number; title: string; handle: string; status: string; variants: Array<{ id: number; title: string; price: string; sku: string }>; images: Array<{ id: number; src: string; alt: string | null }> } }>(
        `/products/${numericId}.json`
      );
      const p = result.product;
      return {
        id: String(p.id),
        title: p.title,
        handle: p.handle,
        status: p.status,
        variants: p.variants.map((v) => ({ id: String(v.id), title: v.title, price: v.price, sku: v.sku ?? '' })),
        images: p.images.map((i) => ({ id: String(i.id), src: i.src, alt: i.alt })),
        metafields: [],
      };
    }

    throw new Error('Either productId or handle must be provided');
  }

  async listResources(type: string): Promise<Resource[]> {
    const endpointMap: Record<string, string> = {
      products: '/products.json?limit=50',
      collections: '/custom_collections.json?limit=50',
      pages: '/pages.json?limit=50',
      blogs: '/blogs.json?limit=50',
    };

    const endpoint = endpointMap[type];
    if (!endpoint) throw new Error(`Unknown resource type: ${type}. Supported: ${Object.keys(endpointMap).join(', ')}`);

    const result = await this.request<Record<string, Array<{ id: number; title: string; handle: string }>>>(endpoint);

    const key = Object.keys(result)[0];
    const items = result[key] ?? [];
    return items.map((item) => ({
      id: String(item.id),
      title: item.title,
      handle: item.handle,
    }));
  }

  private mapGraphQLProduct(p: {
    id: string;
    title: string;
    handle: string;
    status: string;
    variants: { edges: Array<{ node: { id: string; title: string; price: string; sku: string } }> };
    images: { edges: Array<{ node: { id: string; url: string; altText: string | null } }> };
    metafields: { edges: Array<{ node: { namespace: string; key: string; value: string; type: string } }> };
  }): Product {
    return {
      id: p.id,
      title: p.title,
      handle: p.handle,
      status: p.status,
      variants: p.variants.edges.map((e) => e.node),
      images: p.images.edges.map((e) => ({ id: e.node.id, src: e.node.url, alt: e.node.altText })),
      metafields: p.metafields.edges.map((e) => e.node),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
