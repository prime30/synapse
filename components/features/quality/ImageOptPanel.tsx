'use client';

import { useMemo } from 'react';
import {
  FileImage,
  CheckCircle,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { analyzeImages, type ImageIssue, type ImageReport } from '@/lib/quality/image-optimizer';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ImageOptPanelProps {
  files: { path: string; content: string }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ISSUE_BADGES: Record<string, { label: string; className: string }> = {
  'no-lazy-loading': { label: 'Lazy Load', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  'no-srcset': { label: 'Srcset', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  'no-webp': { label: 'WebP', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
  'oversized': { label: 'Oversized', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
  'no-alt': { label: 'Alt Text', className: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  'no-width-height': { label: 'Dimensions', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
};

function groupByFile(issues: ImageIssue[]): Map<string, ImageIssue[]> {
  const map = new Map<string, ImageIssue[]>();
  for (const issue of issues) {
    const list = map.get(issue.path) ?? [];
    list.push(issue);
    map.set(issue.path, list);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImageOptPanel({ files }: ImageOptPanelProps) {
  const report: ImageReport = useMemo(() => analyzeImages(files), [files]);

  const grouped = useMemo(() => groupByFile(report.issues), [report.issues]);

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <FileImage className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-200">Image Optimization</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center px-2 py-2 rounded-lg bg-gray-800/50 border border-gray-800">
            <p className="text-lg font-bold tabular-nums text-gray-300">
              {report.totalImages}
            </p>
            <p className="text-[10px] text-gray-500">Total Images</p>
          </div>
          <div className="text-center px-2 py-2 rounded-lg bg-gray-800/50 border border-gray-800">
            <p className="text-lg font-bold tabular-nums text-green-400">
              {report.optimizedCount}
            </p>
            <p className="text-[10px] text-gray-500">Optimized</p>
          </div>
          <div className="text-center px-2 py-2 rounded-lg bg-gray-800/50 border border-gray-800">
            <p className="text-lg font-bold tabular-nums text-yellow-400">
              {report.potentialSavings}
            </p>
            <p className="text-[10px] text-gray-500">Savings</p>
          </div>
        </div>

        {/* Issues grouped by file */}
        {report.issues.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-gray-400">All images are optimised!</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider px-1">
              Issues by File
            </h3>
            {Array.from(grouped.entries()).map(([filePath, issues]) => (
              <div
                key={filePath}
                className="border border-gray-800 rounded-lg overflow-hidden"
              >
                {/* File header */}
                <div className="px-3 py-2 bg-gray-800/40 flex items-center gap-2">
                  <FileImage className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                  <span className="text-xs font-mono text-gray-300 truncate">
                    {filePath}
                  </span>
                  <span className="ml-auto text-[10px] text-gray-500 flex-shrink-0">
                    {issues.length} issue{issues.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Issues list */}
                <div className="divide-y divide-gray-800/60">
                  {issues.map((issue, i) => {
                    const badge = ISSUE_BADGES[issue.issue] ?? {
                      label: issue.issue,
                      className: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
                    };
                    return (
                      <div
                        key={`${issue.issue}-${i}`}
                        className="px-3 py-2 flex items-start gap-2"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span
                              className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                            {issue.estimatedSavings && (
                              <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                                <Info className="w-3 h-3" />
                                {issue.estimatedSavings}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400">
                            {issue.recommendation}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
