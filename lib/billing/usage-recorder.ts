import { createServiceClient } from '@/lib/supabase/admin';
import { calculateCostCents } from './cost-calculator';
import { checkSpendingThresholds } from './spending-monitor';

export interface RecordUsageParams {
  organizationId: string;
  userId: string;
  projectId: string;
  executionId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  isByok: boolean;
  isIncluded: boolean;
  requestType: 'agent' | 'completion' | 'review' | 'summary';
  /** Tokens served from Anthropic prompt cache (billed at ~10% of input rate). */
  cacheReadInputTokens?: number;
  /** Tokens written to Anthropic prompt cache (billed at ~125% of input rate). */
  cacheCreationInputTokens?: number;
}

/**
 * Record a single AI usage event to the `usage_records` table and
 * refresh the daily rollup.
 *
 * This function is fail-safe: it catches all errors internally so it
 * can never break the parent request. Callers should still wrap it in
 * try/catch for defence-in-depth but can safely fire-and-forget.
 */
export async function recordUsage(params: RecordUsageParams): Promise<void> {
  try {
    const supabase = createServiceClient();

    const costCents = calculateCostCents(
      params.model,
      params.inputTokens,
      params.outputTokens,
    );

    const { error: insertError } = await supabase
      .from('usage_records')
      .insert({
        organization_id: params.organizationId,
        user_id: params.userId,
        project_id: params.projectId,
        execution_id: params.executionId,
        provider: params.provider,
        model: params.model,
        input_tokens: params.inputTokens,
        output_tokens: params.outputTokens,
        cost_cents: costCents,
        is_byok: params.isByok,
        is_included: params.isIncluded,
        request_type: params.requestType,
        cache_read_input_tokens: params.cacheReadInputTokens ?? 0,
        cache_creation_input_tokens: params.cacheCreationInputTokens ?? 0,
      });

    if (insertError) {
      console.error('[usage-recorder] insert failed:', insertError.message);
      return;
    }

    // Refresh daily rollup for fast dashboard reads.
    // The RPC uses SECURITY DEFINER so the service client can call it.
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const { error: rpcError } = await supabase.rpc(
      'refresh_daily_usage_rollup',
      { p_org_id: params.organizationId, p_day: today },
    );

    if (rpcError) {
      // Rollup failure is non-critical — the data is still in usage_records
      console.warn('[usage-recorder] rollup refresh failed:', rpcError.message);
    }

    // Fire-and-forget: check if the org has exceeded spending thresholds.
    // Intentionally not awaited so it never delays the response.
    checkSpendingThresholds(params.organizationId).catch(() => {});
  } catch (err) {
    // Belt-and-suspenders: never propagate
    console.error('[usage-recorder] unexpected error:', err);
  }
}

/**
 * Record multiple usage events at once (e.g. per-agent breakdown).
 * Each record is independent — one failure won't block the others.
 */
export async function recordUsageBatch(
  records: RecordUsageParams[],
): Promise<void> {
  await Promise.all(records.map((r) => recordUsage(r)));
}
