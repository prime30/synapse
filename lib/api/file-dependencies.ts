/**
 * Fetches the file dependency graph for a project.
 * GET /api/projects/[projectId]/dependencies
 *
 * Note: The route is at /api/projects/[projectId]/dependencies (not files/dependencies).
 */

export interface FileDependencyItem {
  fileId: string;
  fileName: string;
  fileType: string;
  sizeBytes: number;
  lastModified: string;
}

export interface DependencyGraphResponse {
  files: FileDependencyItem[];
  dependencies: Array<{
    sourceFileId: string;
    targetFileId: string;
    dependencyType: string;
    references: Array<{ symbol: string; context: string }>;
  }>;
}

export async function fetchFileDependencies(
  projectId: string
): Promise<DependencyGraphResponse> {
  const res = await fetch(`/api/projects/${projectId}/dependencies`);
  if (!res.ok) throw new Error('Failed to fetch dependencies');
  return res.json();
}
