import { createClient as createServiceClient } from '@supabase/supabase-js';
import { APIError } from '@/lib/errors/handler';
import { decryptToken } from '@/lib/shopify/token-manager';
import type { PreviewResource, PreviewResourceType } from '@/lib/types/preview';

const API_VERSION = '2025-10';

const CACHE_TTL_MS = 5 * 60 * 1000;
const resourceCache = new Map<
  string,
  { timestamp: number; data: PreviewResource[] }
>();

function cacheKey(projectId: string, type: PreviewResourceType, query: string) {
  return `${projectId}:${type}:${query}`;
}

/**
 * Service-role Supabase client — bypasses RLS so we can read
 * the encrypted access token from shopify_connections.
 */
function adminSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for preview resource fetching');
  }
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );
}

async function getShopifyConnection(projectId: string) {
  const supabase = adminSupabase();

  // Store-first: look up the connection via project's shopify_connection_id
  const { data: project, error: projError } = await supabase
    .from('projects')
    .select('shopify_connection_id')
    .eq('id', projectId)
    .maybeSingle();

  if (projError || !project?.shopify_connection_id) {
    // Fallback: look for any connection linked to this project directly
    const { data: conn } = await supabase
      .from('shopify_connections')
      .select('store_domain, access_token_encrypted')
      .eq('project_id', projectId)
      .maybeSingle();

    if (conn) return conn;

    throw APIError.notFound('Shopify connection not found for this project');
  }

  const { data, error } = await supabase
    .from('shopify_connections')
    .select('store_domain, access_token_encrypted')
    .eq('id', project.shopify_connection_id)
    .maybeSingle();

  if (error || !data) {
    throw APIError.notFound('Shopify connection not found');
  }
  return data;
}

async function queryGraphQL<T>(
  storeDomain: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const url = `https://${storeDomain.replace(/^https?:\/\//, '')}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[resource-fetcher] Shopify GraphQL error', res.status, body);
    throw new APIError('Failed to fetch Shopify resources', 'SHOPIFY_API_ERROR', res.status);
  }

  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) {
    console.error('[resource-fetcher] Shopify GraphQL errors', JSON.stringify(json.errors));
    throw new APIError('Shopify GraphQL error', 'SHOPIFY_GRAPHQL_ERROR', 500);
  }
  if (!json.data) {
    throw new APIError('Shopify GraphQL response missing data', 'SHOPIFY_GRAPHQL_ERROR', 500);
  }
  return json.data;
}

export async function fetchPreviewResources(
  projectId: string,
  type: PreviewResourceType,
  search = ''
): Promise<PreviewResource[]> {
  const cached = resourceCache.get(cacheKey(projectId, type, search));
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const connection = await getShopifyConnection(projectId);
  const accessToken = decryptToken(connection.access_token_encrypted);

  const queryString = search ? `title:*${search}*` : '';

  let gql = '';
  let path = '';

  switch (type) {
    case 'product':
      gql = `
        query Products($first: Int!, $query: String) {
          products(first: $first, query: $query) {
            edges {
              node {
                id
                title
                handle
                featuredImage { url }
              }
            }
          }
        }
      `;
      path = 'products';
      break;
    case 'collection':
      gql = `
        query Collections($first: Int!, $query: String) {
          collections(first: $first, query: $query) {
            edges {
              node {
                id
                title
                handle
                image { url }
              }
            }
          }
        }
      `;
      path = 'collections';
      break;
    case 'blog':
      gql = `
        query Blogs($first: Int!, $query: String) {
          blogs(first: $first, query: $query) {
            edges {
              node {
                id
                title
                handle
              }
            }
          }
        }
      `;
      path = 'blogs';
      break;
    case 'page':
      gql = `
        query Pages($first: Int!, $query: String) {
          pages(first: $first, query: $query) {
            edges {
              node {
                id
                title
                handle
              }
            }
          }
        }
      `;
      path = 'pages';
      break;
    default:
      throw APIError.badRequest('Unsupported resource type');
  }

  interface ShopifyResourceNode {
    id: string;
    title: string;
    handle: string;
    featuredImage?: { url: string };
    image?: { url: string };
  }

  const data = await queryGraphQL<Record<string, { edges: Array<{ node: ShopifyResourceNode }> }>>(
    connection.store_domain,
    accessToken,
    gql,
    { first: 50, query: queryString || null }
  );

  const edges = data[path]?.edges ?? [];
  const resources: PreviewResource[] = edges.map(({ node }) => ({
    id: node.id,
    title: node.title,
    handle: node.handle,
    image: node.featuredImage?.url ?? node.image?.url ?? null,
    type,
  }));

  resourceCache.set(cacheKey(projectId, type, search), {
    timestamp: Date.now(),
    data: resources,
  });

  return resources;
}
