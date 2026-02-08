/**
 * Project context loader - REQ-5 TASK-1
 * Loads all project files from hybrid storage and assembles unified ProjectContext.
 */
import { createClient } from '@/lib/supabase/server';
import type { ProjectContext, FileContext } from './types';

const MAX_FILES = 100;
const LOAD_TIMEOUT_MS = 10000;

export class ProjectContextLoader {
  async loadProjectContext(projectId: string): Promise<ProjectContext> {
    const files = await this.loadAllFiles(projectId);
    const totalSizeBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);

    return {
      projectId,
      files,
      dependencies: [], // Filled by DependencyDetector (Task 2)
      loadedAt: new Date(),
      totalSizeBytes,
    };
  }

  async loadAllFiles(projectId: string): Promise<FileContext[]> {
    const supabase = await createClient();

    // Query all files for project
    const { data: files, error } = await supabase
      .from('files')
      .select('id, name, file_type, content, storage_path, size_bytes, updated_at')
      .eq('project_id', projectId)
      .order('name', { ascending: true });

    if (error) throw error;
    if (!files) return [];

    this.validateFileLimit(files.length);

    // Load content in parallel with timeout
    const loadPromises = files.map((file) => this.loadFileContent(file, supabase));

    const results = await Promise.race([
      Promise.all(loadPromises),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Context loading timed out')), LOAD_TIMEOUT_MS)
      ),
    ]);

    return results;
  }

  validateFileLimit(fileCount: number): void {
    if (fileCount > MAX_FILES) {
      throw new Error(`Project has too many files (>100). Found ${fileCount} files.`);
    }
  }

  private async loadFileContent(
    file: {
      id: string;
      name: string;
      file_type: string;
      content: string | null;
      storage_path: string | null;
      size_bytes: number;
      updated_at: string;
    },
    supabase: Awaited<ReturnType<typeof createClient>>
  ): Promise<FileContext> {
    let content = file.content ?? '';

    if (!content && file.storage_path) {
      const { data: blob, error: downloadError } = await supabase.storage
        .from('project-files')
        .download(file.storage_path);

      if (downloadError) {
        console.warn(`Failed to load file ${file.name} from storage: ${downloadError.message}`);
        content = '';
      } else {
        content = await blob!.text();
      }
    }

    return {
      fileId: file.id,
      fileName: file.name,
      fileType: file.file_type as FileContext['fileType'],
      content,
      sizeBytes: file.size_bytes,
      lastModified: new Date(file.updated_at),
      dependencies: {
        imports: [],
        exports: [],
        usedBy: [],
      },
    };
  }
}
