import { createClient } from '@/lib/supabase/server';
import { assignUserColor } from './user-colors';

export interface PresenceUpdateInput {
  project_id: string;
  user_id: string;
  file_path?: string | null;
  cursor_position?: Record<string, unknown> | null;
  state?: 'active' | 'idle' | 'offline';
}

export async function upsertPresence(input: PresenceUpdateInput) {
  const supabase = await createClient();
  const color = assignUserColor(input.user_id);

  const { data, error } = await supabase
    .from('user_presence')
    .upsert(
      {
        project_id: input.project_id,
        user_id: input.user_id,
        file_path: input.file_path ?? null,
        cursor_position: input.cursor_position ?? null,
        state: input.state ?? 'active',
        color,
        last_active_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,user_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listPresence(projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_presence')
    .select('*')
    .eq('project_id', projectId)
    .order('last_active_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
