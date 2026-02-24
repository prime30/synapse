import { createServiceClient } from '@/lib/supabase/admin';

export interface TierMetrics {
  executionId: string;
  tier: 'TRIVIAL' | 'SIMPLE' | 'COMPLEX' | 'ARCHITECTURAL';
  inputTokens: number;
  outputTokens: number;
  filesPreloaded: number;
  filesReadOnDemand: number;
  iterations: number;
  firstTokenMs: number;
  totalMs: number;
  editSuccess: boolean;
  pipelineVersion: 'legacy' | 'lean';

  /** Whether a referential replay fallback was attempted. */
  referentialReplayUsed?: boolean;
  /** Whether the referential replay succeeded. */
  referentialReplaySuccess?: boolean;
  /** Number of reference sections loaded as context. */
  referenceSectionsLoaded?: number;
  /** Whether design tokens were available for this execution. */
  designTokensAvailable?: boolean;
  /** Count of design tokens available. */
  designTokenCount?: number;
  /** Number of validation issues found during execution. */
  validationIssuesFound?: number;
  /** Total rules in the unified style profile (tokens + style + patterns + memory). */
  styleProfileTokenCount?: number;
  /** Number of extended patterns detected by PatternLearning. */
  extendedPatternsDetected?: number;
  /** Number of conflict resolutions applied during style profile merge. */
  patternConflictResolutions?: number;
}

export async function recordTierMetrics(metrics: TierMetrics): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.from('agent_tier_metrics').insert({
      execution_id: metrics.executionId,
      tier: metrics.tier,
      input_tokens: metrics.inputTokens,
      output_tokens: metrics.outputTokens,
      files_preloaded: metrics.filesPreloaded,
      files_read_on_demand: metrics.filesReadOnDemand,
      iterations: metrics.iterations,
      first_token_ms: metrics.firstTokenMs,
      total_ms: metrics.totalMs,
      edit_success: metrics.editSuccess,
      pipeline_version: metrics.pipelineVersion,
      referential_replay_used: metrics.referentialReplayUsed ?? null,
      referential_replay_success: metrics.referentialReplaySuccess ?? null,
      reference_sections_loaded: metrics.referenceSectionsLoaded ?? null,
      design_tokens_available: metrics.designTokensAvailable ?? null,
      design_token_count: metrics.designTokenCount ?? null,
      validation_issues_found: metrics.validationIssuesFound ?? null,
      style_profile_token_count: metrics.styleProfileTokenCount ?? null,
      extended_patterns_detected: metrics.extendedPatternsDetected ?? null,
      pattern_conflict_resolutions: metrics.patternConflictResolutions ?? null,
    });
  } catch (err) {
    console.warn('[tier-metrics] Failed to record:', (err as Error).message);
  }
}
