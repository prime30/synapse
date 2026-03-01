'use client';

import { useState, useEffect, useCallback } from 'react';

interface RuleCategory {
  name: string;
  rules: string[];
}

interface RulesData {
  rules: string;
  categories: RuleCategory[];
  tokenCount: number;
  componentCount: number;
}

interface RulesSectionProps {
  projectId: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  Colors: '\u25C6',
  Typography: 'Aa',
  Spacing: '\u21D4',
  Animation: '\u25B6',
  Borders: '\u25A0',
  Shadows: '\u25A3',
  Buttons: '\u25CB',
};

export function RulesSection({ projectId }: RulesSectionProps) {
  const [data, setData] = useState<RulesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAgentPreview, setShowAgentPreview] = useState(false);

  const fetchRules = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/design-tokens/rules`);
      if (!res.ok) throw new Error(`Failed to fetch rules (${res.status})`);
      const json = await res.json();
      setData(json.data ?? json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="p-5 rounded-lg border ide-border ide-surface-panel animate-pulse"
          >
            <div className="h-3 w-24 rounded ide-surface-input mb-3" />
            <div className="h-2.5 w-full rounded ide-surface-input mb-2" />
            <div className="h-2.5 w-3/4 rounded ide-surface-input" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-red-500 dark:text-red-400 mb-2">{error}</p>
        <button
          type="button"
          onClick={fetchRules}
          className="text-sm text-sky-500 dark:text-sky-400 hover:text-sky-400 dark:hover:text-sky-300 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 mb-4 rounded-xl ide-surface-panel border ide-border flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-7 h-7 ide-text-muted"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
            />
          </svg>
        </div>
        <h3 className="text-base font-semibold ide-text mb-1">No design rules yet</h3>
        <p className="text-sm ide-text-2 max-w-xs">
          Run a theme scan to extract tokens. Design rules are generated automatically from your project&apos;s tokens and components.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-sm">
        <span className="ide-text-muted">
          <span className="font-semibold ide-text">{data.categories.length}</span>{' '}
          rule {data.categories.length === 1 ? 'category' : 'categories'}
        </span>
        <span className="ide-text-muted">
          from <span className="font-semibold ide-text">{data.tokenCount}</span> tokens
          {data.componentCount > 0 && (
            <> and <span className="font-semibold ide-text">{data.componentCount}</span> components</>
          )}
        </span>
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.categories.map((cat) => (
          <div
            key={cat.name}
            className="p-5 rounded-lg border ide-border ide-surface-panel"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-md ide-surface-input flex items-center justify-center text-xs ide-text-muted font-mono">
                {CATEGORY_ICONS[cat.name] ?? '\u2022'}
              </span>
              <h3 className="text-sm font-semibold ide-text">{cat.name}</h3>
              <span className="ml-auto text-xs ide-text-muted tabular-nums">
                {cat.rules.length} rule{cat.rules.length !== 1 ? 's' : ''}
              </span>
            </div>
            <ul className="space-y-1.5">
              {cat.rules.map((rule, i) => (
                <li
                  key={i}
                  className="text-xs ide-text-2 leading-relaxed pl-3 relative before:absolute before:left-0 before:top-[0.45em] before:w-1 before:h-1 before:rounded-full before:bg-stone-400 dark:before:bg-white/30"
                >
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Agent preview toggle */}
      <div className="border ide-border rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAgentPreview((p) => !p)}
          className="w-full flex items-center justify-between px-5 py-3 ide-hover transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-4 h-4 ide-text-muted"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
              />
            </svg>
            <span className="text-sm font-medium ide-text">Agent Preview</span>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className={`w-4 h-4 ide-text-muted transition-transform ${showAgentPreview ? 'rotate-180' : ''}`}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {showAgentPreview && (
          <div className="border-t ide-border px-5 py-4 ide-surface-inset">
            <p className="text-xs ide-text-muted mb-2">
              This is the exact rules block injected into the agent system prompt:
            </p>
            <pre className="text-xs ide-text font-mono whitespace-pre-wrap leading-relaxed p-3 rounded-md ide-surface-panel border ide-border overflow-x-auto">
              {data.rules || 'No rules generated.'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
