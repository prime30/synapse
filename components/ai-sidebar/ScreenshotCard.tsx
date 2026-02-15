'use client';

import { useState } from 'react';
import { Camera, ExternalLink, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

export interface ScreenshotData {
  url: string;
  storeDomain?: string;
  themeId?: string;
  path?: string;
  error?: string;
}

export interface ScreenshotComparison {
  beforeUrl: string;
  afterUrl: string;
  diffPercentage?: number;
  threshold?: number;
  passed?: boolean;
}

interface ScreenshotCardProps {
  screenshots?: ScreenshotData[];
  comparison?: ScreenshotComparison;
}

export function ScreenshotCard({ screenshots, comparison }: ScreenshotCardProps) {
  const [expanded, setExpanded] = useState(false);

  const hasScreenshots = screenshots && screenshots.length > 0;
  const hasComparison = comparison != null;

  if (!hasScreenshots && !hasComparison) return null;

  return (
    <div className="my-2 rounded-lg border ide-border ide-surface-inset overflow-hidden">
      <button
        type="button"
        className="w-full px-3 py-2 border-b ide-border-subtle flex items-center gap-2 hover:ide-surface-input transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Camera className="w-3.5 h-3.5 ide-text-muted" />
        <span className="text-xs font-semibold ide-text-1 flex-1 text-left">
          {hasComparison ? 'Screenshot Comparison' : `Screenshot${screenshots!.length > 1 ? 's' : ''}`}
        </span>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 ide-text-muted" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 ide-text-muted" />
        )}
      </button>

      {expanded && (
        <div className="px-3 py-2 space-y-2">
          {/* Individual screenshots */}
          {hasScreenshots &&
            screenshots!.map((ss, i) => (
              <div key={i} className="space-y-1">
                {ss.error ? (
                  <div className="flex items-center gap-1.5 text-red-500 dark:text-red-400">
                    <AlertTriangle className="w-3 h-3" />
                    <span className="text-[11px]">{ss.error}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <a
                        href={ss.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] ide-text-2 hover:text-sky-500 dark:hover:text-sky-400 flex items-center gap-1"
                      >
                        {ss.storeDomain ?? 'Screenshot'}
                        {ss.path && ` — ${ss.path}`}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                    {ss.themeId && (
                      <p className="text-[10px] ide-text-quiet">Theme: {ss.themeId}</p>
                    )}
                  </>
                )}
              </div>
            ))}

          {/* Comparison result */}
          {hasComparison && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-3 text-[11px]">
                <span className="ide-text-2">Before</span>
                <span className="ide-text-muted">&rarr;</span>
                <span className="ide-text-2">After</span>
              </div>
              {comparison.diffPercentage != null && (
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-stone-200 dark:bg-stone-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        comparison.passed === false
                          ? 'bg-red-500'
                          : 'bg-accent'
                      }`}
                      style={{ width: `${Math.min(comparison.diffPercentage, 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] ide-text-muted whitespace-nowrap">
                    {comparison.diffPercentage.toFixed(1)}% diff
                  </span>
                </div>
              )}
              {comparison.passed === false && (
                <div className="flex items-center gap-1 text-red-500 dark:text-red-400">
                  <AlertTriangle className="w-3 h-3" />
                  <span className="text-[10px]">
                    Visual regression detected (threshold: {comparison.threshold ?? 2}%)
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
