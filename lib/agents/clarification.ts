// ── Types ────────────────────────────────────────────────────────────────────

/**
 * A pre-defined option for a clarification question.
 */
export interface ClarificationOption {
  label: string;
  value: string;
  description?: string;
}

/**
 * A structured clarification request with optional pre-defined options.
 */
export interface ClarificationRequest {
  /** The question to ask the user */
  question: string;
  /** Pre-defined options for quick selection */
  options?: ClarificationOption[];
  /** Whether the user can type a freeform response */
  allowFreeform: boolean;
  /** Why we're asking this question */
  context: string;
  /** Which round of clarification this is (1 or 2) */
  round: number;
}

/**
 * A user's response to a clarification request.
 */
export interface ClarificationResponse {
  /** The selected option value, or freeform text */
  value: string;
  /** Whether this was a freeform response */
  isFreeform: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of clarification rounds before proceeding with best guess. */
export const MAX_CLARIFICATION_ROUNDS = 2;

// ── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parse a PM analysis string to extract structured clarification requests.
 *
 * The PM may embed clarification data in various formats:
 * - JSON with `clarifications` array
 * - JSON with `needsClarification: true` and `questions`/`clarificationQuestions`
 * - Numbered list of questions (e.g. "1. What style do you prefer?")
 * - Freeform text with question marks
 */
export function parseClarificationFromAnalysis(analysis: string): ClarificationRequest[] {
  if (!analysis) return [];

  // Strategy 1: Try to find JSON with `clarifications` array
  try {
    const jsonMatch = analysis.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // Format A: { clarifications: [...] }
      if (Array.isArray(parsed.clarifications)) {
        return parsed.clarifications.map((item: Record<string, unknown>) => ({
          question: String(item.question || item.text || ''),
          options: Array.isArray(item.options)
            ? item.options.map((opt: unknown) => {
                if (typeof opt === 'string') return { label: opt, value: opt };
                const o = opt as Record<string, unknown>;
                return {
                  label: String(o.label || o.text || ''),
                  value: String(o.value || o.label || o.text || ''),
                  description: o.description ? String(o.description) : undefined,
                };
              })
            : undefined,
          allowFreeform: item.allowFreeform !== false,
          context: String(item.context || 'Agent needs clarification'),
          round: 1,
        })).filter((r: ClarificationRequest) => r.question.length > 0);
      }

      // Format B: { needsClarification: true, questions: [...] }
      if (parsed.needsClarification === true) {
        const questions: string[] =
          parsed.questions ||
          parsed.clarificationQuestions ||
          parsed.clarification_questions ||
          [];

        if (Array.isArray(questions) && questions.length > 0) {
          return questions.map((q: unknown) => ({
            question: typeof q === 'string' ? q : String((q as Record<string, unknown>).question || q),
            allowFreeform: true,
            context: 'Agent needs clarification',
            round: 1,
          }));
        }
      }
    }
  } catch {
    // JSON parsing failed — try other strategies
  }

  // Strategy 2: Look for numbered questions
  const numberedPattern = /^\s*\d+[\.\)]\s*(.+\?)\s*$/gm;
  const numberedQuestions: string[] = [];
  let match;
  while ((match = numberedPattern.exec(analysis)) !== null) {
    numberedQuestions.push(match[1].trim());
  }

  if (numberedQuestions.length > 0) {
    return numberedQuestions.map((q) => ({
      question: q,
      allowFreeform: true,
      context: 'Agent needs clarification',
      round: 1,
    }));
  }

  // Strategy 3: No structured format found
  return [];
}

// ── Formatting ───────────────────────────────────────────────────────────────

/**
 * Format clarification responses to inject back into the user request
 * so the coordinator can proceed with the clarified intent.
 */
export function formatClarificationForPrompt(
  originalRequest: string,
  clarifications: Array<{ request: ClarificationRequest; response: ClarificationResponse }>,
): string {
  if (!clarifications || clarifications.length === 0) {
    return originalRequest;
  }

  const lines: string[] = [
    `Original request: ${originalRequest}`,
    '',
    'Clarifications:',
  ];

  for (const { request, response } of clarifications) {
    lines.push(`Q: ${request.question}`);
    lines.push(`A: ${response.value}`);
    lines.push('');
  }

  lines.push('Please proceed with the implementation based on these clarifications.');

  return lines.join('\n');
}
