import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { getFile } from '@/lib/services/files';
import { AISuggestionGenerator } from '@/lib/suggestions/ai-generator';
import { StaticRuleEngine } from '@/lib/suggestions/static-rules';
import { SuggestionBuilder } from '@/lib/suggestions/suggestion-builder';
import { createClient } from '@/lib/supabase/server';
import { APIError } from '@/lib/errors/handler';

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();

    if (!body.fileId || typeof body.fileId !== 'string') {
      throw APIError.badRequest('fileId is required');
    }
    if (!body.projectId || typeof body.projectId !== 'string') {
      throw APIError.badRequest('projectId is required');
    }

    const { fileId, projectId } = body;

    // Get file content
    const file = await getFile(fileId);
    if (file.project_id !== projectId) {
      throw APIError.badRequest('File does not belong to the specified project');
    }

    const content = file.content || '';
    const fileName = file.name;
    const fileType = file.file_type;

    // Generate AI suggestions
    const aiGenerator = new AISuggestionGenerator();
    const aiSuggestions = await aiGenerator.generateSuggestions(
      fileId,
      fileName,
      content,
      fileType,
      projectId,
    );

    // Generate static rule suggestions
    const staticEngine = new StaticRuleEngine();
    const ruleViolations = staticEngine.analyzeFile(content, fileType, fileName);

    // Add user_id to AI suggestions and ensure file_paths uses full path
    const aiPartialSuggestions = aiSuggestions.map((s) => ({
      ...s,
      user_id: userId,
      file_paths: [file.path], // Use full file path
    }));

    // Convert rule violations to Partial<Suggestion> format
    const staticPartialSuggestions = ruleViolations.map((violation) =>
      SuggestionBuilder.fromRuleViolation(
        violation,
        userId,
        projectId,
        file.path,
      ),
    );

    // Combine and store in database
    const allSuggestions = [...aiPartialSuggestions, ...staticPartialSuggestions];
    const supabase = await createClient();

    if (allSuggestions.length === 0) {
      return successResponse({ suggestionIds: [] });
    }

    const { data: inserted, error } = await supabase
      .from('suggestions')
      .insert(allSuggestions)
      .select('id');

    if (error) {
      throw APIError.internal(`Failed to store suggestions: ${error.message}`);
    }

    const suggestionIds = inserted?.map((s) => s.id) || [];

    return successResponse({ suggestionIds }, 201);
  } catch (error) {
    return handleAPIError(error);
  }
}
