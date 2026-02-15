'use client';

import { CheckCircle2, XCircle, FileEdit, Trash2, ArrowRightLeft } from 'lucide-react';

export interface FileOperation {
  type: 'write' | 'delete' | 'rename';
  fileName: string;
  success: boolean;
  error?: string;
  newFileName?: string;
}

interface FileOperationToastProps {
  operations: FileOperation[];
}

const ICONS: Record<string, typeof FileEdit> = {
  write: FileEdit,
  delete: Trash2,
  rename: ArrowRightLeft,
};

const LABELS: Record<string, string> = {
  write: 'Updated',
  delete: 'Deleted',
  rename: 'Renamed',
};

export function FileOperationToast({ operations }: FileOperationToastProps) {
  if (operations.length === 0) return null;

  return (
    <div className="my-2 space-y-1">
      {operations.map((op, i) => {
        const Icon = ICONS[op.type] ?? FileEdit;
        const StatusIcon = op.success ? CheckCircle2 : XCircle;

        return (
          <div
            key={`${op.fileName}-${i}`}
            className="rounded-lg ide-surface-inset border ide-border-subtle px-3 py-2 flex items-center gap-2"
          >
            <Icon className="w-3.5 h-3.5 ide-text-muted flex-shrink-0" />
            <span className="text-xs ide-text-2 truncate flex-1">
              {LABELS[op.type] ?? 'Modified'}: <span className="font-mono">{op.fileName}</span>
              {op.type === 'rename' && op.newFileName && (
                <> &rarr; <span className="font-mono">{op.newFileName}</span></>
              )}
            </span>
            <StatusIcon
              className={`w-3.5 h-3.5 flex-shrink-0 ${
                op.success ? 'text-accent' : 'text-red-500 dark:text-red-400'
              }`}
            />
            {op.error && (
              <span className="text-[10px] text-red-500 dark:text-red-400 truncate max-w-[120px]">
                {op.error}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
