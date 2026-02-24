'use client';

import { useMemo, useState, useCallback } from 'react';
import { ChevronUp, ChevronDown, Sparkles } from 'lucide-react';
import type { AgentEdit } from '@/hooks/useAgentEdits';

interface FileBreadcrumbProps {
  filePath: string | null;
  content?: string;
  onNavigate?: (segmentPath: string) => void;
  onAddToChatContext?: (filePath: string) => void;
  agentEdits?: AgentEdit[];
  onScrollToLine?: (line: number) => void;
}

/* ------------------------------------------------------------------ */
/*  Liquid schema parser                                               */
/* ------------------------------------------------------------------ */

function parseLiquidSchemaBlocks(content: string): string[] {
  const schemaMatch = content.match(/\{%[-\s]*schema\s*[-\s]*%\}([\s\S]*?)\{%[-\s]*endschema\s*[-\s]*%\}/);
  if (!schemaMatch) return [];
  try {
    const json = JSON.parse(schemaMatch[1]);
    if (Array.isArray(json.blocks)) {
      return json.blocks
        .map((b: { type?: string }) => b.type)
        .filter((t: unknown): t is string => typeof t === 'string');
    }
  } catch {
    // Malformed JSON — ignore
  }
  return [];
}

/* ------------------------------------------------------------------ */
/*  Chevron separator                                                  */
/* ------------------------------------------------------------------ */

function Chevron() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="ide-text-3 shrink-0"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FileBreadcrumb({ filePath, content, onNavigate, onAddToChatContext, agentEdits = [], onScrollToLine }: FileBreadcrumbProps) {
  const [editIndex, setEditIndex] = useState(0);

  const goToEdit = useCallback((idx: number) => {
    if (agentEdits.length === 0 || !onScrollToLine) return;
    const clamped = ((idx % agentEdits.length) + agentEdits.length) % agentEdits.length;
    setEditIndex(clamped);
    onScrollToLine(agentEdits[clamped].startLine);
  }, [agentEdits, onScrollToLine]);
  const segments = useMemo(() => {
    if (!filePath) return [];

    const parts = filePath.split('/').filter(Boolean);
    const isLiquid = filePath.endsWith('.liquid');
    const hasSchema = isLiquid && content ? /\{%[-\s]*schema\s*[-\s]*%\}/.test(content) : false;

    const result: string[] = [...parts];

    if (hasSchema && content) {
      result.push('{% schema %}');
      const blockTypes = parseLiquidSchemaBlocks(content);
      if (blockTypes.length > 0) {
        result.push('blocks');
        blockTypes.forEach((bt) => result.push(bt));
      }
    }

    return result;
  }, [filePath, content]);

  if (segments.length === 0) return null;

  return (
    <div className="h-6 flex items-center gap-1 px-3 ide-surface-input border-b ide-border-subtle overflow-x-auto select-none">
      {segments.map((segment, idx) => (
        <span key={`${segment}-${idx}`} className="flex items-center gap-1 shrink-0">
          {idx > 0 && <Chevron />}
          <button
            type="button"
            onClick={() => {
              if (!filePath) return;
              const parts = filePath.split('/').filter(Boolean);
              const isPathSegment = idx < parts.length;

              if (isPathSegment && idx === parts.length - 1 && onAddToChatContext) {
                onAddToChatContext(filePath);
                return;
              }

              if (isPathSegment && onNavigate) {
                onNavigate(parts.slice(0, idx + 1).join('/'));
              }
            }}
            className="text-xs ide-text-3 hover:ide-text-2 transition-colors whitespace-nowrap"
            title={
              filePath && idx === filePath.split('/').filter(Boolean).length - 1
                ? 'Add file to agent context'
                : undefined
            }
          >
            {segment}
          </button>
        </span>
      ))}

      {agentEdits.length > 0 && onScrollToLine && (
        <>
          <div className="flex-1" />
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              type="button"
              onClick={() => goToEdit(editIndex)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-sky-500 dark:text-sky-400 hover:bg-sky-500/10 transition-colors whitespace-nowrap"
              title={`${agentEdits.length} agent edit${agentEdits.length !== 1 ? 's' : ''}`}
            >
              <Sparkles className="w-3 h-3" />
              See agent edits
            </button>
            <button
              type="button"
              onClick={() => goToEdit(editIndex - 1)}
              className="p-0.5 rounded ide-text-3 hover:ide-text-2 hover:bg-sky-500/10 transition-colors"
              title="Previous edit"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => goToEdit(editIndex + 1)}
              className="p-0.5 rounded ide-text-3 hover:ide-text-2 hover:bg-sky-500/10 transition-colors"
              title="Next edit"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
            <span className="text-[10px] ide-text-muted tabular-nums">
              {editIndex + 1}/{agentEdits.length}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
