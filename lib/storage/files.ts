import { createClient } from '@/lib/supabase/server';

const BUCKET = 'project-files';
const SIZE_THRESHOLD = 100 * 1024; // 100KB

export function shouldUseStorage(sizeBytes: number): boolean {
  return sizeBytes >= SIZE_THRESHOLD;
}

export async function uploadToStorage(
  projectId: string,
  filePath: string,
  content: string
): Promise<string> {
  const supabase = await createClient();
  const storagePath = `${projectId}/${filePath}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, content, {
      contentType: 'text/plain',
      upsert: true,
    });

  if (error) throw error;
  return storagePath;
}

export async function downloadFromStorage(storagePath: string): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath);

  if (error) throw error;
  return await data.text();
}

export async function deleteFromStorage(storagePath: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([storagePath]);

  if (error) throw error;
}
