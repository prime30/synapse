import { createClient as createServiceClient } from '@supabase/supabase-js';
import { APIError } from '@/lib/errors/handler';
import { decryptToken } from './token-manager';
import { ShopifyAdminAPI } from './admin-api';
import type { ShopifyConnection } from '@/lib/types/shopify';

function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );
  }
  throw new Error('SUPABASE_SERVICE_ROLE_KEY required for Shopify operations');
}

export class ShopifyAdminAPIFactory {
  /**
   * Create a ShopifyAdminAPI instance from a connection ID.
   * Gets connection from DB, decrypts token, and creates API instance.
   */
  static async create(connectionId: string): Promise<ShopifyAdminAPI> {
    const supabase = getAdminClient();

    // Get connection from database with both store_domain and encrypted token
    const { data, error } = await supabase
      .from('shopify_connections')
      .select('store_domain, access_token_encrypted')
      .eq('id', connectionId)
      .single();

    if (error || !data) {
      throw APIError.notFound('Shopify connection not found');
    }

    const connection = data as Pick<
      ShopifyConnection,
      'store_domain' | 'access_token_encrypted'
    >;

    // Decrypt access token
    const accessToken = decryptToken(connection.access_token_encrypted);

    // Create and return API instance
    return new ShopifyAdminAPI(connection.store_domain, accessToken);
  }
}
