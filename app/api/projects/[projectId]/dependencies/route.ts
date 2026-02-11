/**
 * GET /api/projects/[projectId]/dependencies
 *
 * Returns the theme's file dependency graph for the spatial canvas.
 * Uses ProjectContextLoader to load files and DependencyDetector to
 * compute cross-file dependencies server-side.
 *
 * EPIC 15: Spatial Canvas
 */

import { NextResponse, type NextRequest } from 'next/server';
import { ProjectContextLoader } from '@/lib/context/loader';
import { DependencyDetector } from '@/lib/context/detector';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  if (!projectId) {
    return NextResponse.json(
      { error: 'Missing projectId' },
      { status: 400 }
    );
  }

  try {
    const loader = new ProjectContextLoader();
    const context = await loader.loadProjectContext(projectId);

    const detector = new DependencyDetector();
    const dependencies = detector.detectDependencies(context.files);

    // Return minimal file metadata + full dependencies
    const files = context.files.map((f) => ({
      fileId: f.fileId,
      fileName: f.fileName,
      fileType: f.fileType,
      sizeBytes: f.sizeBytes,
      lastModified: f.lastModified.toISOString(),
    }));

    return NextResponse.json({
      files,
      dependencies,
    });
  } catch (err) {
    console.error('[dependencies] Failed to load dependency graph:', err);
    return NextResponse.json(
      { error: 'Failed to compute dependencies' },
      { status: 500 }
    );
  }
}
