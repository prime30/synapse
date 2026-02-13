'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TokenType = 'color' | 'font' | 'fontSize' | 'spacing' | 'radius' | 'shadow';

export interface TokenCardProps {
  value: string;
  type: TokenType;
  /** Files where this token is used (optional). */
  usageFiles?: string[];
  /** Usage count override. */
  usageCount?: number;
}

// ---------------------------------------------------------------------------
// Visual previews per token type
// ---------------------------------------------------------------------------

function ColorPreview({ value }: { value: string }) {
  return (
    <div
      className="w-8 h-8 rounded border ide-border flex-shrink-0"
      style={{ backgroundColor: value }}
      title={value}
    />
  );
}

function FontPreview({ value }: { value: string }) {
  return (
    <span
      className="text-sm ide-text truncate max-w-[140px]"
      style={{ fontFamily: value }}
      title={value}
    >
      Aa Bb Cc
    </span>
  );
}

function FontSizePreview({ value }: { value: string }) {
  return (
    <span
      className="ide-text leading-none truncate"
      style={{ fontSize: value }}
      title={value}
    >
      Aa
    </span>
  );
}

function SpacingPreview({ value }: { value: string }) {
  const numericMatch = value.match(/([\d.]+)/);
  const numeric = numericMatch ? parseFloat(numericMatch[1]) : 0;
  const maxBar = 120;
  const barWidth = Math.min(Math.max(numeric * 4, 4), maxBar);

  return (
    <div className="flex items-center gap-2">
      <div
        className="h-3 rounded-sm bg-sky-500/60"
        style={{ width: `${barWidth}px` }}
      />
      <span className="text-[10px] ide-text-muted">{value}</span>
    </div>
  );
}

function RadiusPreview({ value }: { value: string }) {
  return (
    <div
      className="w-8 h-8 border-2 border-sky-400/60 bg-transparent"
      style={{ borderRadius: value }}
      title={value}
    />
  );
}

function ShadowPreview({ value }: { value: string }) {
  return (
    <div
      className="w-8 h-8 rounded ide-surface-inset"
      style={{ boxShadow: value }}
      title={value}
    />
  );
}

const previewMap: Record<TokenType, React.ComponentType<{ value: string }>> = {
  color: ColorPreview,
  font: FontPreview,
  fontSize: FontSizePreview,
  spacing: SpacingPreview,
  radius: RadiusPreview,
  shadow: ShadowPreview,
};

// ---------------------------------------------------------------------------
// TokenCard
// ---------------------------------------------------------------------------

export function TokenCard({ value, type, usageFiles, usageCount }: TokenCardProps) {
  const [expanded, setExpanded] = useState(false);
  const Preview = previewMap[type];
  const hasUsages = (usageFiles && usageFiles.length > 0) || (usageCount && usageCount > 0);
  const count = usageCount ?? usageFiles?.length ?? 0;

  return (
    <button
      type="button"
      onClick={() => hasUsages && setExpanded((p) => !p)}
      className={[
        'w-full text-left px-2.5 py-2 rounded-md border transition-colors',
        'ide-surface-panel ide-border ide-hover',
        hasUsages ? 'cursor-pointer' : 'cursor-default',
      ].join(' ')}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Preview value={value} />
        <span className="text-xs ide-text font-mono truncate flex-1 min-w-0">
          {value}
        </span>
        {count > 0 && (
          <span className="text-[10px] ide-text-muted flex-shrink-0">
            {count} use{count !== 1 ? 's' : ''}
          </span>
        )}
        {hasUsages && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className={`w-3 h-3 ide-text-muted flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </div>

      {/* Expanded: file usage list */}
      {expanded && usageFiles && usageFiles.length > 0 && (
        <div className="mt-2 pt-2 border-t ide-border space-y-0.5">
          {usageFiles.map((fp) => (
            <p key={fp} className="text-[10px] ide-text-muted font-mono truncate">
              {fp}
            </p>
          ))}
        </div>
      )}
    </button>
  );
}
