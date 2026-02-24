export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
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

export interface MessageMetadata {
  toolCalls?: Array<{
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
  toolResults?: Array<{
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error: boolean;
    compressed?: boolean;
  }>;
}

export interface AIMessageRecord {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  metadata: MessageMetadata | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}

export type BugSeverity = 'low' | 'medium' | 'high' | 'critical';
export type BugStatus = 'open' | 'in_progress' | 'fixed' | 'archived';

export interface BugReport {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  description: string;
  screenshot_url: string | null;
  severity: BugSeverity;
  status: BugStatus;
  agent_session_id: string | null;
  fixed_by: string | null;
  fixed_at: string | null;
  created_at: string;
  updated_at: string;
}
