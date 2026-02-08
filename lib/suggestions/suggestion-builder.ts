import type { Suggestion, SuggestionScope } from '@/lib/types/suggestion';
import type { AnalysisResult } from './ai-generator';
import type { RuleViolation } from './static-rules';

/**
 * Converts raw analysis outputs into `Partial<Suggestion>` objects ready for
 * persistence.
 */
export class SuggestionBuilder {
  /**
   * Map every entry in an `AnalysisResult` to a `Partial<Suggestion>` with
   * `source = "ai_model"`.
   */
  static fromAIResult(
    result: AnalysisResult,
    userId: string,
    projectId: string,
    filePaths: string[],
  ): Partial<Suggestion>[] {
    return result.suggestions.map((s) => ({
      user_id: userId,
      project_id: projectId,
      source: 'ai_model' as const,
      scope: s.scope,
      status: 'pending' as const,
      file_paths: s.filePaths.length > 0 ? s.filePaths : filePaths,
      original_code: s.originalCode,
      suggested_code: s.suggestedCode,
      applied_code: null,
      explanation: s.explanation,
    }));
  }

  /**
   * Convert a single `RuleViolation` to a `Partial<Suggestion>` with
   * `source = "static_rule"`.
   */
  static fromRuleViolation(
    violation: RuleViolation,
    userId: string,
    projectId: string,
    filePath: string,
  ): Partial<Suggestion> {
    const scope: SuggestionScope = 'single_line';

    return {
      user_id: userId,
      project_id: projectId,
      source: 'static_rule' as const,
      scope,
      status: 'pending' as const,
      file_paths: [filePath],
      original_code: violation.originalCode,
      suggested_code: violation.suggestedCode,
      applied_code: null,
      explanation: `[${violation.rule}] ${violation.message}`,
    };
  }
}
