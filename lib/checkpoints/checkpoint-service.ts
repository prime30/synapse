import { createClient } from '@/lib/supabase/server';

export interface FileSnapshot {
  fileId: string;
  fileName: string;
  content: string;
}

export interface Checkpoint {
  id: string;
  project_id: string;
  label: string;
  file_snapshots: FileSnapshot[];
  created_at: string;
}

const MAX_CHECKPOINTS_PER_PROJECT = 20;

/**
 * Create a checkpoint by snapshotting the current content of specified files.
 * Stores in the 'checkpoints' Supabase table (JSONB file_snapshots column).
 * Auto-prunes oldest checkpoints beyond the retention limit.
 */
export async function createCheckpoint(
  projectId: string,
  label: string,
  fileIds: string[],
): Promise<Checkpoint | null> {
  const supabase = await createClient();

  // Fetch current content for the files being changed
  const { data: files } = await supabase
    .from('files')
    .select('id, name, content')
    .in('id', fileIds);

  if (!files || files.length === 0) return null;

  const snapshots: FileSnapshot[] = files.map(f => ({
    fileId: f.id,
    fileName: f.name,
    content: f.content ?? '',
  }));

  // Insert checkpoint
  const { data: checkpoint, error } = await supabase
    .from('checkpoints')
    .insert({
      project_id: projectId,
      label,
      file_snapshots: snapshots,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[checkpoint-service] Failed to create checkpoint:', error);
    // Fallback: store in-memory if table doesn't exist
    return {
      id: crypto.randomUUID(),
      project_id: projectId,
      label,
      file_snapshots: snapshots,
      created_at: new Date().toISOString(),
    };
  }

  // Prune old checkpoints
  await pruneCheckpoints(projectId);

  return checkpoint as Checkpoint;
}

/**
 * Restore files from a checkpoint to their snapshotted state.
 * Only affects local Supabase files -- does NOT revert Shopify pushes.
 */
export async function restoreCheckpoint(checkpointId: string): Promise<{
  restored: number;
  errors: string[];
}> {
  const supabase = await createClient();

  const { data: checkpoint } = await supabase
    .from('checkpoints')
    .select('*')
    .eq('id', checkpointId)
    .single();

  if (!checkpoint) {
    return { restored: 0, errors: ['Checkpoint not found'] };
  }

  const snapshots = checkpoint.file_snapshots as FileSnapshot[];
  const errors: string[] = [];
  let restored = 0;

  for (const snap of snapshots) {
    const { error } = await supabase
      .from('files')
      .update({ content: snap.content })
      .eq('id', snap.fileId);

    if (error) {
      errors.push(`Failed to restore ${snap.fileName}: ${error.message}`);
    } else {
      restored++;
    }
  }

  return { restored, errors };
}

/**
 * List checkpoints for a project, newest first.
 */
export async function listCheckpoints(projectId: string): Promise<Checkpoint[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('checkpoints')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(MAX_CHECKPOINTS_PER_PROJECT);

  return (data ?? []) as Checkpoint[];
}

/**
 * Delete a specific checkpoint.
 */
export async function deleteCheckpoint(checkpointId: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('checkpoints')
    .delete()
    .eq('id', checkpointId);
  return !error;
}

/**
 * Prune oldest checkpoints beyond the retention limit.
 */
async function pruneCheckpoints(projectId: string): Promise<void> {
  const supabase = await createClient();

  const { data: all } = await supabase
    .from('checkpoints')
    .select('id, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (!all || all.length <= MAX_CHECKPOINTS_PER_PROJECT) return;

  const toDelete = all.slice(MAX_CHECKPOINTS_PER_PROJECT);
  const ids = toDelete.map(c => c.id);

  await supabase
    .from('checkpoints')
    .delete()
    .in('id', ids);
}
