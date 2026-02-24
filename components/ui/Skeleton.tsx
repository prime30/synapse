'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

export type SkeletonVariant = 'text' | 'avatar' | 'card' | 'list' | 'code';

const TEXT_WIDTHS = ['w-full', 'w-4/5', 'w-3/5'] as const;

export interface SkeletonProps {
  variant?: SkeletonVariant;
  lines?: number;
  className?: string;
}

export function Skeleton({
  variant = 'text',
  lines = 3,
  className,
}: SkeletonProps) {
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const baseClasses =
    'bg-stone-200 dark:bg-white/10 rounded ' +
    (prefersReducedMotion ? '' : 'animate-pulse');

  if (variant === 'avatar') {
    return (
      <div
        className={cn('w-10 h-10 rounded-full', baseClasses, className)}
        aria-busy="true"
        aria-label="Loading"
      />
    );
  }

  if (variant === 'card') {
    return (
      <div
        className={cn('h-32 rounded-lg', baseClasses, className)}
        aria-busy="true"
        aria-label="Loading"
      />
    );
  }

  if (variant === 'text') {
    return (
      <div
        className={cn('space-y-2', className)}
        aria-busy="true"
        aria-label="Loading"
      >
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={cn(
              'h-4 rounded',
              baseClasses,
              TEXT_WIDTHS[i % TEXT_WIDTHS.length]
            )}
          />
        ))}
      </div>
    );
  }

  if (variant === 'code') {
    const codeWidths = ['75%', '100%', '66%', '85%', '90%', '70%'];
    return (
      <div
        className={cn('space-y-2 font-mono', className)}
        aria-busy="true"
        aria-label="Loading"
      >
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={cn('h-4 rounded', baseClasses)}
            style={{
              marginLeft: `${(i % 4) * 16}px`,
              width: codeWidths[i % codeWidths.length],
            }}
          />
        ))}
      </div>
    );
  }

  if (variant === 'list') {
    return (
      <div
        className={cn('space-y-3', className)}
        aria-busy="true"
        aria-label="Loading"
      >
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div
              className={cn('w-10 h-10 shrink-0 rounded-full', baseClasses)}
            />
            <div className="flex-1 space-y-2">
              <div
                className={cn('h-4 rounded w-full', baseClasses)}
              />
              <div
                className={cn('h-3 rounded w-4/5', baseClasses)}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}
