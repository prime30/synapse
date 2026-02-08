'use client';

import { useState } from 'react';
import type { Diagnostic } from '@/lib/monaco/diagnostics-provider';

export interface FileDiagnostics {
  filePath: string;
  diagnostics: Diagnostic[];
}

export function useWorkspaceDiagnostics() {
  const [files, setFiles] = useState<FileDiagnostics[]>([]);
  return { files, setFiles };
}
