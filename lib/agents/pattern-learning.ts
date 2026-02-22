import { createClient } from '@/lib/supabase/server';
import type {
  CodeChange,
  LearnedPattern,
  UserPreference,
  FileContext,
  StandardizationOpportunity,
} from '@/lib/types/agent';
import { invalidatePreferences } from '@/lib/cache/agent-context-cache';

/**
 * Pattern learning utilities for the Project Manager agent.
 * Extracts, stores, and retrieves user coding preferences.
 */
export class PatternLearning {
  /** Extract coding patterns from an approved code change */
  extractPattern(change: CodeChange): LearnedPattern | null {
    const { proposedContent, agentType, reasoning } = change;

    // Detect quote style
    const singleQuotes = (proposedContent.match(/'/g) ?? []).length;
    const doubleQuotes = (proposedContent.match(/"/g) ?? []).length;
    if (singleQuotes > 5 || doubleQuotes > 5) {
      const prefersSingle = singleQuotes > doubleQuotes;
      return {
        pattern: prefersSingle
          ? 'Use single quotes for strings'
          : 'Use double quotes for strings',
        fileType: agentType === 'project_manager' ? undefined : agentType,
        example: prefersSingle ? "const x = 'value'" : 'const x = "value"',
        reasoning: `Detected from approved change: ${reasoning}`,
      };
    }

    // Detect indentation style
    const twoSpaceLines = (proposedContent.match(/\n {2}\S/g) ?? []).length;
    const fourSpaceLines = (proposedContent.match(/\n {4}\S/g) ?? []).length;
    const tabLines = (proposedContent.match(/\n\t\S/g) ?? []).length;

    if (twoSpaceLines > 3 || fourSpaceLines > 3 || tabLines > 3) {
      const style =
        tabLines > twoSpaceLines && tabLines > fourSpaceLines
          ? 'tabs'
          : fourSpaceLines > twoSpaceLines
            ? '4 spaces'
            : '2 spaces';
      return {
        pattern: `Use ${style} for indentation`,
        fileType: agentType === 'project_manager' ? undefined : agentType,
        reasoning: `Detected from approved change: ${reasoning}`,
      };
    }

    // Detect semicolon usage (JavaScript)
    if (agentType === 'javascript') {
      const withSemicolons = (proposedContent.match(/;\s*$/gm) ?? []).length;
      const totalStatements = (proposedContent.match(/\n/g) ?? []).length;
      if (totalStatements > 5) {
        const usesSemicolons = withSemicolons / totalStatements > 0.5;
        return {
          pattern: usesSemicolons
            ? 'Use semicolons at end of statements'
            : 'Omit semicolons (ASI style)',
          fileType: 'javascript',
          reasoning: `Detected from approved change: ${reasoning}`,
        };
      }
    }

    return null;
  }

  /** Store a learned pattern in user_preferences */
  async storePattern(userId: string, pattern: LearnedPattern): Promise<void> {
    const supabase = await createClient();

    // Check if pattern already exists
    const { data: existing } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('category', 'coding_style')
      .eq('key', pattern.pattern)
      .single();

    if (existing) {
      // Reinforce existing pattern
      await supabase
        .from('user_preferences')
        .update({
          observation_count: existing.observation_count + 1,
          last_reinforced: new Date().toISOString(),
          confidence: Math.min(existing.confidence + 0.1, 1.0),
        })
        .eq('id', existing.id);
    } else {
      // Store new pattern
      await supabase.from('user_preferences').insert({
        user_id: userId,
        category: 'coding_style',
        key: pattern.pattern,
        value: pattern.example ?? pattern.pattern,
        file_type: pattern.fileType ?? null,
        confidence: 1.0,
        metadata: {
          reasoning: pattern.reasoning,
        },
      });
    }
    invalidatePreferences(userId).catch(() => {});
  }

  /** Get user patterns, optionally filtered by file type */
  async getPatterns(
    userId: string,
    fileType?: string
  ): Promise<UserPreference[]> {
    const supabase = await createClient();

    let query = supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('category', 'coding_style')
      .order('confidence', { ascending: false });

    if (fileType) {
      query = query.eq('file_type', fileType);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  /** Identify inconsistent patterns across project files */
  identifyStandardizationOpportunities(
    files: FileContext[]
  ): StandardizationOpportunity[] {
    const opportunities: StandardizationOpportunity[] = [];

    // Check quote consistency in JS files
    const jsFiles = files.filter((f) => f.fileType === 'javascript');
    const quoteStyles: Record<string, string> = {};

    for (const file of jsFiles) {
      const singles = (file.content.match(/'/g) ?? []).length;
      const doubles = (file.content.match(/"/g) ?? []).length;
      quoteStyles[file.fileName] = singles > doubles ? 'single' : 'double';
    }

    const quoteValues = Object.values(quoteStyles);
    const hasMixedQuotes =
      quoteValues.includes('single') && quoteValues.includes('double');

    if (hasMixedQuotes) {
      const singleCount = quoteValues.filter((v) => v === 'single').length;
      const doubleCount = quoteValues.filter((v) => v === 'double').length;
      const suggested = singleCount >= doubleCount ? 'single quotes' : 'double quotes';

      opportunities.push({
        pattern: 'String quote style',
        currentVariations: Object.entries(quoteStyles).map(
          ([file, style]) => `${style} quotes in ${file}`
        ),
        suggestedStandard: suggested,
        affectedFiles: Object.keys(quoteStyles),
        reasoning: `Majority of files use ${suggested}`,
      });
    }

    return opportunities;
  }
}
