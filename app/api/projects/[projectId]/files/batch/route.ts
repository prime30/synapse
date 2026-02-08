import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { createFile } from '@/lib/services/files';
import { detectFileTypeFromName, type FileType } from '@/lib/types/files';
import { APIError } from '@/lib/errors/handler';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_NAME_LENGTH = 255;
const VALID_EXTENSIONS = /\.(liquid|js|ts|css|scss)$/i;

interface BatchFileInput {
  name: string;
  content: string;
}

interface BatchResult {
  files: Array<{ id: string; name: string; file_type: string; size_bytes: number }>;
  errors: Array<{ name: string; error: string }>;
}

function validateBatchFile(file: unknown, index: number): BatchFileInput {
  if (!file || typeof file !== 'object') {
    throw APIError.badRequest(`File ${index + 1}: invalid format`);
  }
  const { name, content } = file as Record<string, unknown>;
  if (!name || typeof name !== 'string') {
    throw APIError.badRequest(`File ${index + 1}: name is required`);
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw APIError.badRequest(`File ${index + 1}: name too long`);
  }
  if (!name.includes('.')) {
    throw APIError.badRequest(`File ${index + 1}: name must include extension`);
  }
  if (!VALID_EXTENSIONS.test(name)) {
    throw APIError.badRequest(
      `File ${index + 1}: only .liquid, .js, .ts, .css, .scss allowed`
    );
  }
  if (content === undefined || content === null) {
    throw APIError.badRequest(`File ${index + 1}: content is required`);
  }
  if (typeof content !== 'string') {
    throw APIError.badRequest(`File ${index + 1}: content must be string`);
  }
  const sizeBytes = new TextEncoder().encode(content).length;
  if (sizeBytes > MAX_FILE_SIZE) {
    throw APIError.badRequest(`File ${index + 1}: exceeds 10MB limit`);
  }
  if (content.length === 0) {
    throw APIError.badRequest(`File ${index + 1}: cannot upload empty file`);
  }
  return { name, content };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const userId = await requireProjectAccess(request, projectId);

    const body = await request.json();
    const filesInput = body.files;
    if (!Array.isArray(filesInput) || filesInput.length === 0) {
      throw APIError.badRequest('files array is required and must not be empty');
    }

    const result: BatchResult = { files: [], errors: [] };

    for (let i = 0; i < filesInput.length; i++) {
      try {
        const { name, content } = validateBatchFile(filesInput[i], i);
        const fileType = detectFileTypeFromName(name) as FileType;

        const file = await createFile({
          project_id: projectId,
          name,
          path: name,
          file_type: fileType,
          content,
          created_by: userId,
        });

        result.files.push({
          id: file.id,
          name: file.name,
          file_type: file.file_type,
          size_bytes: file.size_bytes,
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Unknown error';
        result.errors.push({ name: (filesInput[i] as { name?: string })?.name ?? `file ${i + 1}`, error: msg });
      }
    }

    return successResponse(result, 201);
  } catch (error) {
    return handleAPIError(error);
  }
}
