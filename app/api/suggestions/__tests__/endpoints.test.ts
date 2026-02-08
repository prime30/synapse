import { describe, it, expect } from 'vitest';
import type {
  Suggestion,
  SuggestionSource,
  SuggestionScope,
  SuggestionStatus,
} from '@/lib/types/suggestion';
import type { ApplicationResult } from '@/lib/suggestions/application-service';

describe('Suggestion API Endpoints', () => {
  describe('Suggestion type structure', () => {
    it('should have all required fields', () => {
      const suggestion: Suggestion = {
        id: 'test-id',
        user_id: 'user-id',
        project_id: 'project-id',
        source: 'ai_model',
        scope: 'single_line',
        status: 'pending',
        file_paths: ['path/to/file.ts'],
        original_code: 'const x = 1;',
        suggested_code: 'const x = 1; // improved',
        applied_code: null,
        explanation: 'Test explanation',
        created_at: '2024-01-01T00:00:00Z',
        applied_at: null,
        rejected_at: null,
        updated_at: '2024-01-01T00:00:00Z',
      };

      expect(suggestion.id).toBe('test-id');
      expect(suggestion.user_id).toBe('user-id');
      expect(suggestion.project_id).toBe('project-id');
      expect(suggestion.source).toBe('ai_model');
      expect(suggestion.scope).toBe('single_line');
      expect(suggestion.status).toBe('pending');
      expect(suggestion.file_paths).toEqual(['path/to/file.ts']);
      expect(suggestion.original_code).toBe('const x = 1;');
      expect(suggestion.suggested_code).toBe('const x = 1; // improved');
      expect(suggestion.applied_code).toBeNull();
      expect(suggestion.explanation).toBe('Test explanation');
      expect(suggestion.created_at).toBe('2024-01-01T00:00:00Z');
      expect(suggestion.applied_at).toBeNull();
      expect(suggestion.rejected_at).toBeNull();
      expect(suggestion.updated_at).toBe('2024-01-01T00:00:00Z');
    });

    it('should accept all valid source types', () => {
      const sources: SuggestionSource[] = ['ai_model', 'static_rule', 'hybrid'];
      sources.forEach((source) => {
        const suggestion: Suggestion = {
          id: 'test-id',
          user_id: 'user-id',
          project_id: 'project-id',
          source,
          scope: 'single_line',
          status: 'pending',
          file_paths: [],
          original_code: '',
          suggested_code: '',
          applied_code: null,
          explanation: '',
          created_at: '2024-01-01T00:00:00Z',
          applied_at: null,
          rejected_at: null,
          updated_at: '2024-01-01T00:00:00Z',
        };
        expect(suggestion.source).toBe(source);
      });
    });

    it('should accept all valid scope types', () => {
      const scopes: SuggestionScope[] = [
        'single_line',
        'multi_line',
        'multi_file',
      ];
      scopes.forEach((scope) => {
        const suggestion: Suggestion = {
          id: 'test-id',
          user_id: 'user-id',
          project_id: 'project-id',
          source: 'ai_model',
          scope,
          status: 'pending',
          file_paths: [],
          original_code: '',
          suggested_code: '',
          applied_code: null,
          explanation: '',
          created_at: '2024-01-01T00:00:00Z',
          applied_at: null,
          rejected_at: null,
          updated_at: '2024-01-01T00:00:00Z',
        };
        expect(suggestion.scope).toBe(scope);
      });
    });
  });

  describe('ApplicationResult structure', () => {
    it('should have success field and suggestion', () => {
      const result: ApplicationResult = {
        success: true,
        suggestion: {
          id: 'test-id',
          status: 'applied',
        },
      };

      expect(result.success).toBe(true);
      expect(result.suggestion).toBeDefined();
      expect(result.suggestion.id).toBe('test-id');
      expect(result.suggestion.status).toBe('applied');
    });

    it('should include conflict info when applicable', () => {
      const result: ApplicationResult = {
        success: false,
        suggestion: {
          id: 'test-id',
          status: 'pending',
        },
        conflict: {
          currentContent: 'current code',
          suggestedContent: 'suggested code',
        },
      };

      expect(result.success).toBe(false);
      expect(result.conflict).toBeDefined();
      expect(result.conflict?.currentContent).toBe('current code');
      expect(result.conflict?.suggestedContent).toBe('suggested code');
    });

    it('should allow optional conflict field', () => {
      const result: ApplicationResult = {
        success: true,
        suggestion: {
          id: 'test-id',
          status: 'applied',
        },
      };

      expect(result.conflict).toBeUndefined();
    });
  });

  describe('SuggestionStatus enum values', () => {
    it('should accept all valid status values', () => {
      const statuses: SuggestionStatus[] = [
        'pending',
        'applied',
        'rejected',
        'edited',
        'undone',
      ];

      statuses.forEach((status) => {
        const suggestion: Suggestion = {
          id: 'test-id',
          user_id: 'user-id',
          project_id: 'project-id',
          source: 'ai_model',
          scope: 'single_line',
          status,
          file_paths: [],
          original_code: '',
          suggested_code: '',
          applied_code: null,
          explanation: '',
          created_at: '2024-01-01T00:00:00Z',
          applied_at: null,
          rejected_at: null,
          updated_at: '2024-01-01T00:00:00Z',
        };
        expect(suggestion.status).toBe(status);
      });
    });

    it('should have exactly 5 status values', () => {
      const statuses: SuggestionStatus[] = [
        'pending',
        'applied',
        'rejected',
        'edited',
        'undone',
      ];
      expect(statuses.length).toBe(5);
    });
  });
});
