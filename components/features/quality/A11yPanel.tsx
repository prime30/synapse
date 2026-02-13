'use client';

import { useMemo } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Info,
  CheckCircle,
} from 'lucide-react';
import { checkAccessibility, type A11yIssue, type A11yReport, type A11ySeverity } from '@/lib/quality/a11y-checker';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface A11yPanelProps {
  /** Rendered preview HTML to scan for accessibility issues. */
  html: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_META: Record<
  A11ySeverity,
  { label: string; iconClass: string; badgeClass: string; icon: React.ReactNode }
> = {
  error: {
    label: 'Error',
    iconClass: 'text-red-400',
    badgeClass: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  warning: {
    label: 'Warning',
    iconClass: 'text-yellow-400',
    badgeClass: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  info: {
    label: 'Info',
    iconClass: 'text-sky-500 dark:text-sky-400',
    badgeClass: 'ide-active text-sky-500 dark:text-sky-400 border-sky-500/30',
    icon: <Info className="w-3.5 h-3.5" />,
  },
};

const SEVERITY_ORDER: A11ySeverity[] = ['error', 'warning', 'info'];

function groupBySeverity(issues: A11yIssue[]): Map<A11ySeverity, A11yIssue[]> {
  const map = new Map<A11ySeverity, A11yIssue[]>();
  for (const sev of SEVERITY_ORDER) {
    map.set(sev, []);
  }
  for (const issue of issues) {
    map.get(issue.severity)!.push(issue);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function A11yPanel({ html }: A11yPanelProps) {
  const report: A11yReport = useMemo(() => checkAccessibility(html), [html]);

  const grouped = useMemo(() => groupBySeverity(report.issues), [report.issues]);

  return (
    <div className="flex flex-col h-full ide-surface-panel ide-text">
      {/* Header */}
      <div className="px-4 py-3 border-b ide-border">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 ide-text-muted" />
          <h2 className="text-sm font-semibold ide-text">Accessibility</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center px-2 py-2 rounded-lg ide-surface-panel border ide-border">
            <p className="text-lg font-bold tabular-nums text-green-400">
              {report.passed}
            </p>
            <p className="text-[10px] ide-text-muted">Passed</p>
          </div>
          <div className="text-center px-2 py-2 rounded-lg ide-surface-panel border ide-border">
            <p className="text-lg font-bold tabular-nums text-red-400">
              {report.failed}
            </p>
            <p className="text-[10px] ide-text-muted">Errors</p>
          </div>
          <div className="text-center px-2 py-2 rounded-lg ide-surface-panel border ide-border">
            <p className="text-lg font-bold tabular-nums text-yellow-400">
              {report.warnings}
            </p>
            <p className="text-[10px] ide-text-muted">Warnings</p>
          </div>
        </div>

        {/* All passing */}
        {report.issues.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm ide-text-muted">
              No accessibility issues detected!
            </p>
          </div>
        ) : (
          /* Issues grouped by severity */
          <div className="space-y-3">
            {SEVERITY_ORDER.map((sev) => {
              const issues = grouped.get(sev) ?? [];
              if (issues.length === 0) return null;
              const meta = SEVERITY_META[sev];

              return (
                <div key={sev}>
                  <h3 className="text-xs font-medium ide-text-muted uppercase tracking-wider px-1 mb-1.5 flex items-center gap-1.5">
                    <span className={meta.iconClass}>{meta.icon}</span>
                    {meta.label}s ({issues.length})
                  </h3>

                  <div className="space-y-1.5">
                    {issues.map((issue, i) => (
                      <div
                        key={`${issue.rule}-${i}`}
                        className="border ide-border rounded-lg px-3 py-2 space-y-1"
                      >
                        {/* Rule badge + line */}
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${meta.badgeClass}`}
                          >
                            {issue.rule}
                          </span>
                          {issue.line && (
                            <span className="text-[10px] ide-text-quiet font-mono">
                              line {issue.line}
                            </span>
                          )}
                        </div>

                        {/* Message */}
                        <p className="text-xs ide-text">{issue.message}</p>

                        {/* Element snippet */}
                        <pre className="text-[10px] ide-text-muted font-mono ide-surface-panel rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap break-all">
                          {issue.element}
                        </pre>

                        {/* Recommendation */}
                        <p className="text-[11px] ide-text-muted">
                          {issue.recommendation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
