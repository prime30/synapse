import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { VersionService } from '@/lib/versions/version-service';
import { ConflictDetector } from '@/lib/versions/conflict-detector';
import { updateFile } from '@/lib/services/files';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface RestoreBody {
  version_id: string;
  current_version_number: number;
}

const versionService = new VersionService();
const conflictDetector = new ConflictDetector();

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { id: fileId } = await params;
    const body = (await request.json()) as RestoreBody;

    if (!body.version_id || body.current_version_number === undefined) {
      throw APIError.badRequest('version_id and current_version_number are required');
    }

    // Check for conflicts
    const conflict = await conflictDetector.detectConflict(
      fileId,
      body.current_version_number
    );

    if (conflict) {
      const details = await conflictDetector.getConflictDetails(
        fileId,
        body.current_version_number
      );
      return NextResponse.json(
        { error: 'Version conflict detected', code: 'CONFLICT', details },
        { status: 409 }
      );
    }

    // Get the version to restore
    const version = await versionService.getVersion(body.version_id);

    if (!version) {
      throw APIError.notFound('Version not found');
    }

    // Update the file content
    await updateFile(fileId, { content: version.content });

    // Create a new version recording the restore
    const newVersion = await versionService.createVersion(
      fileId,
      version.content,
      userId,
      `Restored to version ${version.version_number}`
    );

    return successResponse(newVersion, 201);
  } catch (error) {
    return handleAPIError(error);
  }
}
