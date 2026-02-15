'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import type { PreviewFrameHandle } from '@/components/preview/PreviewFrame';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface InspectedElement {
  tag: string;
  id: string | null;
  classes: string[];
  selector: string;
  dataAttributes: Record<string, string>;
  textPreview: string;
  styles: Record<string, string>;
  rect: { top: number; left: number; width: number; height: number };
  source?: string;
  isApp?: boolean;
}

export interface AppElement extends InspectedElement {
  source: string;
  isApp: true;
}

export interface StylesheetInfo {
  href: string | null;
  isTheme: boolean;
  isApp: boolean;
  isInline: boolean;
  ruleCount: number;
  media: string;
}

export interface PageSnapshot {
  nodeCount: number;
  tree: unknown;
}

export interface ElementDetail extends InspectedElement {
  found: boolean;
  parents: Array<{ tag: string; selector: string; id: string | null; classes: string[] }>;
  siblings: Array<{ tag: string; selector: string; classes: string[] }>;
  allStyles: Record<string, string>;
}

export interface PreviewBridge {
  inspect(selector: string): Promise<{ count: number; elements: InspectedElement[] }>;
  listAppElements(): Promise<{ count: number; elements: AppElement[]; appScripts: string[] }>;
  getStylesheets(): Promise<{ count: number; stylesheets: StylesheetInfo[] }>;
  getPageSnapshot(): Promise<PageSnapshot>;
  querySelector(selector: string): Promise<ElementDetail | null>;
  injectCSS(css: string): Promise<{ injected: boolean }>;
  clearCSS(): Promise<{ cleared: boolean }>;
  /** Phase 4a: Inject HTML into an element for live preview */
  injectHTML(selector: string, html: string): Promise<{ injected: boolean; selector: string }>;
  /** Phase 4a: Restore all injected HTML to original content */
  clearHTML(): Promise<{ cleared: boolean; count: number }>;
  ping(): Promise<{ version: number; ready: boolean; url: string }>;
  isReady: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BRIDGE_TYPE = 'synapse-bridge';
const RESPONSE_TYPE = 'synapse-bridge-response';
const TIMEOUT_MS = 4000;

let _requestId = 0;
function nextId(): string {
  return `bridge_${++_requestId}_${Date.now()}`;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function usePreviewBridge(frameRef: React.RefObject<PreviewFrameHandle | null>): PreviewBridge {
  const pendingRef = useRef<Map<string, { resolve: (data: unknown) => void; reject: (err: Error) => void }>>(new Map());
  const [isReady, setIsReady] = useState(false);

  // Listen for responses from the bridge
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = event.data;
      if (!msg || msg.type !== RESPONSE_TYPE) return;

      // Bridge ready signal
      if (msg.id === '__ready__' && msg.action === 'ready') {
        setIsReady(true);
        return;
      }

      const pending = pendingRef.current.get(msg.id);
      if (pending) {
        pendingRef.current.delete(msg.id);
        pending.resolve(msg.data);
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Reset ready state when frame changes
  useEffect(() => {
    setIsReady(false);
  }, [frameRef]);

  const send = useCallback(
    <T = unknown>(action: string, payload?: unknown): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        const iframe = frameRef.current?.getIframe();
        if (!iframe?.contentWindow) {
          reject(new Error('Preview iframe not available'));
          return;
        }

        const id = nextId();

        // Set up timeout
        const timer = setTimeout(() => {
          pendingRef.current.delete(id);
          reject(new Error(`Bridge timeout for action: ${action}`));
        }, TIMEOUT_MS);

        // Register pending handler
        pendingRef.current.set(id, {
          resolve: (data) => {
            clearTimeout(timer);
            resolve(data as T);
          },
          reject: (err) => {
            clearTimeout(timer);
            reject(err);
          },
        });

        // Send to iframe
        iframe.contentWindow.postMessage(
          { type: BRIDGE_TYPE, id, action, payload },
          '*'
        );
      });
    },
    [frameRef]
  );

  const inspect = useCallback(
    (selector: string) => send<{ count: number; elements: InspectedElement[] }>('inspect', { selector }),
    [send]
  );

  const listAppElements = useCallback(
    () => send<{ count: number; elements: AppElement[]; appScripts: string[] }>('listAppElements'),
    [send]
  );

  const getStylesheets = useCallback(
    () => send<{ count: number; stylesheets: StylesheetInfo[] }>('getStylesheets'),
    [send]
  );

  const getPageSnapshot = useCallback(
    () => send<PageSnapshot>('getPageSnapshot'),
    [send]
  );

  const querySelector = useCallback(
    async (selector: string) => {
      const result = await send<ElementDetail & { found?: boolean }>('querySelector', { selector });
      return result.found === false ? null : result;
    },
    [send]
  );

  const injectCSS = useCallback(
    (css: string) => send<{ injected: boolean }>('injectCSS', { css }),
    [send]
  );

  const clearCSS = useCallback(
    () => send<{ cleared: boolean }>('clearCSS'),
    [send]
  );

  const injectHTML = useCallback(
    (selector: string, html: string) => send<{ injected: boolean; selector: string }>('injectHTML', { selector, html }),
    [send]
  );

  const clearHTML = useCallback(
    () => send<{ cleared: boolean; count: number }>('clearHTML'),
    [send]
  );

  const ping = useCallback(
    () => send<{ version: number; ready: boolean; url: string }>('ping'),
    [send]
  );

  return {
    inspect,
    listAppElements,
    getStylesheets,
    getPageSnapshot,
    querySelector,
    injectCSS,
    clearCSS,
    injectHTML,
    clearHTML,
    ping,
    isReady,
  };
}
