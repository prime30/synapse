'use client';

import React from 'react';
import { Check } from 'lucide-react';

export interface AgentCardProps {
  workerId: string;
  label: string;
  status: 'running' | 'complete';
  /** Files being worked on by this agent */
  files?: string[];
  /** Token usage for this agent */
  tokens?: { input: number; output: number };
  /** Time elapsed in seconds */
  elapsedSeconds?: number;
}

export function AgentCard({
  workerId,
  label,
  status,
  files,
  tokens,
  elapsedSeconds,
}: AgentCardProps) {
  const isRunning = status === 'running';

  const borderClass = isRunning
    ? 'border-sky-500/20 bg-sky-500/5'
    : 'border-emerald-500/20 bg-emerald-500/5';

  const pulseClass = isRunning ? 'animate-pulse' : '';

  const fileList =
    files && files.length > 0
      ? files.join(', ').slice(0, 40) + (files.join(', ').length > 40 ? '…' : '')
      : null;

  const tokenStr =
    tokens != null
      ? String(tokens.input + tokens.output)
      : null;

  const elapsedStr =
    elapsedSeconds != null
      ? String(elapsedSeconds) + 's'
      : null;

  return (
    <div
      className={
        'flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors ' +
        borderClass +
        ' ' +
        pulseClass
      }
      data-worker-id={workerId}
    >
      <div className="flex-shrink-0">
        {isRunning ? (
          <span className="h-3.5 w-3.5 rounded-full border-2 border-sky-500/50 bg-sky-500/20 inline-block" aria-hidden />
        ) : (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className={`text-xs font-bold truncate ${isRunning ? 'animate-pulse' : ''}`}>{label}</span>
        {fileList != null && (
          <span className="text-[10px] text-muted-foreground truncate">
            {fileList}
          </span>
        )}
      </div>

      <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
        {tokenStr != null && (
          <span className="text-[10px] font-mono">{tokenStr}</span>
        )}
        {elapsedStr != null && (
          <span className="text-[10px] font-mono">{elapsedStr}</span>
        )}
      </div>
    </div>
  );
}
