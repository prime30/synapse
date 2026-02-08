export interface FileVersion {
  id: string;
  file_id: string;
  version_number: number;
  content: string;
  metadata: Record<string, unknown>;
  structure: Record<string, unknown>;
  relationships: Record<string, unknown>;
  created_by: string;
  created_at: string;
  change_summary: string | null;
  parent_version_id: string | null;
}

export interface VersionMetadata {
  sizeBytes: number;
  lineCount: number;
  changeType: 'create' | 'edit' | 'restore';
}

export interface VersionChain {
  fileId: string;
  versions: FileVersion[];
  currentVersion: number;
}
