export type PreviewPageType =
  | 'home'
  | 'product'
  | 'collection'
  | 'collection_list'
  | 'gift_card'
  | 'cart'
  | 'checkout'
  | 'page'
  | 'blog'
  | 'search'
  | 'password'
  | 'not_found';

export interface PreviewState {
  id: string;
  project_id: string;
  device_width: number;
  page_type: PreviewPageType;
  resource_id: string | null;
  created_at: string;
  updated_at: string;
}

export type PreviewResourceType = 'product' | 'collection' | 'page' | 'blog';

export interface PreviewResource {
  id: string;
  title: string;
  handle: string;
  image?: string | null;
  type: PreviewResourceType;
}

export interface UpsertPreviewStateInput {
  project_id: string;
  device_width: number;
  page_type: PreviewPageType;
  resource_id?: string | null;
}
