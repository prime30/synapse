'use client';

import React, { useState } from 'react';
import {
  X,
  ChevronDown,
  ChevronRight,
  Zap,
  Eye,
  Search,
  CheckCircle,
  Code,
  Wrench,
} from 'lucide-react';
import type {
  ThemeReviewReport,
  ThemeReviewCategory,
  CategoryIssue,
  FileIssue,
} from '@/lib/ai/theme-reviewer';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ThemeReviewReportProps {
  report: ThemeReviewReport;
  onClose?: () => void;
  onFixIssue?: (file: string, issue: CategoryIssue) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a numeric score (0-100) to a colour tier. */
function scoreColor(score: number): {
  text: string;
  bg: string;
  ring: string;
  bar: string;
} {
  if (score >= 80)
    return {
      text: 'text-green-400',
      bg: 'bg-green-500/20',
      ring: 'ring-green-500/30',
      bar: 'bg-green-500',
    };
  if (score >= 50)
    return {
      text: 'text-yellow-400',
      bg: 'bg-yellow-500/20',
      ring: 'ring-yellow-500/30',
      bar: 'bg-yellow-500',
    };
  return {
    text: 'text-red-400',
    bg: 'bg-red-500/20',
    ring: 'ring-red-500/30',
    bar: 'bg-red-500',
  };
}

/** Map severity to badge classes. */
function severityBadge(severity: CategoryIssue['severity']): {
  text: string;
  bg: string;
  label: string;
} {
  switch (severity) {
    case 'critical':
      return { text: 'text-red-400', bg: 'bg-red-500/20', label: 'Critical' };
    case 'warning':
      return {
        text: 'text-yellow-400',
        bg: 'bg-yellow-500/20',
        label: 'Warning',
      };
    case 'info':
    default:
      return { text: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Info' };
  }
}

/** Map category name to a Lucide icon component. */
const CATEGORY_ICONS: Record<
  ThemeReviewCategory['name'],
  React.FC<React.SVGProps<SVGSVGElement>>
> = {
  performance: Zap,
  accessibility: Eye,
  seo: Search,
  'best-practices': CheckCircle,
  'liquid-quality': Code,
};

/** Human-readable category labels. */
const CATEGORY_LABELS: Record<ThemeReviewCategory['name'], string> = {
  performance: 'Performance',
  accessibility: 'Accessibility',
  seo: 'SEO',
  'best-practices': 'Best Practices',
  'liquid-quality': 'Liquid Quality',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Pill-shaped score badge. */
function ScoreBadge({
  score,
  size = 'md',
}: {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  const { text, bg, ring } = scoreColor(score);
  const sizeClasses =
    size === 'lg'
      ? 'text-lg font-bold px-3 py-1'
      : size === 'sm'
        ? 'text-[10px] font-semibold px-1.5 py-0.5'
        : 'text-xs font-semibold px-2 py-0.5';

  return (
    <span
      className={`inline-flex items-center rounded-full ring-1 ${text} ${bg} ${ring} ${sizeClasses}`}
    >
      {score}
    </span>
  );
}

/** Horizontal score progress bar. */
function ScoreBar({ score }: { score: number }) {
  const { bar } = scoreColor(score);
  return (
    <div className="h-1.5 w-full rounded-full bg-gray-700/60 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${bar}`}
        style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
      />
    </div>
  );
}

/** Single issue row. */
function IssueItem({
  issue,
  file,
  onFix,
}: {
  issue: CategoryIssue;
  file?: string;
  onFix?: (file: string, issue: CategoryIssue) => void;
}) {
  const badge = severityBadge(issue.severity);
  const resolvedFile = issue.file ?? file;

  return (
    <div className="group flex flex-col gap-1 rounded border border-gray-700/40 bg-gray-800/30 px-2 py-1.5 text-xs">
      <div className="flex items-start gap-1.5">
        {/* Severity badge */}
        <span
          className={`mt-px shrink-0 rounded px-1 py-px text-[10px] font-medium leading-tight ${badge.text} ${badge.bg}`}
        >
          {badge.label}
        </span>
        <span className="text-gray-300 leading-snug flex-1 break-words">
          {issue.message}
        </span>
      </div>

      {/* File + line reference */}
      {resolvedFile && (
        <span className="text-[10px] text-gray-500 truncate pl-0.5">
          {resolvedFile}
          {issue.line != null && `:${issue.line}`}
        </span>
      )}

      {/* Suggestion */}
      {issue.suggestion && (
        <span className="text-[10px] text-gray-400 italic pl-0.5 leading-snug">
          {issue.suggestion}
        </span>
      )}

      {/* Fix button */}
      {onFix && resolvedFile && (
        <button
          type="button"
          onClick={() => onFix(resolvedFile, issue)}
          className="mt-0.5 inline-flex items-center gap-1 self-start rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-blue-500/20"
        >
          <Wrench className="h-3 w-3" />
          Fix
        </button>
      )}
    </div>
  );
}

/** Expandable category card. */
function CategoryCard({
  category,
  expanded,
  onToggle,
  onFixIssue,
}: {
  category: ThemeReviewCategory;
  expanded: boolean;
  onToggle: () => void;
  onFixIssue?: (file: string, issue: CategoryIssue) => void;
}) {
  const Icon = CATEGORY_ICONS[category.name];
  const label = CATEGORY_LABELS[category.name];
  const { text } = scoreColor(category.score);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="rounded border border-gray-700/60 bg-gray-800/40 overflow-hidden">
      {/* Header (clickable) */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-gray-800/60 transition-colors"
        aria-expanded={expanded}
      >
        <Chevron className="h-3.5 w-3.5 shrink-0 text-gray-500" />
        <Icon className={`h-3.5 w-3.5 shrink-0 ${text}`} />
        <span className="flex-1 text-xs font-medium text-gray-200 truncate">
          {label}
        </span>
        {category.issues.length > 0 && (
          <span className="rounded-full bg-gray-700/60 px-1.5 py-px text-[10px] font-medium text-gray-400">
            {category.issues.length}
          </span>
        )}
        <ScoreBadge score={category.score} size="sm" />
      </button>

      {/* Score bar */}
      <div className="px-2 pb-1.5">
        <ScoreBar score={category.score} />
      </div>

      {/* Expanded issues list */}
      {expanded && category.issues.length > 0 && (
        <div className="flex flex-col gap-1 px-2 pb-2">
          {category.issues.map((issue, idx) => (
            <IssueItem
              key={`${issue.message}-${idx}`}
              issue={issue}
              onFix={onFixIssue}
            />
          ))}
        </div>
      )}

      {expanded && category.issues.length === 0 && (
        <div className="px-2 pb-2 text-[10px] text-gray-500">
          No issues found — great work!
        </div>
      )}
    </div>
  );
}

/** Expandable per-file issues section. */
function FileIssuesSection({
  fileIssue,
  expanded,
  onToggle,
  onFixIssue,
}: {
  fileIssue: FileIssue;
  expanded: boolean;
  onToggle: () => void;
  onFixIssue?: (file: string, issue: CategoryIssue) => void;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const criticalCount = fileIssue.issues.filter(
    (i) => i.severity === 'critical',
  ).length;

  return (
    <div className="rounded border border-gray-700/40 bg-gray-800/30 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-800/50 transition-colors"
        aria-expanded={expanded}
      >
        <Chevron className="h-3 w-3 shrink-0 text-gray-500" />
        <Code className="h-3 w-3 shrink-0 text-gray-500" />
        <span className="flex-1 text-[11px] font-medium text-gray-300 truncate">
          {fileIssue.file}
        </span>
        {criticalCount > 0 && (
          <span className="rounded-full bg-red-500/20 px-1.5 py-px text-[10px] font-medium text-red-400">
            {criticalCount}
          </span>
        )}
        <span className="rounded-full bg-gray-700/60 px-1.5 py-px text-[10px] font-medium text-gray-400">
          {fileIssue.issues.length}
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-1 px-2 pb-2">
          {fileIssue.issues.map((issue, idx) => (
            <IssueItem
              key={`${issue.message}-${idx}`}
              issue={issue}
              file={fileIssue.file}
              onFix={onFixIssue}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ThemeReviewReport({
  report,
  onClose,
  onFixIssue,
}: ThemeReviewReportProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleFile = (file: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  const totalIssues = report.categories.reduce(
    (sum, cat) => sum + cat.issues.length,
    0,
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-900 text-gray-200">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-300">
            Theme Review
          </span>
          <ScoreBadge score={report.overallScore} size="lg" />
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
            aria-label="Close review report"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-2 space-y-3">
        {/* Summary stats */}
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span>
            {report.categories.length} categories &middot; {totalIssues} issues
          </span>
          <span>
            Reviewed{' '}
            {new Date(report.reviewedAt).toLocaleString(undefined, {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </span>
        </div>

        {/* ── Category cards ──────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Categories
          </h3>
          {report.categories.map((cat) => (
            <CategoryCard
              key={cat.name}
              category={cat}
              expanded={expandedCategories.has(cat.name)}
              onToggle={() => toggleCategory(cat.name)}
              onFixIssue={onFixIssue}
            />
          ))}
        </div>

        {/* ── File issues ─────────────────────────────────────────────── */}
        {report.fileIssues.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Issues by File
            </h3>
            {report.fileIssues.map((fi) => (
              <FileIssuesSection
                key={fi.file}
                fileIssue={fi}
                expanded={expandedFiles.has(fi.file)}
                onToggle={() => toggleFile(fi.file)}
                onFixIssue={onFixIssue}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
