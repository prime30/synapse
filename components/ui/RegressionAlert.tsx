'use client';

import { useState } from 'react';
import type { RegressionResult } from '@/lib/preview/visual-regression';

interface RegressionAlertProps {
  result: RegressionResult;
  onDismiss: () => void;
  onRollback?: () => void;
}

/**
 * Visual regression alert overlay. Shows the diff percentage,
 * a minimap of changed regions, and rollback action.
 */
export function RegressionAlert({
  result,
  onDismiss,
  onRollback,
}: RegressionAlertProps) {
  const [showDiff, setShowDiff] = useState(false);

  if (!result.hasRegression) return null;

  return (
    <div className="border border-amber-500/30 rounded-lg bg-amber-500/10 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-300">Visual Change Detected</p>
            <p className="text-xs ide-text-muted">
              {result.diffPercentage.toFixed(1)}% of pixels changed across {result.changedRegions.length} region{result.changedRegions.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs ide-text-muted hover:ide-text transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Diff image toggle */}
      {result.diffImageUrl && (
        <div>
          <button
            type="button"
            onClick={() => setShowDiff(v => !v)}
            className="text-xs text-sky-400 hover:text-sky-300 transition-colors"
          >
            {showDiff ? 'Hide' : 'Show'} visual diff
          </button>
          {showDiff && (
            <div className="mt-2 rounded overflow-hidden border ide-border-subtle">
              <img
                src={result.diffImageUrl}
                alt="Visual regression diff"
                className="w-full h-auto"
              />
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {onRollback && (
          <button
            type="button"
            onClick={onRollback}
            className="px-3 py-1 text-xs rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors font-medium"
          >
            Rollback changes
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="px-3 py-1 text-xs rounded ide-surface-inset ide-text-muted hover:ide-text transition-colors"
        >
          Accept changes
        </button>
      </div>
    </div>
  );
}
