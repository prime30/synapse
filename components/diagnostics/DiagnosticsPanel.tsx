'use client';

import type { FileDiagnostics } from '@/hooks/useWorkspaceDiagnostics';
import { DiagnosticItem } from './DiagnosticItem';

interface DiagnosticsPanelProps {
  files: FileDiagnostics[];
}

export function DiagnosticsPanel({ files }: DiagnosticsPanelProps) {
  if (files.length === 0) {
    return (
      <div className="text-xs ide-text-muted">No diagnostics</div>
    );
  }

  return (
    <div className="rounded border ide-border ide-surface-panel p-3">
      <h3 className="text-xs font-semibold ide-text mb-2">Diagnostics</h3>
      <div className="space-y-2">
        {files.map((file) =>
          (file.diagnostics ?? []).map((diag, index) => (
            <DiagnosticItem
              key={`${file.filePath}-${index}`}
              filePath={file.filePath}
              diagnostic={diag}
            />
          ))
        )}
      </div>
    </div>
  );
}
