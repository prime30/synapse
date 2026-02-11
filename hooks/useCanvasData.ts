/**
 * Hook to fetch theme dependency graph data for the spatial canvas.
 * Calls the /api/projects/[projectId]/dependencies endpoint.
 *
 * EPIC 15: Spatial Canvas
 */

import { useQuery } from '@tanstack/react-query';
import type { FileContext, FileDependency } from '@/lib/context/types';

interface CanvasFileDTO {
  fileId: string;
  fileName: string;
  fileType: 'liquid' | 'javascript' | 'css' | 'other';
  sizeBytes: number;
  lastModified: string;
}

interface DependenciesResponse {
  files: CanvasFileDTO[];
  dependencies: FileDependency[];
}

/**
 * Convert the API response DTOs to the FileContext shape expected
 * by the canvas data provider. Content is empty since the canvas
 * only needs metadata for rendering nodes.
 */
function toFileContext(dto: CanvasFileDTO): FileContext {
  return {
    fileId: dto.fileId,
    fileName: dto.fileName,
    fileType: dto.fileType,
    content: '', // Canvas doesn't need content
    sizeBytes: dto.sizeBytes,
    lastModified: new Date(dto.lastModified),
    dependencies: { imports: [], exports: [], usedBy: [] },
  };
}

export function useCanvasData(projectId: string | null) {
  const query = useQuery({
    queryKey: ['canvas-dependencies', projectId],
    queryFn: async (): Promise<{
      files: FileContext[];
      dependencies: FileDependency[];
    }> => {
      if (!projectId) return { files: [], dependencies: [] };

      const res = await fetch(
        `/api/projects/${projectId}/dependencies`
      );
      if (!res.ok) {
        throw new Error('Failed to fetch dependency graph');
      }

      const data = (await res.json()) as DependenciesResponse;

      return {
        files: data.files.map(toFileContext),
        dependencies: data.dependencies,
      };
    },
    enabled: !!projectId,
    staleTime: 60_000, // Cache for 1 minute
    refetchOnWindowFocus: false,
  });

  return {
    files: query.data?.files ?? [],
    dependencies: query.data?.dependencies ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
