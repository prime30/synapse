/**
 * Second-opinion review: GPT-4o reviews a plan or refactor summary.
 * Uses the same Codex-style packaging idea (structured prompt) for consistency.
 */

import { getAIProvider } from '@/lib/ai/get-provider';
import { resolveModel } from './model-router';
import type { ReviewResult } from '@/lib/types/agent';

export type SecondOpinionType = 'plan' | 'refactor';

const SECOND_OPINION_SYSTEM = `You are a senior engineer giving a brief second opinion. Review the content for:
- Completeness and clarity
- Obvious risks or gaps
- One or two concrete improvements if any

Reply in JSON: { "approved": boolean, "summary": string, "issues": [{ "severity": "info"|"warning", "description": string }] }
Keep the summary to 1-3 sentences.`;

/**
 * Get a second opinion from GPT-4o on a plan or refactor summary.
 * Returns a lightweight review (approved, summary, issues) or null on error.
 */
export async function getSecondOpinion(
  content: string,
  type: SecondOpinionType,
  userRequest?: string
): Promise<{ approved: boolean; summary: string; issues: Array<{ severity: string; description: string }> } | null> {
  try {
    const provider = getAIProvider('openai');
    const model = resolveModel({ action: 'review' }); // GPT-4o for review

    const userPrompt = [
      type === 'plan' ? 'Review this execution plan.' : 'Review this refactor summary.',
      userRequest ? `User request: ${userRequest}` : '',
      '',
      '---',
      content,
      '---',
      '',
      'Reply with JSON only: { "approved": boolean, "summary": string, "issues": [{ "severity": "info"|"warning", "description": string }] }',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await provider.complete(
      [
        { role: 'system', content: SECOND_OPINION_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      { model, maxTokens: 512 }
    );

    const raw = result.content?.trim() ?? '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (!parsed || typeof parsed.approved !== 'boolean') return null;

    return {
      approved: parsed.approved,
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Second opinion completed.',
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.map((i: { severity?: string; description?: string }) => ({
            severity: i.severity ?? 'info',
            description: i.description ?? '',
          }))
        : [],
    };
  } catch {
    return null;
  }
}
