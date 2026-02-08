import { createClient } from '@/lib/supabase/server';
import type { PreviewState, UpsertPreviewStateInput } from '@/lib/types/preview';

export async function getPreviewState(
  projectId: string
): Promise<PreviewState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('preview_states')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) throw error;
  return data as PreviewState | null;
}

export async function upsertPreviewState(
  input: UpsertPreviewStateInput
): Promise<PreviewState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('preview_states')
    .upsert(
      {
        project_id: input.project_id,
        device_width: input.device_width,
        page_type: input.page_type,
        resource_id: input.resource_id ?? null,
      },
      { onConflict: 'project_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data as PreviewState;
}
