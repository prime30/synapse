'use client';

import { useState } from 'react';

interface RunCommandBlockProps {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut?: boolean;
}

function ExitCodeBadge({
  exitCode,
  timedOut,
}: {
  exitCode: number;
  timedOut?: boolean;
}) {
  const style = timedOut
    ? 'bg-amber-500/20 text-amber-400'
    : exitCode === 0
      ? 'bg-emerald-500/20 text-emerald-400'
      : 'bg-red-500/20 text-red-400';

  const label = timedOut ? 'timeout' : `exit ${exitCode}`;

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-medium leading-none ${style}`}
    >
      {label}
    </span>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={[
        'h-4 w-4 ide-text-muted transition-transform duration-200',
        expanded ? 'rotate-90' : '',
      ].join(' ')}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M7.293 14.707a1 1 0 0 1 0-1.414L10.586 10 7.293 6.707a1 1 0 0 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function RunCommandBlock({
  command,
  stdout,
  stderr,
  exitCode,
  timedOut,
}: RunCommandBlockProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-2 rounded-lg border border-sky-200/50 dark:border-sky-500/20 bg-sky-500/5 dark:bg-sky-500/10 overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-sky-500/5 dark:hover:bg-sky-500/5"
      >
        <ChevronIcon expanded={expanded} />
        <span className="flex-1 min-w-0 truncate text-xs ide-text">
          <span className="ide-text-muted">Agent ran:</span>{' '}
          <code className="font-mono">{command}</code>
        </span>
        <ExitCodeBadge exitCode={exitCode} timedOut={timedOut} />
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-sky-200/50 dark:border-sky-500/20 px-3 py-2 space-y-2">
          {stdout && (
            <pre className="rounded bg-black/20 dark:bg-black/30 p-2 text-xs font-mono leading-relaxed ide-text whitespace-pre-wrap break-all overflow-x-auto">
              {stdout}
            </pre>
          )}

          {stderr && (
            <pre className="rounded bg-red-500/5 dark:bg-red-500/10 border border-red-500/10 dark:border-red-500/20 p-2 text-xs font-mono leading-relaxed text-red-400 whitespace-pre-wrap break-all overflow-x-auto">
              {stderr}
            </pre>
          )}

          {!stdout && !stderr && (
            <p className="text-xs ide-text-muted italic py-1">
              No output
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <ExitCodeBadge exitCode={exitCode} timedOut={timedOut} />
            {timedOut && (
              <span className="text-[10px] text-amber-400">
                Command timed out
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
