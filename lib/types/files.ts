export type FileType = 'liquid' | 'javascript' | 'css' | 'other';

/** Full file record from database */
export interface FileData {
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

/** Request body for creating a file */
export interface CreateFileRequest {
  name: string;
  content: string;
  fileType?: FileType;
}

/** Request body for updating file (content or rename) */
export interface UpdateFileRequest {
  content?: string;
  name?: string;
}

/** Legacy input format - use CreateFileRequest for API */
export interface CreateFileInput {
  project_id: string;
  name: string;
  path: string;
  file_type: FileType;
  content: string;
  created_by: string;
}

export interface UpdateFileInput {
  name?: string;
  path?: string;
  content?: string;
}

export interface FileFilter {
  file_type?: FileType;
  search?: string;
}

/** Detect file type from extension */
export function detectFileTypeFromName(name: string): FileType {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'liquid') return 'liquid';
  if (ext === 'js' || ext === 'ts') return 'javascript';
  if (ext === 'css' || ext === 'scss') return 'css';
  return 'other';
}
