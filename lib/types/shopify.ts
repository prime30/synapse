export type ShopifySyncStatus = 'connected' | 'syncing' | 'error' | 'disconnected';
export type ThemeFileSyncStatus = 'synced' | 'pending' | 'conflict' | 'error';

export interface ShopifyConnection {
  id: string;
  user_id: string;
  /** @deprecated Use shopify_connection_id on projects instead */
  project_id: string | null;
  store_domain: string;
  access_token_encrypted: string;
  theme_id: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  sync_status: ShopifySyncStatus;
  scopes: string[];
  created_at: string;
  updated_at: string;
}

export interface ThemeFile {
  id: string;
  connection_id: string;
  file_path: string;
  content_hash: string | null;
  remote_updated_at: string | null;
  local_updated_at: string | null;
  sync_status: ThemeFileSyncStatus;
  created_at: string;
  updated_at: string;
}

export interface ShopifyOAuthParams {
  shop: string;
  code: string;
  state: string;
  timestamp: string;
  hmac: string;
}
