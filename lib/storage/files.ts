import { createClient as createAnonClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const BUCKET = 'project-files';
const SIZE_THRESHOLD = 100 * 1024; // 100KB

async function getStorageClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
  }
  return createAnonClient();
}

export function shouldUseStorage(sizeBytes: number): boolean {
  return sizeBytes >= SIZE_THRESHOLD;
}

export async function uploadToStorage(
  projectId: string,
  filePath: string,
  content: string
): Promise<string> {
  const supabase = await getStorageClient();
  const storagePath = `${projectId}/${filePath}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, content, {
      contentType: 'text/plain',
      upsert: true,
    });

  if (error) {
    throw error;
  }
  return storagePath;
}

export async function downloadFromStorage(storagePath: string): Promise<string> {
  const supabase = await getStorageClient();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath);

  if (error) throw error;
  return await data.text();
}

export async function deleteFromStorage(storagePath: string): Promise<void> {
  const supabase = await getStorageClient();

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([storagePath]);

  if (error) throw error;
}
