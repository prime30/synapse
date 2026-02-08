import type { SuggestionScope } from '@/lib/types/suggestion';
import type { Suggestion } from '@/lib/types/suggestion';
import type { AIProviderInterface } from '@/lib/ai/types';
import { createOpenAIProvider } from '@/lib/ai/providers/openai';

// ── Public types ────────────────────────────────────────────────────────────

export interface AnalysisResult {
  suggestions: Array<{
    originalCode: string;
    suggestedCode: string;
    explanation: string;
    scope: SuggestionScope;
    filePaths: string[];
  }>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const AI_TIMEOUT_MS = 10_000;

function getLineAt(content: string, offset: number): string {
  const start = content.lastIndexOf('\n', offset - 1) + 1;
  let end = content.indexOf('\n', offset);
  if (end === -1) end = content.length;
  return content.substring(start, end).trim();
}

function buildSystemPrompt(): string {
  return [
    'You are a senior code reviewer. Analyze the provided file and return a JSON object ',
    'with an array called "suggestions". Each suggestion must have exactly these fields:',
    '  "originalCode"  – the problematic snippet (verbatim from the file)',
    '  "suggestedCode" – the improved replacement',
    '  "explanation"   – why the change helps',
    '  "scope"         – one of "single_line" | "multi_line" | "multi_file"',
    'Return ONLY valid JSON, no markdown fences or extra text.',
    'Limit output to the top 5 most impactful suggestions.',
  ].join('\n');
}

function buildUserPrompt(
  fileName: string,
  fileType: string,
  content: string,
): string {
  return [
    `File: ${fileName} (${fileType})`,
    '---',
    content,
    '---',
    'Identify improvement opportunities: performance, readability, security, best practices.',
  ].join('\n');
}

interface AIResponsePayload {
  suggestions?: Array<{
    originalCode?: string;
    suggestedCode?: string;
    explanation?: string;
    scope?: string;
  }>;
}

const VALID_SCOPES = new Set<SuggestionScope>([
  'single_line',
  'multi_line',
  'multi_file',
]);

function parseAIResponse(
  raw: string,
  fileName: string,
): Partial<Suggestion>[] {
  try {
    const payload: AIResponsePayload = JSON.parse(raw);
    if (!Array.isArray(payload.suggestions)) return [];

    return payload.suggestions
      .filter(
        (s) =>
          typeof s.originalCode === 'string' &&
          typeof s.suggestedCode === 'string' &&
          typeof s.explanation === 'string',
      )
      .map((s) => ({
        source: 'ai_model' as const,
        scope: VALID_SCOPES.has(s.scope as SuggestionScope)
          ? (s.scope as SuggestionScope)
          : 'single_line',
        status: 'pending' as const,
        file_paths: [fileName],
        original_code: s.originalCode!,
        suggested_code: s.suggestedCode!,
        explanation: s.explanation!,
      }));
  } catch {
    return [];
  }
}

// ── Generator ───────────────────────────────────────────────────────────────

/**
 * Uses an AI provider to generate code-improvement suggestions, with a
 * lightweight local fallback via `analyzeFileContent`.
 */
export class AISuggestionGenerator {
  private provider: AIProviderInterface;

  constructor(provider?: AIProviderInterface) {
    this.provider = provider ?? createOpenAIProvider();
  }

  /**
   * Call the AI model to generate suggestions for the given file.
   * Times out after 10 seconds and returns an empty array on failure.
   */
  async generateSuggestions(
    _fileId: string,
    fileName: string,
    content: string,
    fileType: string,
    projectId: string,
  ): Promise<Partial<Suggestion>[]> {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error('AI suggestion generation timed out')),
        AI_TIMEOUT_MS,
      );
    });

    try {
      const result = await Promise.race([
        this.provider.complete(
          [
            { role: 'system', content: buildSystemPrompt() },
            {
              role: 'user',
              content: buildUserPrompt(fileName, fileType, content),
            },
          ],
          { temperature: 0.3, maxTokens: 2048 },
        ),
        timeout,
      ]);

      const suggestions = parseAIResponse(result.content, fileName);

      // Stamp every suggestion with the project id
      return suggestions.map((s) => ({ ...s, project_id: projectId }));
    } catch {
      // Timeout, missing API key, or any other error → graceful degradation
      return [];
    }
  }

  /**
   * Lightweight **synchronous** local analysis that spots obvious patterns
   * without calling an AI model.
   */
  analyzeFileContent(content: string, fileType: string): AnalysisResult {
    const suggestions: AnalysisResult['suggestions'] = [];
    const category = normalizeType(fileType);

    if (category === 'javascript') {
      this.detectJSPatterns(content, suggestions);
    } else if (category === 'css') {
      this.detectCSSPatterns(content, suggestions);
    } else if (category === 'liquid') {
      this.detectLiquidPatterns(content, suggestions);
    }

    return { suggestions };
  }

  // ── Private pattern detectors ───────────────────────────────────────────

  private detectJSPatterns(
    content: string,
    out: AnalysisResult['suggestions'],
  ): void {
    // console.log
    const consoleRegex = /\bconsole\.log\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = consoleRegex.exec(content)) !== null) {
      out.push({
        originalCode: getLineAt(content, m.index),
        suggestedCode: '// Remove or replace with a proper logger',
        explanation:
          'console.log found — should be removed before production',
        scope: 'single_line',
        filePaths: [],
      });
    }

    // var
    const varRegex = /\bvar\s+(\w+)/g;
    while ((m = varRegex.exec(content)) !== null) {
      const line = getLineAt(content, m.index);
      out.push({
        originalCode: line,
        suggestedCode: line.replace(/\bvar\b/, 'const'),
        explanation:
          '"var" is function-scoped and can cause bugs — prefer const/let',
        scope: 'single_line',
        filePaths: [],
      });
    }

    // == (loose equality)
    const eqRegex = /(?<![!=])==(?!=)/g;
    while ((m = eqRegex.exec(content)) !== null) {
      const line = getLineAt(content, m.index);
      out.push({
        originalCode: line,
        suggestedCode: line.replace(/(?<![!=])==(?!=)/g, '==='),
        explanation:
          'Loose equality (==) can cause unexpected type coercion — use ===',
        scope: 'single_line',
        filePaths: [],
      });
    }
  }

  private detectCSSPatterns(
    content: string,
    out: AnalysisResult['suggestions'],
  ): void {
    const importantRegex = /!important/g;
    let m: RegExpExecArray | null;
    while ((m = importantRegex.exec(content)) !== null) {
      const line = getLineAt(content, m.index);
      out.push({
        originalCode: line,
        suggestedCode: line.replace(/\s*!important/g, ''),
        explanation:
          '!important overrides the cascade — prefer increasing specificity',
        scope: 'single_line',
        filePaths: [],
      });
    }
  }

  private detectLiquidPatterns(
    content: string,
    out: AnalysisResult['suggestions'],
  ): void {
    const lines = content.split('\n');
    let depth = 0;
    const openRegex = /\{%-?\s*(?:if|unless)\b/;
    const closeRegex = /\{%-?\s*end(?:if|unless)\s*-?%\}/;

    for (let i = 0; i < lines.length; i++) {
      if (openRegex.test(lines[i])) {
        depth++;
        if (depth > 3) {
          out.push({
            originalCode: lines[i].trim(),
            suggestedCode:
              'Extract nested conditions into assign variables or use case/when',
            explanation: `Deeply nested conditional (level ${depth}) — consider simplifying`,
            scope: 'multi_line',
            filePaths: [],
          });
        }
      }
      if (closeRegex.test(lines[i])) {
        depth = Math.max(0, depth - 1);
      }
    }
  }
}

// ── Utility ─────────────────────────────────────────────────────────────────

function normalizeType(
  fileType: string,
): 'javascript' | 'css' | 'liquid' | 'unknown' {
  const t = fileType.toLowerCase().replace(/^\./, '');
  if (['javascript', 'typescript', 'js', 'ts', 'jsx', 'tsx'].includes(t))
    return 'javascript';
  if (['css', 'scss', 'sass', 'less'].includes(t)) return 'css';
  if (t === 'liquid') return 'liquid';
  return 'unknown';
}
