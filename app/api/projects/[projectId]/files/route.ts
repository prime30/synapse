import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { listProjectFiles, listProjectFilesWithContent, createFile } from '@/lib/services/files';
import {
  detectFileTypeFromName,
  type FileType,
  type CreateFileRequest,
} from '@/lib/types/files';
import { APIError } from '@/lib/errors/handler';
import { resolveProjectSlug, writeFileToDisk, isLocalSyncEnabled } from '@/lib/sync/disk-sync';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_NAME_LENGTH = 255;

function validateCreateRequest(body: unknown): CreateFileRequest {
  if (!body || typeof body !== 'object') {
    throw APIError.badRequest('Request body is required');
  }
  const { name, content, fileType } = body as Record<string, unknown>;
  if (!name || typeof name !== 'string') {
    throw APIError.badRequest('File name is required');
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw APIError.badRequest(`File name must be at most ${MAX_NAME_LENGTH} characters`);
  }
  if (!name.includes('.')) {
    throw APIError.badRequest('File name must include extension');
  }
  if (content === undefined || content === null) {
    throw APIError.badRequest('File content is required');
  }
  if (typeof content !== 'string') {
    throw APIError.badRequest('File content must be a string');
  }
  const sizeBytes = new TextEncoder().encode(content).length;
  if (sizeBytes > MAX_FILE_SIZE) {
    throw APIError.badRequest('File exceeds 10MB limit');
  }
  if (content.length === 0) {
    throw APIError.badRequest('Cannot upload empty file');
  }
  const resolvedFileType = (fileType as FileType) ?? detectFileTypeFromName(name);
  const validTypes: FileType[] = ['liquid', 'javascript', 'css', 'other'];
  if (!validTypes.includes(resolvedFileType)) {
    throw APIError.badRequest('Invalid file type');
  }
  return { name, content, fileType: resolvedFileType };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const searchParams = request.nextUrl.searchParams;
    const fileType = searchParams.get('file_type') as FileType | null;
    const search = searchParams.get('search');
    const includeContent = searchParams.get('include_content') === 'true';

    const filter = {
      file_type: fileType ?? undefined,
      search: search ?? undefined,
    };

    if (includeContent) {
      const files = await listProjectFilesWithContent(projectId, filter);
      return successResponse(files);
    }

    const files = await listProjectFiles(projectId, filter);
    return successResponse(files);
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const userId = await requireProjectAccess(request, projectId);

    const body = await request.json();
    const { name, content, fileType } = validateCreateRequest(body);

    const file = await createFile({
      project_id: projectId,
      name,
      path: name,
      file_type: fileType!,
      content,
      created_by: userId,
    });

    // Fire-and-forget: sync new file to disk
    if (isLocalSyncEnabled()) {
      resolveProjectSlug(projectId).then((slug) =>
        writeFileToDisk(slug, name, content),
      ).catch(() => {});
    }

    return successResponse(file, 201);
  } catch (error) {
    return handleAPIError(error);
  }
}
