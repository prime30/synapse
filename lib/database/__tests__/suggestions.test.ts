import { describe, it, expect } from 'vitest';
import type {
  Suggestion,
  SuggestionSource,
  SuggestionScope,
  SuggestionStatus,
} from '../../types/suggestion';

describe('Suggestion Types', () => {
  describe('Suggestion', () => {
    it('should have correct fields', () => {
      const suggestion: Suggestion = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: '123e4567-e89b-12d3-a456-426614174001',
        project_id: '123e4567-e89b-12d3-a456-426614174002',
        source: 'ai_model',
        scope: 'single_line',
        status: 'pending',
        file_paths: ['src/file.ts'],
        original_code: 'const x = 1;',
        suggested_code: 'const x = 2;',
        applied_code: null,
        explanation: 'Update value to 2',
        created_at: '2026-02-07T00:00:00Z',
        applied_at: null,
        rejected_at: null,
        updated_at: '2026-02-07T00:00:00Z',
      };

      expect(suggestion.id).toBeDefined();
      expect(suggestion.user_id).toBeDefined();
      expect(suggestion.project_id).toBeDefined();
      expect(suggestion.source).toBeDefined();
      expect(suggestion.scope).toBeDefined();
      expect(suggestion.status).toBeDefined();
      expect(suggestion.file_paths).toBeDefined();
      expect(Array.isArray(suggestion.file_paths)).toBe(true);
      expect(suggestion.original_code).toBeDefined();
      expect(suggestion.suggested_code).toBeDefined();
      expect(suggestion.explanation).toBeDefined();
      expect(suggestion.created_at).toBeDefined();
      expect(suggestion.updated_at).toBeDefined();
    });

    it('should allow null applied_code', () => {
      const suggestion: Suggestion = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: '123e4567-e89b-12d3-a456-426614174001',
        project_id: '123e4567-e89b-12d3-a456-426614174002',
        source: 'ai_model',
        scope: 'single_line',
        status: 'pending',
        file_paths: ['src/file.ts'],
        original_code: 'const x = 1;',
        suggested_code: 'const x = 2;',
        applied_code: null,
        explanation: 'Update value to 2',
        created_at: '2026-02-07T00:00:00Z',
        applied_at: null,
        rejected_at: null,
        updated_at: '2026-02-07T00:00:00Z',
      };

      expect(suggestion.applied_code).toBeNull();
    });

    it('should allow non-null applied_code', () => {
      const suggestion: Suggestion = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: '123e4567-e89b-12d3-a456-426614174001',
        project_id: '123e4567-e89b-12d3-a456-426614174002',
        source: 'ai_model',
        scope: 'single_line',
        status: 'applied',
        file_paths: ['src/file.ts'],
        original_code: 'const x = 1;',
        suggested_code: 'const x = 2;',
        applied_code: 'const x = 2;',
        explanation: 'Update value to 2',
        created_at: '2026-02-07T00:00:00Z',
        applied_at: '2026-02-07T01:00:00Z',
        rejected_at: null,
        updated_at: '2026-02-07T01:00:00Z',
      };

      expect(suggestion.applied_code).toBe('const x = 2;');
    });

    it('should allow null applied_at', () => {
      const suggestion: Suggestion = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: '123e4567-e89b-12d3-a456-426614174001',
        project_id: '123e4567-e89b-12d3-a456-426614174002',
        source: 'ai_model',
        scope: 'single_line',
        status: 'pending',
        file_paths: ['src/file.ts'],
        original_code: 'const x = 1;',
        suggested_code: 'const x = 2;',
        applied_code: null,
        explanation: 'Update value to 2',
        created_at: '2026-02-07T00:00:00Z',
        applied_at: null,
        rejected_at: null,
        updated_at: '2026-02-07T00:00:00Z',
      };

      expect(suggestion.applied_at).toBeNull();
    });

    it('should allow null rejected_at', () => {
      const suggestion: Suggestion = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: '123e4567-e89b-12d3-a456-426614174001',
        project_id: '123e4567-e89b-12d3-a456-426614174002',
        source: 'ai_model',
        scope: 'single_line',
        status: 'pending',
        file_paths: ['src/file.ts'],
        original_code: 'const x = 1;',
        suggested_code: 'const x = 2;',
        applied_code: null,
        explanation: 'Update value to 2',
        created_at: '2026-02-07T00:00:00Z',
        applied_at: null,
        rejected_at: null,
        updated_at: '2026-02-07T00:00:00Z',
      };

      expect(suggestion.rejected_at).toBeNull();
    });

    it('should support multiple file paths', () => {
      const suggestion: Suggestion = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: '123e4567-e89b-12d3-a456-426614174001',
        project_id: '123e4567-e89b-12d3-a456-426614174002',
        source: 'ai_model',
        scope: 'multi_file',
        status: 'pending',
        file_paths: ['src/file1.ts', 'src/file2.ts', 'src/file3.ts'],
        original_code: 'const x = 1;',
        suggested_code: 'const x = 2;',
        applied_code: null,
        explanation: 'Update value to 2',
        created_at: '2026-02-07T00:00:00Z',
        applied_at: null,
        rejected_at: null,
        updated_at: '2026-02-07T00:00:00Z',
      };

      expect(suggestion.file_paths).toHaveLength(3);
      expect(suggestion.file_paths).toEqual(['src/file1.ts', 'src/file2.ts', 'src/file3.ts']);
    });
  });

  describe('SuggestionSource', () => {
    it('should support ai_model source', () => {
      const source: SuggestionSource = 'ai_model';
      expect(source).toBe('ai_model');
    });

    it('should support static_rule source', () => {
      const source: SuggestionSource = 'static_rule';
      expect(source).toBe('static_rule');
    });

    it('should support hybrid source', () => {
      const source: SuggestionSource = 'hybrid';
      expect(source).toBe('hybrid');
    });

    it('should work with all source types in Suggestion', () => {
      const aiSuggestion: Suggestion = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: '123e4567-e89b-12d3-a456-426614174001',
        project_id: '123e4567-e89b-12d3-a456-426614174002',
        source: 'ai_model',
        scope: 'single_line',
        status: 'pending',
        file_paths: ['src/file.ts'],
        original_code: 'const x = 1;',
        suggested_code: 'const x = 2;',
        applied_code: null,
        explanation: 'AI suggestion',
        created_at: '2026-02-07T00:00:00Z',
        applied_at: null,
        rejected_at: null,
        updated_at: '2026-02-07T00:00:00Z',
      };
      expect(aiSuggestion.source).toBe('ai_model');

      const ruleSuggestion: Suggestion = {
        ...aiSuggestion,
        id: '123e4567-e89b-12d3-a456-426614174003',
        source: 'static_rule',
        explanation: 'Static rule suggestion',
      };
      expect(ruleSuggestion.source).toBe('static_rule');

      const hybridSuggestion: Suggestion = {
        ...aiSuggestion,
        id: '123e4567-e89b-12d3-a456-426614174004',
        source: 'hybrid',
        explanation: 'Hybrid suggestion',
      };
      expect(hybridSuggestion.source).toBe('hybrid');
    });
  });

  describe('SuggestionScope', () => {
    it('should support single_line scope', () => {
      const scope: SuggestionScope = 'single_line';
      expect(scope).toBe('single_line');
    });

    it('should support multi_line scope', () => {
      const scope: SuggestionScope = 'multi_line';
      expect(scope).toBe('multi_line');
    });

    it('should support multi_file scope', () => {
      const scope: SuggestionScope = 'multi_file';
      expect(scope).toBe('multi_file');
    });

    it('should work with all scope types in Suggestion', () => {
      const singleLineSuggestion: Suggestion = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: '123e4567-e89b-12d3-a456-426614174001',
        project_id: '123e4567-e89b-12d3-a456-426614174002',
        source: 'ai_model',
        scope: 'single_line',
        status: 'pending',
        file_paths: ['src/file.ts'],
        original_code: 'const x = 1;',
        suggested_code: 'const x = 2;',
        applied_code: null,
        explanation: 'Single line change',
        created_at: '2026-02-07T00:00:00Z',
        applied_at: null,
        rejected_at: null,
        updated_at: '2026-02-07T00:00:00Z',
      };
      expect(singleLineSuggestion.scope).toBe('single_line');

      const multiLineSuggestion: Suggestion = {
        ...singleLineSuggestion,
        id: '123e4567-e89b-12d3-a456-426614174003',
        scope: 'multi_line',
        original_code: 'const x = 1;\nconst y = 2;',
        suggested_code: 'const x = 2;\nconst y = 3;',
        explanation: 'Multi line change',
      };
      expect(multiLineSuggestion.scope).toBe('multi_line');

      const multiFileSuggestion: Suggestion = {
        ...singleLineSuggestion,
        id: '123e4567-e89b-12d3-a456-426614174004',
        scope: 'multi_file',
        file_paths: ['src/file1.ts', 'src/file2.ts'],
        explanation: 'Multi file change',
      };
      expect(multiFileSuggestion.scope).toBe('multi_file');
    });
  });

  describe('SuggestionStatus', () => {
    it('should support pending status', () => {
      const status: SuggestionStatus = 'pending';
      expect(status).toBe('pending');
    });

    it('should support applied status', () => {
      const status: SuggestionStatus = 'applied';
      expect(status).toBe('applied');
    });

    it('should support rejected status', () => {
      const status: SuggestionStatus = 'rejected';
      expect(status).toBe('rejected');
    });

    it('should support edited status', () => {
      const status: SuggestionStatus = 'edited';
      expect(status).toBe('edited');
    });

    it('should support undone status', () => {
      const status: SuggestionStatus = 'undone';
      expect(status).toBe('undone');
    });

    it('should work with all status types in Suggestion', () => {
      const baseSuggestion: Omit<Suggestion, 'status'> = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: '123e4567-e89b-12d3-a456-426614174001',
        project_id: '123e4567-e89b-12d3-a456-426614174002',
        source: 'ai_model',
        scope: 'single_line',
        file_paths: ['src/file.ts'],
        original_code: 'const x = 1;',
        suggested_code: 'const x = 2;',
        applied_code: null,
        explanation: 'Test suggestion',
        created_at: '2026-02-07T00:00:00Z',
        applied_at: null,
        rejected_at: null,
        updated_at: '2026-02-07T00:00:00Z',
      };

      const pendingSuggestion: Suggestion = { ...baseSuggestion, status: 'pending' };
      expect(pendingSuggestion.status).toBe('pending');

      const appliedSuggestion: Suggestion = {
        ...baseSuggestion,
        status: 'applied',
        applied_at: '2026-02-07T01:00:00Z',
        applied_code: 'const x = 2;',
      };
      expect(appliedSuggestion.status).toBe('applied');

      const rejectedSuggestion: Suggestion = {
        ...baseSuggestion,
        status: 'rejected',
        rejected_at: '2026-02-07T01:00:00Z',
      };
      expect(rejectedSuggestion.status).toBe('rejected');

      const editedSuggestion: Suggestion = {
        ...baseSuggestion,
        status: 'edited',
        applied_code: 'const x = 3;',
      };
      expect(editedSuggestion.status).toBe('edited');

      const undoneSuggestion: Suggestion = {
        ...baseSuggestion,
        status: 'undone',
        applied_at: '2026-02-07T01:00:00Z',
        applied_code: 'const x = 2;',
      };
      expect(undoneSuggestion.status).toBe('undone');
    });
  });
});
