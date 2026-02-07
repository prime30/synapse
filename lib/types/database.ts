export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  organization_id: string;
  owner_id: string;
  shopify_store_url: string | null;
  created_at: string;
  updated_at: string;
}

export type FileType = 'liquid' | 'javascript' | 'css' | 'other';

export interface FileRecord {
  id: string;
  project_id: string;
  name: string;
  path: string;
  file_type: FileType;
  size_bytes: number;
  content: string | null;
  storage_path: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type AIProviderType = 'anthropic' | 'openai';

export interface AISession {
  id: string;
  project_id: string;
  user_id: string;
  provider: AIProviderType;
  model: string;
  title: string | null;
  total_input_tokens: number;
  total_output_tokens: number;
  created_at: string;
  updated_at: string;
}

export type MessageRole = 'system' | 'user' | 'assistant';

export interface AIMessageRecord {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}
