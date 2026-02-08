'use client';

import type { Diagnostic } from '@/lib/monaco/diagnostics-provider';

interface DiagnosticItemProps {
  filePath: string;
  diagnostic: Diagnostic;
}

export function DiagnosticItem({ filePath, diagnostic }: DiagnosticItemProps) {
  return (
    <div className="flex items-start gap-2 text-xs text-gray-200">
      <span className="min-w-[80px] text-gray-400">{filePath}</span>
      <span className="text-gray-400">
        L{diagnostic.line}:{diagnostic.column}
      </span>
      <span>{diagnostic.message}</span>
    </div>
  );
}
