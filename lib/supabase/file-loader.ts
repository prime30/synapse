import { createClient } from '@/lib/supabase/server';
import type { FileContext } from '@/lib/types/agent';

/**
 * Metadata-only file representation (no content loaded).
 * Used for the initial fast query before ContextEngine selection.
 */
export interface FileMetadataRow {
  id: string;
  name: string;
  path: string | null;
  file_type: string;
  /** Approximate size of content in characters. */
  size_chars: number;
}

/**
 * Load file metadata (without content) for all files in a project.
 * This is the "Phase 1" fast query (~50KB for 150 files).
 */
export async function loadFileMetadata(projectId: string): Promise<FileMetadataRow[]> {
  const supabase = await createClient();
  // Use length(content) to get size without loading content
  const { data, error } = await supabase
    .rpc('get_file_metadata', { p_project_id: projectId })
    .select('*');

  if (error || !data) {
    // Fallback: load with content and extract metadata
    console.warn('[file-loader] RPC not available, falling back to full load for metadata');
    const { data: files } = await supabase
      .from('files')
      .select('id, name, path, file_type, content')
      .eq('project_id', projectId);

    return (files ?? []).map(f => ({
      id: f.id,
      name: f.name,
      path: f.path,
      file_type: f.file_type,
      size_chars: (f.content ?? '').length,
    }));
  }

  return data as FileMetadataRow[];
}

/**
 * Load full content for a specific set of files by ID.
 * This is the "Phase 2" targeted query (~200KB for 10 files).
 */
export async function loadFileContent(fileIds: string[]): Promise<Map<string, string>> {
  if (fileIds.length === 0) return new Map();

  const supabase = await createClient();
  const { data } = await supabase
    .from('files')
    .select('id, content')
    .in('id', fileIds);

  const contentMap = new Map<string, string>();
  for (const file of data ?? []) {
    contentMap.set(file.id, file.content ?? '');
  }
  return contentMap;
}

/**
 * Convert metadata rows to FileContext objects with stub content.
 * Content is replaced with a size stub until loaded on-demand.
 */
export function metadataToFileContexts(rows: FileMetadataRow[]): FileContext[] {
  return rows.map(r => ({
    fileId: r.id,
    fileName: r.name,
    fileType: r.file_type as 'liquid' | 'javascript' | 'css' | 'other',
    content: `[${r.size_chars} chars — content not yet loaded]`,
    path: r.path ?? undefined,
  }));
}

/**
 * Hydrate FileContext objects with actual content from a content map.
 * Files not in the map keep their stub content.
 */
export function hydrateFileContexts(
  contexts: FileContext[],
  contentMap: Map<string, string>,
): FileContext[] {
  return contexts.map(fc => {
    const content = contentMap.get(fc.fileId);
    return content !== undefined ? { ...fc, content } : fc;
  });
}

/**
 * Synchronous content hydrator function type.
 * Returns FileContext[] with real content for the requested IDs.
 * Files not found in the content map are returned with stub content.
 */
export type LoadContentFn = (fileIds: string[]) => FileContext[];

/**
 * Convenience helper: hydrate ALL files with real content via `loadContent`.
 * Used by search tools (grep) that need to scan every file's content.
 */
export function loadAllContent(
  files: FileContext[],
  loadContent: LoadContentFn,
): FileContext[] {
  const allFileIds = files.map(f => f.fileId);
  return loadContent(allFileIds);
}

/**
 * Full loader: fetches all files from Supabase, stores content in an in-memory Map,
 * and returns stubs (no content) for downstream consumers. Content is only provided
 * on-demand via the `loadContent` hydrator function.
 *
 * This ensures no downstream code path accidentally receives all 602 files with
 * full content — they must explicitly request content for specific file IDs.
 */
export async function loadProjectFiles(
  projectId: string,
  /** Optional Supabase client override — use the service client when called from
   *  API routes that may receive Bearer-token auth (no cookies). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
): Promise<{
  allFiles: FileContext[];
  loadContent: LoadContentFn;
}> {
  const supabase = supabaseClient ?? await createClient();

  const { data: files } = await supabase
    .from('files')
    .select('id, name, path, file_type, content')
    .eq('project_id', projectId);

  // Build in-memory content map (kept in closure, never exposed directly)
  const contentMap = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allFiles: FileContext[] = (files ?? []).map((f: any) => {
    const content = f.content ?? '';
    contentMap.set(f.id, content);
    return {
      fileId: f.id,
      fileName: f.name,
      fileType: f.file_type as 'liquid' | 'javascript' | 'css' | 'other',
      content: `[${content.length} chars]`, // STUB — no real content
      path: f.path ?? undefined,
    };
  });

  /**
   * Hydrate specific files with real content from the in-memory map.
   * Files whose IDs are not found get a warning log and keep stub content.
   */
  const loadContent: LoadContentFn = (fileIds: string[]): FileContext[] => {
    const idSet = new Set(fileIds);
    const result: FileContext[] = [];

    for (const stub of allFiles) {
      if (!idSet.has(stub.fileId)) continue;
      const realContent = contentMap.get(stub.fileId);
      if (realContent !== undefined) {
        result.push({ ...stub, content: realContent });
      } else {
        console.warn(`[file-loader] loadContent: ID ${stub.fileId} not in content map`);
        result.push(stub);
      }
    }

    const hydratedChars = result.reduce((s, f) => s + f.content.length, 0);
    console.log(`[file-loader] loadContent: hydrated ${result.length}/${fileIds.length} files (${hydratedChars} chars)`);

    return result;
  };

  return { allFiles, loadContent };
}
