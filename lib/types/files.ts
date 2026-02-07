export type FileType = 'liquid' | 'javascript' | 'css' | 'other';

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
