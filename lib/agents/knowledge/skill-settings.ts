/**
 * Skill settings — fetches and updates project-level skill enable/disable state.
 */

import { createServiceClient } from '@/lib/supabase/admin';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

/**
 * Get the set of skill IDs that are disabled for a project.
 * Used by the coordinator to exclude disabled skills from knowledge matching.
 */
export async function getDisabledSkillIds(projectId: string): Promise<Set<string>> {
  try {
    const supabase = createServiceClient();
    const settings = await getSkillSettings(supabase, projectId);
    const disabled = new Set<string>();
    for (const [id, enabled] of Object.entries(settings)) {
      if (enabled === false) disabled.add(id);
    }
    return disabled;
  } catch {
    return new Set();
  }
}

/**
 * Get skill enable/disable settings for a project.
 */
export async function getSkillSettings(
  supabase: SupabaseClient,
  projectId: string
): Promise<Record<string, boolean>> {
  const { data } = await (supabase as SupabaseClient)
    .from('project_settings')
    .select('settings')
    .eq('project_id', projectId)
    .eq('category', 'skills')
    .maybeSingle();

  return (data?.settings as Record<string, boolean> | null) ?? {};
}

/**
 * Update a single skill's enabled state.
 */
export async function upsertSkillSetting(
  supabase: SupabaseClient,
  projectId: string,
  skillId: string,
  enabled: boolean
): Promise<void> {
  const current = await getSkillSettings(supabase, projectId);
  const next = { ...current, [skillId]: enabled };

  const { error } = await (supabase as SupabaseClient).from('project_settings').upsert(
    {
      project_id: projectId,
      category: 'skills',
      settings: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id,category' }
  );

  if (error) throw error;
}
