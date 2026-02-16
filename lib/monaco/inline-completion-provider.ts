/**
 * Cursor Tab–like inline (ghost) completions for Monaco.
 * Calls /api/ai/complete-inline and returns the result as ghost text.
 * See .cursor/plans/cursor-like-features-plan.md (Track A).
 */

import type { editor, Position, IRange, CancellationToken, languages } from 'monaco-editor';

const PREFIX_CHARS = 2000;
const SUFFIX_CHARS = 500;

export interface InlineCompletionProviderOptions {
  /** Base URL for API (e.g. '' for same origin). */
  apiBase?: string;
  /** File path for context (e.g. sections/hero.liquid). */
  getFilePath?: () => string | null;
  /** Language: liquid | javascript | css. */
  language?: 'liquid' | 'javascript' | 'css';
  /** Debounce delay before requesting (ms). */
  debounceDelayMs?: number;
  /** Provider only runs when this returns true. */
  enabled?: () => boolean;
}

function getPrefixSuffix(
  model: editor.ITextModel,
  position: Position
): { prefix: string; suffix: string } {
  const offset = model.getOffsetAt(position);
  const full = model.getValue();
  const prefix = full.slice(Math.max(0, offset - PREFIX_CHARS), offset);
  const suffix = full.slice(offset, Math.min(full.length, offset + SUFFIX_CHARS));
  return { prefix, suffix };
}

function disposeInlineCompletions(
  // Required by InlineCompletionsProvider; no resources to release
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- interface requirement
  _completions: languages.InlineCompletions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- interface requirement
  _reason: languages.InlineCompletionsDisposeReason
): void {
  // no-op
}

/**
 * Creates an InlineCompletionsProvider that requests completions from the Synapse
 * complete-inline API and returns them as ghost text. Tab accepts, Esc rejects.
 */
export function createInlineCompletionProvider(
  monaco: typeof import('monaco-editor'),
  options: InlineCompletionProviderOptions = {}
): languages.InlineCompletionsProvider {
  const {
    apiBase = '',
    getFilePath = () => null,
    language = 'liquid',
    debounceDelayMs = 400,
    enabled = () => true,
  } = options;

  const provider: languages.InlineCompletionsProvider = {
    debounceDelayMs,

    provideInlineCompletions(
      model: editor.ITextModel,
      position: Position,
      _context: languages.InlineCompletionContext,
      token: CancellationToken
    ): Promise<languages.InlineCompletions | null> {
      if (!enabled()) return Promise.resolve(null);

      const { prefix, suffix } = getPrefixSuffix(model, position);
      if (prefix.length < 3) return Promise.resolve(null);

      const path = getFilePath() ?? undefined;
      const url = `${apiBase}/api/ai/complete-inline`;
      const body = JSON.stringify({ prefix, suffix, path, language, provider: 'google' });

      const controller = new AbortController();
      token.onCancellationRequested(() => controller.abort());

      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        credentials: 'same-origin',
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) return null;
          const json = (await res.json()) as { data?: { completion?: string | null } };
          const completion = json?.data?.completion ?? null;
          if (!completion || token.isCancellationRequested) return null;
          const range: IRange = {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          };
          return {
            items: [{ insertText: completion, range }],
          };
        })
        .catch(() => null);
    },

    disposeInlineCompletions,
  };

  return provider;
}
