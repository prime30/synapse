'use client';

import React, { useState } from 'react';
import { LambdaDots } from '@/components/ui/LambdaDots';

export interface SpecialistToolCall {
  name: string;
  detail: string;
  status: 'pending' | 'done' | 'error';
}

export interface SpecialistStreamPanelProps {
  agentName: string;
  status: 'running' | 'complete' | 'failed';
  toolCalls: SpecialistToolCall[];
  editedFiles: string[];
  isExpanded: boolean;
  onToggle: () => void;
}

export function SpecialistStreamPanel({
  agentName,
  status,
  toolCalls,
  editedFiles,
  isExpanded,
  onToggle,
}: SpecialistStreamPanelProps) {
  const statusIcon =
    status === 'complete' ? (
      <svg className="h-3.5 w-3.5 text-[#28CD56]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
    ) : status === 'failed' ? (
      <svg className="h-3.5 w-3.5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
    ) : (
      <LambdaDots size={14} />
    );

  const label = agentName.charAt(0).toUpperCase() + agentName.slice(1);
  const doneCount = toolCalls.filter(t => t.status === 'done').length;

  return (
    <div className="rounded-lg border border-stone-200 dark:border-white/10 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left bg-[#fafaf9] dark:bg-[#0a0a0a] hover:bg-stone-100 dark:hover:bg-white/5 transition-colors"
      >
        {statusIcon}
        <span className="text-stone-900 dark:text-white text-xs font-medium flex-1">
          {label} specialist
        </span>
        {toolCalls.length > 0 && (
          <span className="text-stone-500 dark:text-gray-500 text-[10px]">
            {doneCount}/{toolCalls.length}
          </span>
        )}
        {editedFiles.length > 0 && (
          <span className="text-[#28CD56] text-[10px] font-medium">
            {editedFiles.length} edited
          </span>
        )}
        <svg
          className={`h-3 w-3 text-stone-400 dark:text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isExpanded && toolCalls.length > 0 && (
        <div className="divide-y divide-stone-100 dark:divide-white/5 bg-white dark:bg-white/[0.02]">
          {toolCalls.map((tc, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5">
              {tc.status === 'done' ? (
                <svg className="h-2.5 w-2.5 text-[#28CD56] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : tc.status === 'error' ? (
                <svg className="h-2.5 w-2.5 text-red-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              ) : (
                <LambdaDots size={10} />
              )}
              <span className="text-stone-600 dark:text-gray-400 text-[11px] truncate">
                {tc.name}
              </span>
              {tc.detail && (
                <span className="text-stone-400 dark:text-gray-600 text-[10px] truncate ml-auto">
                  {tc.detail}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function useSpecialistPanelState() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (agentName: string) =>
    setExpanded(prev => ({ ...prev, [agentName]: !prev[agentName] }));
  const isExpanded = (agentName: string) => expanded[agentName] ?? false;
  return { toggle, isExpanded };
}
