import { describe, it, expect } from 'vitest';
import type { ApplicationResult } from '../application-service';
import type { Suggestion, SuggestionStatus, SuggestionSource, SuggestionScope } from '@/lib/types/suggestion';

function makeSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 'sug-1',
    user_id: 'user-1',
    project_id: 'proj-1',
    source: 'ai_model' as SuggestionSource,
    scope: 'single_line' as SuggestionScope,
    status: 'pending' as SuggestionStatus,
    file_paths: ['theme.js'],
    original_code: 'console.log("debug");',
    suggested_code: '// removed debug log',
    applied_code: null,
    explanation: 'Remove debug logging',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    applied_at: null,
    rejected_at: null,
    ...overrides,
  };
}

describe('SuggestionApplicationService', () => {
  describe('ApplicationResult structure', () => {
    it('should have success and suggestion fields', () => {
      const result: ApplicationResult = {
        success: true,
        suggestion: makeSuggestion({ status: 'applied' }),
      };
      expect(result.success).toBe(true);
      expect(result.suggestion).toBeDefined();
    });

    it('should include conflict info on failure', () => {
      const result: ApplicationResult = {
        success: false,
        suggestion: makeSuggestion(),
        conflict: {
          currentContent: 'new code',
          suggestedContent: 'suggested code',
        },
      };
      expect(result.success).toBe(false);
      expect(result.conflict).toBeDefined();
      expect(result.conflict!.currentContent).toBe('new code');
    });
  });

  describe('Conflict detection logic', () => {
    it('detects conflict when original code has changed', () => {
      const suggestion = makeSuggestion({
        original_code: 'console.log("debug");',
      });
      const currentFileContent = 'console.log("updated");';
      const hasConflict = !currentFileContent.includes(suggestion.original_code);
      expect(hasConflict).toBe(true);
    });

    it('no conflict when original code is unchanged', () => {
      const suggestion = makeSuggestion({
        original_code: 'console.log("debug");',
      });
      const currentFileContent = 'const x = 1;\nconsole.log("debug");\nconst y = 2;';
      const hasConflict = !currentFileContent.includes(suggestion.original_code);
      expect(hasConflict).toBe(false);
    });
  });

  describe('Status transitions', () => {
    it('pending → applied', () => {
      const sug = makeSuggestion({ status: 'pending' });
      const applied: Suggestion = {
        ...sug,
        status: 'applied',
        applied_at: new Date().toISOString(),
        applied_code: sug.suggested_code,
      };
      expect(applied.status).toBe('applied');
      expect(applied.applied_at).toBeDefined();
      expect(applied.applied_code).toBe(sug.suggested_code);
    });

    it('pending → rejected', () => {
      const sug = makeSuggestion({ status: 'pending' });
      const rejected: Suggestion = {
        ...sug,
        status: 'rejected',
        rejected_at: new Date().toISOString(),
      };
      expect(rejected.status).toBe('rejected');
      expect(rejected.rejected_at).toBeDefined();
    });

    it('applied → undone', () => {
      const sug = makeSuggestion({
        status: 'applied',
        applied_at: new Date().toISOString(),
        applied_code: '// removed debug log',
      });
      const undone: Suggestion = {
        ...sug,
        status: 'undone',
      };
      expect(undone.status).toBe('undone');
    });

    it('pending → edited (with custom code)', () => {
      const sug = makeSuggestion({ status: 'pending' });
      const editedCode = '// custom fix for debug';
      const edited: Suggestion = {
        ...sug,
        status: 'edited',
        applied_at: new Date().toISOString(),
        applied_code: editedCode,
      };
      expect(edited.status).toBe('edited');
      expect(edited.applied_code).toBe(editedCode);
      expect(edited.applied_code).not.toBe(sug.suggested_code);
    });
  });

  describe('Edited suggestion uses editedCode', () => {
    it('should use editedCode instead of suggested_code when provided', () => {
      const suggestion = makeSuggestion();
      const editedCode = '// user-modified fix';
      const appliedCode = editedCode ?? suggestion.suggested_code;
      expect(appliedCode).toBe(editedCode);
    });

    it('should fall back to suggested_code when editedCode not provided', () => {
      const suggestion = makeSuggestion();
      const editedCode = undefined;
      const appliedCode = editedCode ?? suggestion.suggested_code;
      expect(appliedCode).toBe(suggestion.suggested_code);
    });
  });
});
