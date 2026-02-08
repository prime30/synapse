import { createClient } from '@/lib/supabase/server';
import { getFile, updateFile } from '@/lib/services/files';
import type { Suggestion, SuggestionStatus } from '@/lib/types/suggestion';

export interface ApplicationResult {
  success: boolean;
  suggestion: Partial<Suggestion>;
  conflict?: { currentContent: string; suggestedContent: string };
}

export class SuggestionApplicationService {
  /**
   * Apply a suggestion to a file.
   * @param suggestionId - The ID of the suggestion to apply
   * @param editedCode - Optional edited code to apply instead of suggested_code
   * @returns ApplicationResult with success status and conflict info if applicable
   */
  async applySuggestion(
    suggestionId: string,
    editedCode?: string,
  ): Promise<ApplicationResult> {
    const supabase = await createClient();

    // 1. Get suggestion from DB
    const suggestion = await this.getSuggestion(suggestionId);
    if (!suggestion) {
      throw new Error(`Suggestion ${suggestionId} not found`);
    }

    // 2. Get current file content
    // For now, handle single-file suggestions (first file_path)
    // Multi-file support would require more complex logic
    if (suggestion.file_paths.length === 0) {
      throw new Error('Suggestion has no file paths');
    }

    const filePath = suggestion.file_paths[0];
    const { data: fileRecord, error: fileError } = await supabase
      .from('files')
      .select('id, content, storage_path')
      .eq('project_id', suggestion.project_id)
      .eq('path', filePath)
      .single();

    if (fileError || !fileRecord) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Get full file content (handles storage_path)
    const file = await getFile(fileRecord.id);
    const currentContent = file.content || '';

    // 3. Check if file changed since suggestion created (compare original_code with current)
    // For conflict detection, we check if the original_code still exists in the file
    // This is a simple check - in production, you might want more sophisticated diff logic
    // If original_code is not found in current content, the file has changed = conflict
    const hasConflict = !currentContent.includes(suggestion.original_code);
    
    // Early return if conflict detected - don't update file
    if (hasConflict) {
      const codeToApply = editedCode || suggestion.suggested_code;
      return {
        success: false,
        suggestion: {
          id: suggestion.id,
          status: suggestion.status,
        },
        conflict: {
          currentContent,
          suggestedContent: codeToApply,
        },
      };
    }

    // 4. Apply code: use editedCode if provided, otherwise suggested_code
    const codeToApply = editedCode || suggestion.suggested_code;
    const newStatus: SuggestionStatus = editedCode ? 'edited' : 'applied';

    // Replace original_code with codeToApply in the file content
    // Simple string replacement - replaces first occurrence
    // Note: This assumes original_code appears exactly once. For production, consider more sophisticated diff/merge logic
    const updatedContent = currentContent.replace(
      suggestion.original_code,
      codeToApply,
    );

    // 5. Update file via updateFile()
    await updateFile(fileRecord.id, { content: updatedContent });

    // 6. Update suggestion status to 'applied' (or 'edited' if editedCode), set applied_at, applied_code
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('suggestions')
      .update({
        status: newStatus,
        applied_at: now,
        applied_code: codeToApply,
      })
      .eq('id', suggestionId);

    if (updateError) {
      throw new Error(`Failed to update suggestion: ${updateError.message}`);
    }

    // 7. Return success
    return {
      success: true,
      suggestion: {
        id: suggestion.id,
        status: newStatus,
        applied_code: codeToApply,
        applied_at: now,
      },
    };
  }

  /**
   * Reject a suggestion.
   * @param suggestionId - The ID of the suggestion to reject
   */
  async rejectSuggestion(suggestionId: string): Promise<void> {
    const supabase = await createClient();

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('suggestions')
      .update({
        status: 'rejected',
        rejected_at: now,
      })
      .eq('id', suggestionId);

    if (error) {
      throw new Error(`Failed to reject suggestion: ${error.message}`);
    }
  }

  /**
   * Undo a previously applied suggestion.
   * @param suggestionId - The ID of the suggestion to undo
   */
  async undoSuggestion(suggestionId: string): Promise<void> {
    const supabase = await createClient();

    // Get suggestion
    const suggestion = await this.getSuggestion(suggestionId);
    if (!suggestion) {
      throw new Error(`Suggestion ${suggestionId} not found`);
    }

    if (suggestion.status !== 'applied' && suggestion.status !== 'edited') {
      throw new Error(
        `Cannot undo suggestion with status: ${suggestion.status}`,
      );
    }

    // Get file
    if (suggestion.file_paths.length === 0) {
      throw new Error('Suggestion has no file paths');
    }

    const filePath = suggestion.file_paths[0];
    const { data: fileRecord, error: fileError } = await supabase
      .from('files')
      .select('id, content, storage_path')
      .eq('project_id', suggestion.project_id)
      .eq('path', filePath)
      .single();

    if (fileError || !fileRecord) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Get current file content
    const file = await getFile(fileRecord.id);
    const currentContent = file.content || '';

    // Restore original_code to file
    // Replace applied_code (or suggested_code if applied_code is null) with original_code
    const codeToReplace =
      suggestion.applied_code || suggestion.suggested_code;
    const restoredContent = currentContent.replace(
      codeToReplace,
      suggestion.original_code,
    );

    // Update file
    await updateFile(fileRecord.id, { content: restoredContent });

    // Update suggestion status to 'undone'
    const { error: updateError } = await supabase
      .from('suggestions')
      .update({
        status: 'undone',
      })
      .eq('id', suggestionId);

    if (updateError) {
      throw new Error(`Failed to undo suggestion: ${updateError.message}`);
    }
  }

  /**
   * Get a suggestion by ID.
   * @param suggestionId - The ID of the suggestion
   * @returns The suggestion or null if not found
   */
  async getSuggestion(suggestionId: string): Promise<Suggestion | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('suggestions')
      .select('*')
      .eq('id', suggestionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null;
      }
      throw new Error(`Failed to get suggestion: ${error.message}`);
    }

    return data as Suggestion;
  }

  /**
   * List suggestions for a project, optionally filtered by status.
   * @param projectId - The project ID
   * @param status - Optional status filter
   * @param limit - Optional limit on number of results
   * @param offset - Optional offset for pagination
   * @returns Array of suggestions
   */
  async listSuggestions(
    projectId: string,
    status?: SuggestionStatus,
    limit?: number,
    offset?: number,
  ): Promise<Suggestion[]> {
    const supabase = await createClient();

    let query = supabase
      .from('suggestions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (limit !== undefined) {
      query = query.limit(limit);
    }

    if (offset !== undefined) {
      query = query.range(offset, offset + (limit || 100) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list suggestions: ${error.message}`);
    }

    return (data || []) as Suggestion[];
  }
}
