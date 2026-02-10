/**
 * REQ-52 Task 3: Design token data model — Supabase CRUD service.
 *
 * Uses the same service-role client pattern as lib/services/files.ts:
 *  - Service-role key when available (bypasses RLS).
 *  - Falls back to the cookie-based anon client.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { TokenCategory } from '../types';

// ---------------------------------------------------------------------------
// Client helper
// ---------------------------------------------------------------------------

async function getClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );
  }
  const { createClient } = await import('@/lib/supabase/server');
  return createClient();
}

// ---------------------------------------------------------------------------
// DB row types
// ---------------------------------------------------------------------------

export interface DesignTokenRow {
  id: string;
  project_id: string;
  name: string;
  category: TokenCategory;
  value: string;
  aliases: string[];
  description: string | null;
  metadata: Record<string, unknown>;
  semantic_parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DesignTokenUsageRow {
  id: string;
  token_id: string;
  file_path: string;
  line_number: number;
  context: string | null;
  component_id: string | null;
  created_at: string;
}

export interface DesignComponentRow {
  id: string;
  project_id: string;
  name: string;
  file_path: string;
  component_type: 'snippet' | 'section' | 'css_class' | 'js_component';
  tokens_used: string[];
  variants: string[];
  usage_frequency: number;
  preview_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DesignSystemVersionRow {
  id: string;
  project_id: string;
  version_number: number;
  changes: Record<string, unknown>;
  author_id: string | null;
  description: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Input types (omit server-generated fields)
// ---------------------------------------------------------------------------

export type CreateTokenInput = Pick<
  DesignTokenRow,
  'project_id' | 'name' | 'category' | 'value'
> &
  Partial<
    Pick<DesignTokenRow, 'aliases' | 'description' | 'metadata' | 'semantic_parent_id'>
  >;

export type UpdateTokenInput = Partial<
  Pick<
    DesignTokenRow,
    'name' | 'category' | 'value' | 'aliases' | 'description' | 'metadata' | 'semantic_parent_id'
  >
>;

export type CreateUsageInput = Pick<
  DesignTokenUsageRow,
  'token_id' | 'file_path'
> &
  Partial<Pick<DesignTokenUsageRow, 'line_number' | 'context' | 'component_id'>>;

export type CreateVersionInput = Pick<
  DesignSystemVersionRow,
  'project_id' | 'version_number'
> &
  Partial<Pick<DesignSystemVersionRow, 'changes' | 'author_id' | 'description'>>;

// ---------------------------------------------------------------------------
// Token CRUD
// ---------------------------------------------------------------------------

export async function createToken(input: CreateTokenInput): Promise<DesignTokenRow> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('design_tokens')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as DesignTokenRow;
}

export async function getToken(tokenId: string): Promise<DesignTokenRow> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('design_tokens')
    .select('*')
    .eq('id', tokenId)
    .single();
  if (error) throw error;
  return data as DesignTokenRow;
}

export async function updateToken(
  tokenId: string,
  input: UpdateTokenInput,
): Promise<DesignTokenRow> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('design_tokens')
    .update(input)
    .eq('id', tokenId)
    .select()
    .single();
  if (error) throw error;
  return data as DesignTokenRow;
}

export async function deleteToken(tokenId: string): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from('design_tokens')
    .delete()
    .eq('id', tokenId);
  if (error) throw error;
}

export async function listByProject(projectId: string): Promise<DesignTokenRow[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('design_tokens')
    .select('*')
    .eq('project_id', projectId)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DesignTokenRow[];
}

export async function listByCategory(
  projectId: string,
  category: TokenCategory,
): Promise<DesignTokenRow[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('design_tokens')
    .select('*')
    .eq('project_id', projectId)
    .eq('category', category)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DesignTokenRow[];
}

export async function findByName(
  projectId: string,
  name: string,
): Promise<DesignTokenRow | null> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('design_tokens')
    .select('*')
    .eq('project_id', projectId)
    .eq('name', name)
    .maybeSingle();
  if (error) throw error;
  return (data as DesignTokenRow) ?? null;
}

// ---------------------------------------------------------------------------
// Usage CRUD
// ---------------------------------------------------------------------------

export async function createUsage(input: CreateUsageInput): Promise<DesignTokenUsageRow> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('design_token_usages')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as DesignTokenUsageRow;
}

export async function listUsagesByToken(tokenId: string): Promise<DesignTokenUsageRow[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('design_token_usages')
    .select('*')
    .eq('token_id', tokenId)
    .order('file_path', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DesignTokenUsageRow[];
}

export async function listUsagesByFile(filePath: string): Promise<DesignTokenUsageRow[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('design_token_usages')
    .select('*')
    .eq('file_path', filePath)
    .order('line_number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DesignTokenUsageRow[];
}

export async function deleteUsagesByToken(tokenId: string): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from('design_token_usages')
    .delete()
    .eq('token_id', tokenId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Version CRUD
// ---------------------------------------------------------------------------

export async function createVersion(
  input: CreateVersionInput,
): Promise<DesignSystemVersionRow> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('design_system_versions')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as DesignSystemVersionRow;
}

export async function getLatestVersion(
  projectId: string,
): Promise<DesignSystemVersionRow | null> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('design_system_versions')
    .select('*')
    .eq('project_id', projectId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as DesignSystemVersionRow) ?? null;
}

export async function getVersionById(
  projectId: string,
  versionId: string,
): Promise<DesignSystemVersionRow | null> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('design_system_versions')
    .select('*')
    .eq('id', versionId)
    .eq('project_id', projectId)
    .single();
  if (error) throw error;
  return (data as DesignSystemVersionRow) ?? null;
}

export async function listVersions(
  projectId: string,
): Promise<DesignSystemVersionRow[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from('design_system_versions')
    .select('*')
    .eq('project_id', projectId)
    .order('version_number', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DesignSystemVersionRow[];
}
