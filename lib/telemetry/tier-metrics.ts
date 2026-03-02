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

  // ── Token optimization tracking (Phase 0) ──────────────────────────
  /** Cache read tokens from Anthropic prompt caching. */
  cacheReadTokens?: number;
  /** Cache write (creation) tokens from Anthropic prompt caching. */
  cacheWriteTokens?: number;
  /** Number of tool results moved to cold storage by microcompaction. */
  microcompactionColdCount?: number;
  /** Number of times the agent re-read a file that was already cold-stored. */
  microcompactionRereadCount?: number;
  /** Estimated tokens saved by microcompaction. */
  microcompactionTokensSaved?: number;
  /** Number of times the get_knowledge tool was called. */
  knowledgeToolCalls?: number;
  /** Number of server-side compaction events. */
  compactionEvents?: number;
  /** Which optimization feature flags were active for this execution. */
  activeOptimizations?: string[];

  // ── Edit success metrics (W1-C) ──────────────────────────────────────
  /** Total search_replace / edit_lines / propose_code_edit calls. */
  editAttempts?: number;
  /** Calls where tier 0 (Simple/exact) matched on first try. */
  editFirstPassSuccess?: number;
  /** Average replacer tier index across all search_replace calls. */
  avgCascadeDepth?: number;
  /** Count by edit tool type: { search_replace: N, edit_lines: N, propose_code_edit: N }. */
  editToolDistribution?: Record<string, number>;
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
      cache_read_tokens: metrics.cacheReadTokens ?? 0,
      cache_write_tokens: metrics.cacheWriteTokens ?? 0,
      microcompaction_cold_count: metrics.microcompactionColdCount ?? 0,
      microcompaction_reread_count: metrics.microcompactionRereadCount ?? 0,
      microcompaction_tokens_saved: metrics.microcompactionTokensSaved ?? 0,
      knowledge_tool_calls: metrics.knowledgeToolCalls ?? 0,
      compaction_events: metrics.compactionEvents ?? 0,
      active_optimizations: metrics.activeOptimizations ?? [],
      edit_attempts: metrics.editAttempts ?? 0,
      edit_first_pass_success: metrics.editFirstPassSuccess ?? 0,
      avg_cascade_depth: metrics.avgCascadeDepth ?? null,
      edit_tool_distribution: metrics.editToolDistribution ?? {},
    });
  } catch (err) {
    console.warn('[tier-metrics] Failed to record:', (err as Error).message);
  }
}
