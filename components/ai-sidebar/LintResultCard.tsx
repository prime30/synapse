'use client';

import React, { useState } from 'react';

interface LintIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

interface LintResultCardProps {
  passed: boolean;
  summary: string;
  issues: LintIssue[];
}

const SEVERITY_CONFIG = {
  error: {
    label: 'Errors',
    badge: 'bg-red-500/10 text-red-500 dark:text-red-400',
    dot: 'bg-red-500',
  },
  warning: {
    label: 'Warnings',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  info: {
    label: 'Info',
    badge: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    dot: 'bg-sky-500',
  },
} as const;

export function LintResultCard({ passed, summary, issues }: LintResultCardProps) {
  const [expandedSeverity, setExpandedSeverity] = useState<string | null>(
    issues.some(i => i.severity === 'error') ? 'error' : null
  );

  const grouped = {
    error: issues.filter(i => i.severity === 'error'),
    warning: issues.filter(i => i.severity === 'warning'),
    info: issues.filter(i => i.severity === 'info'),
  };

  return (
    <div className="rounded-lg border border-stone-200 dark:border-white/10 bg-stone-50 dark:bg-white/5 p-3 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${
            passed
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-red-500/10 text-red-500 dark:text-red-400'
          }`}
        >
          {passed ? 'PASSED' : 'FAILED'}
        </span>
        <span className="text-stone-600 dark:text-stone-400 text-xs truncate">{summary}</span>
      </div>

      {(['error', 'warning', 'info'] as const).map(severity => {
        const items = grouped[severity];
        if (items.length === 0) return null;
        const config = SEVERITY_CONFIG[severity];
        const isExpanded = expandedSeverity === severity;

        return (
          <div key={severity} className="mt-2">
            <button
              onClick={() => setExpandedSeverity(isExpanded ? null : severity)}
              className="flex items-center gap-2 w-full text-left"
            >
              <span className={`w-2 h-2 rounded-full ${config.dot}`} />
              <span className={`text-xs font-medium ${config.badge} px-1.5 py-0.5 rounded`}>
                {config.label} ({items.length})
              </span>
              <span className="text-stone-400 dark:text-stone-500 text-xs ml-auto">
                {isExpanded ? '▾' : '▸'}
              </span>
            </button>

            {isExpanded && (
              <div className="mt-1 ml-4 space-y-1.5">
                {items.map((issue, i) => (
                  <div key={i} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sky-600 dark:text-sky-400 font-mono">
                        {issue.file}{issue.line ? `:${issue.line}` : ''}
                      </span>
                      <span className="text-stone-400 dark:text-stone-500">({issue.category})</span>
                    </div>
                    <p className="text-stone-600 dark:text-stone-400 mt-0.5">{issue.message}</p>
                    {issue.suggestion && (
                      <p className="text-stone-500 dark:text-stone-400 mt-0.5 italic">{issue.suggestion}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
