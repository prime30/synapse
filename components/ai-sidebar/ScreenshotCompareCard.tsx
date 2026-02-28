'use client';

import React, { useState } from 'react';

interface ScreenshotCompareCardProps {
  beforeUrl?: string;
  afterUrl?: string;
  diffUrl?: string;
  diffPercentage: number;
  threshold: number;
  passed: boolean;
}

export function ScreenshotCompareCard({
  beforeUrl,
  afterUrl,
  diffUrl,
  diffPercentage,
  threshold,
  passed,
}: ScreenshotCompareCardProps) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-stone-200 dark:border-white/10 bg-stone-50 dark:bg-[#141414] p-3 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-stone-400 dark:text-stone-500 text-xs">screenshot compare</span>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${
            passed
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-red-500/10 text-red-500 dark:text-red-400'
          }`}
        >
          {passed ? 'PASS' : 'FAIL'}
        </span>
        <span className="text-stone-600 dark:text-stone-400 text-xs ml-auto">
          {diffPercentage.toFixed(1)}% diff (threshold: {threshold}%)
        </span>
      </div>

      {/* Diff percentage bar */}
      <div className="h-1.5 bg-stone-200 dark:bg-[#1e1e1e] rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all ${
            passed ? 'bg-green-500 dark:bg-green-400' : 'bg-red-500 dark:bg-red-400'
          }`}
          style={{ width: `${Math.min(diffPercentage / Math.max(threshold * 2, 1) * 100, 100)}%` }}
        />
      </div>

      {/* Image previews */}
      {(beforeUrl || afterUrl) && (
        <div className="flex gap-2">
          {beforeUrl && (
            <div className="flex-1 min-w-0">
              <p className="text-xs text-stone-400 dark:text-stone-500 mb-1">Before</p>
              <button
                onClick={() => setExpandedImage(expandedImage === beforeUrl ? null : beforeUrl)}
                className="rounded-lg border border-stone-200 dark:border-white/10 overflow-hidden bg-stone-100 dark:bg-[#141414] w-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={beforeUrl} alt="Before" className="w-full h-auto max-w-[300px]" />
              </button>
            </div>
          )}
          {afterUrl && (
            <div className="flex-1 min-w-0">
              <p className="text-xs text-stone-400 dark:text-stone-500 mb-1">After</p>
              <button
                onClick={() => setExpandedImage(expandedImage === afterUrl ? null : afterUrl)}
                className="rounded-lg border border-stone-200 dark:border-white/10 overflow-hidden bg-stone-100 dark:bg-[#141414] w-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={afterUrl} alt="After" className="w-full h-auto max-w-[300px]" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Diff image */}
      {diffUrl && (
        <div className="mt-2">
          <p className="text-xs text-stone-400 dark:text-stone-500 mb-1">Diff</p>
          <button
            onClick={() => setExpandedImage(expandedImage === diffUrl ? null : diffUrl)}
            className="rounded-lg border border-stone-200 dark:border-white/10 overflow-hidden bg-stone-100 dark:bg-[#141414] w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={diffUrl} alt="Diff" className="w-full h-auto" />
          </button>
        </div>
      )}

      {/* Expanded modal */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
          onClick={() => setExpandedImage(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={expandedImage} alt="Expanded" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}
