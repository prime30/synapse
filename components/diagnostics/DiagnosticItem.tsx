'use client';

import type { Diagnostic } from '@/lib/monaco/diagnostics-provider';

interface DiagnosticItemProps {
  filePath: string;
  diagnostic: Diagnostic;
}

export function DiagnosticItem({ filePath, diagnostic }: DiagnosticItemProps) {
  return (
    <div className="flex items-start gap-2 text-xs ide-text">
      <span className="min-w-[80px] ide-text-muted">{filePath}</span>
      <span className="ide-text-muted">
        L{diagnostic.line}:{diagnostic.column}
      </span>
      <span>{diagnostic.message}</span>
    </div>
  );
}
