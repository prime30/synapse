'use client';

/**
 * Custom React Flow node for theme files.
 * Shows: file type icon, file name, diagnostics badge, modified dot, file size.
 *
 * EPIC 15: Spatial Canvas
 */

import { memo, type CSSProperties } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { CanvasFileData } from '@/lib/ai/canvas-data-provider';

/* ------------------------------------------------------------------ */
/*  File type icons (inline SVG, 16x16)                                */
/* ------------------------------------------------------------------ */

const iconStyle: CSSProperties = { flexShrink: 0 };

function LiquidIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  );
}

function JavaScriptIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 15l2-2m4-4l2-2" />
      <path d="M8 12h.01M16 12h.01" />
    </svg>
  );
}

function CssIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 8h8M8 12h5M8 16h8" />
    </svg>
  );
}

function OtherIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

const FILE_ICONS: Record<CanvasFileData['fileType'], React.FC> = {
  liquid: LiquidIcon,
  javascript: JavaScriptIcon,
  css: CssIcon,
  other: OtherIcon,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function FileNodeInner(props: NodeProps) {
  const { data: rawData, selected } = props;
  const data = rawData as unknown as CanvasFileData;
  const Icon = FILE_ICONS[data.fileType] ?? OtherIcon;
  const hasDiagnostics = data.diagnosticsCount > 0;

  return (
    <div
      className={`
        relative flex items-center gap-2.5 px-3 py-2.5
        ide-surface-pop border rounded-lg shadow-lg
        transition-all duration-150
        min-w-[180px] max-w-[240px]
        ${selected ? 'border-sky-500 ring-1 ring-sky-500/30' : 'ide-border'}
        hover:ide-border
      `}
    >
      {/* React Flow handles */}
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-stone-400 dark:!bg-white/40 !border-stone-300 dark:!border-white/20" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-stone-400 dark:!bg-white/40 !border-stone-300 dark:!border-white/20" />

      {/* File type icon */}
      <Icon />

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium ide-text truncate">
            {data.fileName}
          </span>

          {/* Modified indicator dot */}
          {data.isModified && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
              title="Unsaved changes"
            />
          )}
        </div>

        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] ide-text-muted">{data.directory}</span>
          <span className="text-[10px] ide-text-quiet">·</span>
          <span className="text-[10px] ide-text-muted">{formatBytes(data.sizeBytes)}</span>
        </div>
      </div>

      {/* Diagnostics badge */}
      {hasDiagnostics && (
        <span
          className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full shadow-sm"
          title={`${data.diagnosticsCount} diagnostic${data.diagnosticsCount === 1 ? '' : 's'}`}
        >
          {data.diagnosticsCount > 99 ? '99+' : data.diagnosticsCount}
        </span>
      )}
    </div>
  );
}

export const FileNode = memo(FileNodeInner);
