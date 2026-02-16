'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  deriveRelevantLiquidFiles,
  flattenRelevantFiles,
} from '@/lib/preview/relevant-liquid-files';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PreviewContext {
  url: string;
  title: string;
  scrollPercent: number;
  visibleSections: { id: string | null; type: string; tag: string }[];
}

interface PassiveContextOptions {
  /** Gate: when false the hook is a complete no-op. */
  enabled: boolean;
  /** Active panel in the ActivityBar (e.g. 'files', 'store', 'design'). */
  activePanel: string | null;
  /** Active sub-nav within the panel (e.g. 'sync', 'versions'). */
  subNav: string | null;
  /** View mode: 'editor' or 'canvas'. */
  viewMode: string;
  /** Currently open file path. */
  filePath: string | null;
  /** Language / file type of the active file. */
  fileLanguage: string | null;
  /** Current editor selection text. */
  selection: string | null;
}

interface UsePassiveContextReturn {
  /** Returns a concise LLM-friendly context string, or '' if disabled / nothing to report. */
  getContextString: () => string;
  /** Returns the Liquid file paths relevant to the current preview (template + sections). */
  getRelevantLiquidFiles: () => string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PASSIVE_MSG_TYPE = 'synapse-bridge-passive';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Passively collects IDE context (preview viewport + editor state + panel)
 * and exposes it as a formatted string for injection into AI messages.
 *
 * The preview portion is updated via `postMessage` from `synapse-bridge.js`
 * running inside the preview iframe. The IDE portion is passed in directly
 * via options (no re-renders -- stored in refs).
 *
 * Gated by `enabled` -- when false, no listeners are attached and
 * `getContextString()` always returns ''.
 */
export function usePassiveContext(options: PassiveContextOptions): UsePassiveContextReturn {
  const previewRef = useRef<PreviewContext | null>(null);
  const optsRef = useRef(options);

  // Keep options ref in sync via effect (not during render)
  useEffect(() => {
    optsRef.current = options;
  });

  // Listen for passive bridge messages
  useEffect(() => {
    if (!options.enabled) return;

    function handleMessage(event: MessageEvent) {
      const msg = event.data;
      if (!msg || msg.type !== PASSIVE_MSG_TYPE) return;

      const d = msg.data;
      if (!d || typeof d.url !== 'string') return;

      previewRef.current = {
        url: d.url,
        title: d.title ?? '',
        scrollPercent: typeof d.scrollPercent === 'number' ? d.scrollPercent : 0,
        visibleSections: Array.isArray(d.visibleSections) ? d.visibleSections : [],
      };
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [options.enabled]);

  // Derive relevant Liquid files from the latest preview state (no re-renders)
  const getRelevantLiquidFiles = useCallback((): string[] => {
    const pv = previewRef.current;
    if (!pv) return [];
    const result = deriveRelevantLiquidFiles(pv.url, pv.visibleSections);
    return flattenRelevantFiles(result);
  }, []);

  // Assemble the formatted context string on demand (no re-renders)
  const getContextString = useCallback((): string => {
    if (!optsRef.current.enabled) return '';

    const lines: string[] = ['[IDE Context]'];

    // Preview
    const pv = previewRef.current;
    if (pv) {
      lines.push(`Preview: ${pv.url}${pv.title ? ` (${pv.title})` : ''}`);
      if (pv.visibleSections.length > 0) {
        const sectionNames = pv.visibleSections
          .map((s) => s.type || s.id || s.tag)
          .filter(Boolean);
        if (sectionNames.length > 0) {
          lines.push(`Visible sections: ${sectionNames.join(', ')}`);
        }
      }
      // Relevant Liquid files for the AI
      const relevantFiles = getRelevantLiquidFiles();
      if (relevantFiles.length > 0) {
        lines.push(`Relevant Liquid files: ${relevantFiles.join(', ')}`);
      }
      lines.push(`Scroll: ${pv.scrollPercent}% down the page`);
    } else {
      lines.push('Preview: not loaded');
    }

    // Editor
    const opts = optsRef.current;
    if (opts.filePath) {
      lines.push(`Active file: ${opts.filePath}${opts.fileLanguage ? ` (${opts.fileLanguage})` : ''}`);
    }

    // Panel
    if (opts.activePanel) {
      const panelStr = opts.subNav
        ? `${opts.activePanel} > ${opts.subNav}`
        : opts.activePanel;
      lines.push(`Active panel: ${panelStr}`);
    }

    // View mode
    if (opts.viewMode && opts.viewMode !== 'editor') {
      lines.push(`View mode: ${opts.viewMode}`);
    }

    // Selection
    if (opts.selection) {
      const len = opts.selection.length;
      lines.push(`Editor selection: (${len} chars selected)`);
    }

    // Only return if we have more than just the header
    return lines.length > 1 ? lines.join('\n') : '';
  }, [getRelevantLiquidFiles]);

  return { getContextString, getRelevantLiquidFiles };
}
