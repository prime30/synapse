'use client';

import { useEffect, useMemo, useState } from 'react';
import { getLiquidDiagnostics, Diagnostic } from '@/lib/monaco/diagnostics-provider';

export function useLiquidDiagnostics(template: string, delayMs = 300) {
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const normalized = useMemo(() => template ?? '', [template]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      getLiquidDiagnostics(normalized).then(setDiagnostics).catch(() => {});
    }, delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, normalized]);

  return diagnostics;
}
