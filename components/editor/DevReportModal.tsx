'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { X, ChevronDown, ChevronRight, Copy, Check, FileText, Layers, Layout, Palette, Settings } from 'lucide-react';
import type { DevReport, DevReportFile, FileCategory } from '@/hooks/useDevReport';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const CATEGORY_LABELS: Record<FileCategory, string> = {
  component: 'Components',
  page: 'Pages',
  layout: 'Layouts',
  asset: 'Assets',
  config: 'Config',
};

const CATEGORY_ICONS: Record<FileCategory, React.ReactNode> = {
  component: <Layers className="h-3.5 w-3.5" />,
  page: <FileText className="h-3.5 w-3.5" />,
  layout: <Layout className="h-3.5 w-3.5" />,
  asset: <Palette className="h-3.5 w-3.5" />,
  config: <Settings className="h-3.5 w-3.5" />,
};

const CATEGORY_ORDER: FileCategory[] = ['component', 'page', 'layout', 'asset', 'config'];

/* ------------------------------------------------------------------ */
/*  Markdown export                                                    */
/* ------------------------------------------------------------------ */

function buildMarkdown(report: DevReport, projectName?: string): string {
  const lines: string[] = [];
  lines.push(`## Dev Report${projectName ? ` — ${projectName}` : ''}`);
  lines.push(
    `**Since last push:** ${report.lastPushAt ? relativeTime(report.lastPushAt) : 'No previous push'}`
  );
  lines.push('');
  lines.push('### Summary');
  lines.push(`- **Files changed:** ${report.summary.totalFiles}`);
  lines.push(
    `- **Lines:** +${report.summary.totalLinesAdded} / -${report.summary.totalLinesRemoved}`
  );
  lines.push(`- **Components:** ${report.summary.componentsAffected}`);
  lines.push(`- **Pages:** ${report.summary.pagesWorked}`);
  lines.push('');
  lines.push('### Changed Files');

  const grouped = groupByCategory(report.files);
  for (const cat of CATEGORY_ORDER) {
    const files = grouped.get(cat);
    if (!files?.length) continue;
    lines.push(`#### ${CATEGORY_LABELS[cat]}`);
    for (const f of files) {
      const lineStat =
        f.status === 'added'
          ? `(+${f.linesAdded})`
          : `(+${f.linesAdded} / -${f.linesRemoved})`;
      lines.push(
        `- \`${f.path}\` — ${f.status === 'added' ? 'Added' : 'Modified'} ${lineStat}`
      );
    }
  }

  return lines.join('\n');
}

function groupByCategory(
  files: DevReportFile[]
): Map<FileCategory, DevReportFile[]> {
  const map = new Map<FileCategory, DevReportFile[]>();
  for (const f of files) {
    const list = map.get(f.category) ?? [];
    list.push(f);
    map.set(f.category, list);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface DevReportModalProps {
  report: DevReport;
  projectName?: string;
  /** When true, shows a warning banner that stats will reset after push. */
  prePush?: boolean;
  onClose: () => void;
  /** Called when user confirms push from the pre-push warning. */
  onConfirmPush?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DevReportModal({
  report,
  projectName,
  prePush,
  onClose,
  onConfirmPush,
}: DevReportModalProps) {
  const [collapsed, setCollapsed] = useState<Set<FileCategory>>(new Set());
  const [copied, setCopied] = useState(false);

  const grouped = useMemo(() => groupByCategory(report.files), [report.files]);

  const toggleCategory = useCallback((cat: FileCategory) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const handleCopy = useCallback(async () => {
    const md = buildMarkdown(report, projectName);
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [report, projectName]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="ide-overlay backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative ide-surface-pop rounded-xl shadow-2xl max-w-2xl w-full mx-4 border ide-border max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b ide-border-subtle shrink-0">
          <h2 className="text-sm font-semibold ide-text">Dev Report</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md ide-text-2 hover:ide-text ide-hover transition-colors border ide-border-subtle"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-accent" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy Report
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md ide-text-muted hover:ide-text ide-hover transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Pre-push warning banner */}
          {prePush && report.files.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-2 min-w-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 shrink-0">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Pushing will reset this report. Copy it first if you need it.
                </p>
              </div>
              {onConfirmPush && (
                <button
                  type="button"
                  onClick={onConfirmPush}
                  className="shrink-0 px-3 py-1.5 text-[11px] font-medium rounded-md bg-sky-500 text-white hover:bg-sky-600 transition-colors"
                >
                  Push anyway
                </button>
              )}
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Files Changed" value={report.summary.totalFiles} />
            <SummaryCard
              label="Lines Changed"
              value={`+${report.summary.totalLinesAdded} / -${report.summary.totalLinesRemoved}`}
            />
            <SummaryCard label="Components" value={report.summary.componentsAffected} />
            <SummaryCard label="Pages" value={report.summary.pagesWorked} />
          </div>

          {/* Last push */}
          <p className="text-[11px] ide-text-muted">
            Since last push:{' '}
            <span className="ide-text-2 font-medium">
              {report.lastPushAt ? relativeTime(report.lastPushAt) : 'No previous push'}
            </span>
          </p>

          {/* File breakdown */}
          {report.files.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm ide-text-muted">No pending changes since last push.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {CATEGORY_ORDER.map((cat) => {
                const files = grouped.get(cat);
                if (!files?.length) return null;
                const isCollapsed = collapsed.has(cat);

                return (
                  <div key={cat}>
                    <button
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md ide-hover transition-colors"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 ide-text-muted" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 ide-text-muted" />
                      )}
                      <span className="ide-text-2">{CATEGORY_ICONS[cat]}</span>
                      <span className="text-[11px] font-medium ide-text">
                        {CATEGORY_LABELS[cat]}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full ide-surface-inset ide-text-muted border ide-border-subtle">
                        {files.length}
                      </span>
                    </button>

                    {!isCollapsed && (
                      <div className="ml-8 mt-0.5 space-y-0.5">
                        {files.map((f) => (
                          <div
                            key={f.path}
                            className="flex items-center justify-between px-2 py-1 rounded-md hover:ide-surface-inset transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                  f.status === 'added'
                                    ? 'bg-sky-500/10 text-accent'
                                    : 'bg-amber-500/10 text-amber-500 dark:text-amber-400'
                                }`}
                              >
                                {f.status === 'added' ? 'Added' : 'Modified'}
                              </span>
                              <span className="text-[11px] ide-text-2 truncate font-mono">
                                {f.path}
                              </span>
                            </div>
                            <span className="text-[10px] ide-text-muted whitespace-nowrap ml-3">
                              {f.linesAdded > 0 && (
                                <span className="text-accent">+{f.linesAdded}</span>
                              )}
                              {f.linesRemoved > 0 && (
                                <span className="text-red-400 dark:text-red-400 ml-1">
                                  -{f.linesRemoved}
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t ide-border-subtle shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md ide-text-2 hover:ide-text ide-hover transition-colors"
          >
            <Copy className="h-3 w-3" />
            Copy as Markdown
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] font-medium rounded-md ide-surface-inset ide-text hover:ide-text ide-hover border ide-border-subtle transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Summary card sub-component                                         */
/* ------------------------------------------------------------------ */

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="ide-surface-inset rounded-lg p-3 border ide-border-subtle">
      <p className="text-lg font-semibold ide-text leading-tight">{value}</p>
      <p className="text-[10px] ide-text-muted mt-0.5">{label}</p>
    </div>
  );
}
