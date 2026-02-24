'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { HealthScanResult } from '@/lib/ai/theme-health-scanner';

const AUTO_DEBOUNCE_MS = 30_000; // 30 seconds between auto-scans
const FILE_SAVE_EVENT = 'synapse:file-saved';

interface UseThemeHealthOptions {
  projectId: string;
  enabled?: boolean;
}

/**
 * Emit this event after any file save to trigger a health re-scan.
 */
export function emitFileSaved(projectId: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FILE_SAVE_EVENT, { detail: { projectId } }));
}

export function useThemeHealth({ projectId, enabled = true }: UseThemeHealthOptions) {
  const [scanResult, setScanResult] = useState<HealthScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const lastScanRef = useRef<number>(0);
  const scanQueuedRef = useRef(false);

  const triggerScan = useCallback(async (force = false) => {
    if (!enabled || !projectId) return;
    if (!force && Date.now() - lastScanRef.current < AUTO_DEBOUNCE_MS) {
      scanQueuedRef.current = true;
      return;
    }

    setIsScanning(true);
    lastScanRef.current = Date.now();
    scanQueuedRef.current = false;

    try {
      const res = await fetch(`/api/projects/${projectId}/health/scan`, {
        method: 'POST',
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: HealthScanResult };
        if (json.data) setScanResult(json.data);
      }
    } catch {
      // silently fail
    } finally {
      setIsScanning(false);
    }
  }, [projectId, enabled]);

  // Trigger on mount
  useEffect(() => {
    triggerScan();
  }, [triggerScan]);

  // Re-scan when files are saved
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.projectId === projectId) {
        triggerScan(true);
      }
    };
    window.addEventListener(FILE_SAVE_EVENT, handler);
    return () => window.removeEventListener(FILE_SAVE_EVENT, handler);
  }, [projectId, enabled, triggerScan]);

  // Flush queued scan after debounce period
  useEffect(() => {
    if (!scanQueuedRef.current) return;
    const timer = setTimeout(() => {
      if (scanQueuedRef.current) triggerScan(true);
    }, AUTO_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [scanResult, triggerScan]);

  return { scanResult, isScanning, triggerScan };
}
