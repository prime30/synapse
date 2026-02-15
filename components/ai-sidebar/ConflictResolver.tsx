'use client';

import React, { useState } from 'react';
import { AlertTriangle, Check, GitMerge } from 'lucide-react';

interface ConflictResolverProps {
  conflicts: Array<{
    filePath: string;
    edits: Array<{
      agentId: string;
      agentLabel: string;
      newContent: string;
      reasoning?: string;
    }>;
  }>;
  onResolve: (filePath: string, selectedAgentId: string) => void;
  onResolveAll: () => void;
}

export function ConflictResolver({
  conflicts,
  onResolve,
  onResolveAll,
}: ConflictResolverProps) {
  const [selectedAgents, setSelectedAgents] = useState<Record<string, string>>(
    () => {
      const initial: Record<string, string> = {};
      for (const c of conflicts) {
        if (c.edits.length > 0) {
          initial[c.filePath] = c.edits[0].agentId;
        }
      }
      return initial;
    }
  );

  if (!conflicts || conflicts.length === 0) {
    return null;
  }

  const count = conflicts.length;
  const bannerText =
    count === 1
      ? '1 file conflict(s) detected'
      : String(count) + ' file conflict(s) detected';

  const handleSelect = (filePath: string, agentId: string) => {
    setSelectedAgents((prev) => ({ ...prev, [filePath]: agentId }));
  };

  const handleApplySelections = () => {
    for (const c of conflicts) {
      const agentId = selectedAgents[c.filePath];
      if (agentId) {
        onResolve(c.filePath, agentId);
      }
    }
  };

  const truncate = (text: string, maxLen: number) => {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
  };

  return (
    <div className="space-y-3">
      <div
        className={
          'flex items-center gap-2 rounded-lg border p-2 ' +
          'bg-amber-500/10 border-amber-500/20 text-amber-500'
        }
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">{bannerText}</span>
      </div>

      {conflicts.map((conflict) => (
        <div
          key={conflict.filePath}
          className={
            'rounded-lg border p-2 space-y-1.5 ' +
            'ide-border-subtle'
          }
        >
          <div className="text-sm font-medium text-foreground">
            {conflict.filePath}
          </div>
          <div className="space-y-2">
            {conflict.edits.map((edit) => {
              const isSelected = selectedAgents[conflict.filePath] === edit.agentId;
              return (
                <div
                  key={edit.agentId}
                  className={
                    'flex items-start gap-2 rounded-md p-2 transition-colors ' +
                    (isSelected
                      ? 'ring-2 ring-sky-500/50 bg-sky-500/5'
                      : 'hover:bg-muted/50')
                  }
                >
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                      {edit.agentLabel}
                    </span>
                    {edit.reasoning && (
                      <p className="text-xs text-muted-foreground">
                        {truncate(edit.reasoning, 100)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelect(conflict.filePath, edit.agentId)}
                    className={
                      'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ' +
                      'bg-primary text-primary-foreground hover:bg-primary/90'
                    }
                  >
                    {isSelected ? (
                      <>
                        <Check className="h-3 w-3" />
                        Selected
                      </>
                    ) : (
                      'Select'
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleApplySelections}
          className={
            'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ' +
            'bg-primary text-primary-foreground hover:bg-primary/90'
          }
        >
          <GitMerge className="h-4 w-4" />
          Apply selections
        </button>
        <button
          type="button"
          onClick={onResolveAll}
          className={
            'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ' +
            'bg-muted text-muted-foreground hover:bg-muted/80'
          }
        >
          Auto-resolve (keep first)
        </button>
      </div>
    </div>
  );
}
