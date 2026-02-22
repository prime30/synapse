'use client';

import { useMemo } from 'react';

interface FileBreadcrumbProps {
  filePath: string | null; // e.g. "sections/hero-banner.liquid"
  content?: string; // file content, for Liquid schema parsing
  /** Navigate to a file path segment (e.g. folder or file name click) */
  onNavigate?: (segmentPath: string) => void;
  /** Add the current file to chat context tags. */
  onAddToChatContext?: (filePath: string) => void;
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

export function FileBreadcrumb({ filePath, content, onNavigate, onAddToChatContext }: FileBreadcrumbProps) {
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

              // Clicking the active file segment adds it as an agent context tag.
              if (isPathSegment && idx === parts.length - 1 && onAddToChatContext) {
                onAddToChatContext(filePath);
                return;
              }

              // Other path segments keep folder/file navigation behavior.
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
    </div>
  );
}
