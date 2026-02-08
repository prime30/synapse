export type ShopifySyncStatus = 'connected' | 'syncing' | 'error' | 'disconnected';
export type ThemeFileSyncStatus = 'synced' | 'pending' | 'conflict' | 'error';

export interface ShopifyConnection {
  id: string;
  project_id: string;
  store_domain: string;
  access_token_encrypted: string;
  theme_id: string | null;
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
