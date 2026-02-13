import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import type { DriftResult, TokenizationSuggestion } from '@/lib/design-tokens/drift/types';
import type { TokenChange } from '@/lib/design-tokens/application/types';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/* ------------------------------------------------------------------ */
/*  Deterministic helpers (unchanged)                                  */
/* ------------------------------------------------------------------ */

function suggestionsToChanges(suggestions: TokenizationSuggestion[]): TokenChange[] {
  const seen = new Map<string, TokenizationSuggestion>();

  for (const s of suggestions) {
    if (!s.suggestedToken || !s.hardcodedValue) continue;
    const key = `${s.hardcodedValue}::${s.suggestedToken}`;
    const existing = seen.get(key);
    if (!existing || s.confidence > existing.confidence) {
      seen.set(key, s);
    }
  }

  return Array.from(seen.values()).map((s) => ({
    type: 'replace' as const,
    tokenName: s.suggestedToken,
    oldValue: s.hardcodedValue,
    newValue: s.suggestedReplacement,
  }));
}

function buildSummary(results: DriftResult[], changes: TokenChange[]): string {
  const totalFiles = results.length;
  const totalHardcoded = results.reduce((n, r) => n + r.hardcodedValues.length, 0);
  const totalNearMatches = results.reduce((n, r) => n + r.nearMatches.length, 0);

  if (changes.length === 0) {
    return `Analyzed ${totalFiles} file(s). No tokenization suggestions found.`;
  }

  return (
    `Analyzed ${totalFiles} file(s) and found ${totalHardcoded} hardcoded value(s) ` +
    `and ${totalNearMatches} near-match(es). ` +
    `Recommending ${changes.length} token replacement(s).`
  );
}

/* ------------------------------------------------------------------ */
/*  LLM-powered suggestion engine                                      */
/* ------------------------------------------------------------------ */

interface LLMSuggestionResult {
  recommendedChanges: TokenChange[];
  rationale: string;
}

/**
 * Check whether an AI provider API key is configured.
 * Returns the provider name if available, or null.
 */
function getAvailableProvider(): 'anthropic' | 'openai' | 'google' | null {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GOOGLE_AI_API_KEY) return 'google';
  return null;
}

/**
 * Build a prompt for the LLM to analyze drift results and recommend token changes.
 */
function buildLLMPrompt(
  driftResults: DriftResult[],
  tokenSummary: string | undefined,
  deterministicChanges: TokenChange[],
): string {
  const driftSummary = driftResults
    .map((r) => {
      const items = r.suggestions
        ?.slice(0, 20) // cap per file to keep prompt size manageable
        .map(
          (s) =>
            `  - "${s.hardcodedValue}" → ${s.suggestedToken} (confidence: ${(s.confidence * 100).toFixed(0)}%)`,
        )
        .join('\n');
      return `File: ${r.filePath}\n${items || '  (no suggestions)'}`;
    })
    .join('\n\n');

  const deterministicSummary =
    deterministicChanges.length > 0
      ? `\nDeterministic analysis already suggests these replacements:\n${deterministicChanges
          .slice(0, 30)
          .map((c) => `  - Replace "${c.oldValue}" with "${c.newValue}" (token: ${c.tokenName})`)
          .join('\n')}`
      : '';

  return `You are a design-system expert reviewing a Shopify theme for tokenization opportunities.

${tokenSummary ? `Current design tokens:\n${tokenSummary}\n` : ''}
Drift analysis found these hardcoded values that could be replaced with design tokens:

${driftSummary}
${deterministicSummary}

Your task:
1. Review the drift suggestions and deterministic recommendations above.
2. Recommend which replacements should be applied — prioritize high-impact, safe changes.
3. Flag any replacements that look risky or may break the theme.
4. If you see patterns (e.g. multiple shades of the same color), suggest consolidation.

Respond ONLY with valid JSON in this exact format (no markdown, no explanation outside JSON):
{
  "recommendedChanges": [
    { "type": "replace", "tokenName": "token-name", "oldValue": "original-value", "newValue": "var(--token-name) or {{ settings.token_name }}" }
  ],
  "rationale": "Brief explanation of your recommendations"
}`;
}

/**
 * Call the LLM to get enhanced suggestions. Returns null on any failure
 * so the caller can fall back to deterministic.
 */
async function llmSuggest(
  driftResults: DriftResult[],
  tokenSummary: string | undefined,
  deterministicChanges: TokenChange[],
): Promise<LLMSuggestionResult | null> {
  const providerName = getAvailableProvider();
  if (!providerName) return null;

  try {
    const { getAIProvider } = await import('@/lib/ai/get-provider');
    const provider = getAIProvider(providerName);

    const prompt = buildLLMPrompt(driftResults, tokenSummary, deterministicChanges);

    const result = await provider.complete(
      [
        {
          role: 'system',
          content:
            'You are a Shopify theme design-system expert. Respond only with valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.2, maxTokens: 4096 },
    );

    // Parse JSON from response (handle potential markdown wrapping)
    let text = result.content.trim();
    // Strip ```json ... ``` wrapping if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      text = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(text) as {
      recommendedChanges?: Array<{
        type?: string;
        tokenName?: string;
        oldValue?: string;
        newValue?: string;
      }>;
      rationale?: string;
    };

    if (!parsed.recommendedChanges || !Array.isArray(parsed.recommendedChanges)) {
      return null;
    }

    // Validate and filter the LLM output
    const validChanges: TokenChange[] = parsed.recommendedChanges
      .filter(
        (c): c is { type: string; tokenName: string; oldValue: string; newValue: string } =>
          !!c.type && !!c.tokenName && !!c.oldValue && !!c.newValue,
      )
      .map((c) => ({
        type: (c.type === 'replace' || c.type === 'rename' || c.type === 'delete'
          ? c.type
          : 'replace') as 'replace' | 'rename' | 'delete',
        tokenName: c.tokenName,
        oldValue: c.oldValue,
        newValue: c.newValue,
      }));

    return {
      recommendedChanges: validChanges,
      rationale: parsed.rationale ?? 'LLM-powered analysis complete.',
    };
  } catch (err) {
    console.warn('[cleanup-suggest] LLM suggestion failed, falling back to deterministic:', err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  POST — Suggest tokenization plan from drift results                */
/* ------------------------------------------------------------------ */

/**
 * POST /api/projects/[projectId]/design-tokens/cleanup-suggest
 *
 * Accepts drift results and returns a recommended set of TokenChange[].
 * When an AI provider API key is configured, uses LLM-powered analysis
 * with the deterministic results as context. Falls back to deterministic
 * when no API key is available or the LLM call fails.
 *
 * Body: `{ driftResults: DriftResult[]; tokenSummary?: string }`
 * Returns: `{ summary: string; recommendedChanges: TokenChange[]; rationale?: string; source: 'llm' | 'deterministic' }`
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = (await request.json()) as {
      driftResults?: DriftResult[];
      tokenSummary?: string;
    };

    if (!body.driftResults || !Array.isArray(body.driftResults)) {
      throw APIError.badRequest('"driftResults" must be a non-empty array');
    }

    // Collect all suggestions from all drift results
    const allSuggestions: TokenizationSuggestion[] = [];
    for (const result of body.driftResults) {
      if (result.suggestions && Array.isArray(result.suggestions)) {
        allSuggestions.push(...result.suggestions);
      }
    }

    // Always compute deterministic first (used as fallback and as LLM context)
    const deterministicChanges = suggestionsToChanges(allSuggestions);

    // Try LLM-powered suggestions
    const llmResult = await llmSuggest(
      body.driftResults,
      body.tokenSummary,
      deterministicChanges,
    );

    if (llmResult && llmResult.recommendedChanges.length > 0) {
      const summary = buildSummary(body.driftResults, llmResult.recommendedChanges);
      return successResponse({
        summary,
        recommendedChanges: llmResult.recommendedChanges,
        rationale: llmResult.rationale,
        source: 'llm' as const,
      });
    }

    // Fallback to deterministic
    const summary = buildSummary(body.driftResults, deterministicChanges);

    return successResponse({
      summary,
      recommendedChanges: deterministicChanges,
      rationale:
        'Recommendations are based on exact and near-match drift detection. ' +
        'Each change replaces a hardcoded value with the corresponding design token reference.',
      source: 'deterministic' as const,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
