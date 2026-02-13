'use client';

/**
 * PreviewSyncContext — real-time settings → preview synchronization.
 *
 * EPIC 11: Manages the bridge between customizer settings changes and the
 * preview iframe. Supports two modes:
 * - Server-rendered (V1): Push settings to Shopify, reload iframe. 2-5s latency.
 * - Local render (V2 future): Instant updates via postMessage. <200ms latency.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';

// ── Types ─────────────────────────────────────────────────────────────

export type PreviewMode = 'server' | 'local';

export interface PreviewSyncState {
  /** Current preview mode */
  mode: PreviewMode;
  /** Whether a sync is in progress */
  isSyncing: boolean;
  /** Last sync timestamp */
  lastSyncAt: string | null;
  /** Last sync error */
  syncError: string | null;
  /** Current settings values being previewed */
  settings: Record<string, unknown>;
  /** Current block instances being previewed */
  blocks: Array<{ id: string; type: string; settings: Record<string, unknown> }>;
}

export interface PreviewSyncActions {
  /** Update a single setting and sync to preview */
  updateSetting: (id: string, value: unknown) => void;
  /** Update multiple settings at once */
  batchUpdateSettings: (updates: Record<string, unknown>) => void;
  /** Update a block instance's settings */
  updateBlockSetting: (blockId: string, settingId: string, value: unknown) => void;
  /** Add a block instance */
  addBlock: (type: string, settings?: Record<string, unknown>) => void;
  /** Remove a block instance */
  removeBlock: (blockId: string) => void;
  /** Reorder blocks */
  reorderBlocks: (fromIndex: number, toIndex: number) => void;
  /** Toggle between server and local preview mode */
  setMode: (mode: PreviewMode) => void;
  /** Force refresh the preview iframe */
  refreshPreview: () => void;
  /** Set the preview iframe ref for postMessage communication */
  setIframeRef: (iframe: HTMLIFrameElement | null) => void;
}

type PreviewSyncContextType = PreviewSyncState & PreviewSyncActions;

// ── Context ───────────────────────────────────────────────────────────

const PreviewSyncContext = createContext<PreviewSyncContextType | null>(null);

export function usePreviewSync(): PreviewSyncContextType {
  const ctx = useContext(PreviewSyncContext);
  if (!ctx) {
    throw new Error('usePreviewSync must be used within a PreviewSyncProvider');
  }
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────

interface PreviewSyncProviderProps {
  children: ReactNode;
  /** Shopify connection ID for server-rendered preview pushes */
  connectionId?: string | null;
  /** Theme ID for server-rendered preview pushes */
  themeId?: string | null;
  /** Project ID for API calls */
  projectId?: string | null;
  /** Initial settings from schema defaults */
  initialSettings?: Record<string, unknown>;
  /** Initial block instances */
  initialBlocks?: Array<{ id: string; type: string; settings: Record<string, unknown> }>;
}

export function PreviewSyncProvider({
  children,
  connectionId,
  themeId,
  projectId: _projectId,
  initialSettings = {},
  initialBlocks = [],
}: PreviewSyncProviderProps) {
  const [mode, setMode] = useState<PreviewMode>('server');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown>>(initialSettings);
  const [blocks, setBlocks] = useState(initialBlocks);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sync to preview ────────────────────────────────────────────────

  const syncToPreview = useCallback(
    (updatedSettings: Record<string, unknown>, updatedBlocks: typeof blocks) => {
      if (mode === 'local' && iframeRef.current?.contentWindow) {
        // V2 local mode: postMessage to preview iframe
        iframeRef.current.contentWindow.postMessage(
          {
            type: 'synapse:settings-update',
            settings: updatedSettings,
            blocks: updatedBlocks,
          },
          '*'
        );
        setLastSyncAt(new Date().toISOString());
        return;
      }

      // V1 server mode: debounced push to Shopify + iframe reload
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
      }

      syncDebounceRef.current = setTimeout(async () => {
        if (!connectionId || !themeId) return;
        setIsSyncing(true);
        setSyncError(null);

        try {
          // Push settings_data.json to Shopify
          const res = await fetch(
            `/api/stores/${connectionId}/themes/${themeId}/settings`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ settings: updatedSettings, blocks: updatedBlocks }),
            }
          );

          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            throw new Error(json.error || `Sync failed: ${res.status}`);
          }

          // Reload preview iframe
          if (iframeRef.current) {
            iframeRef.current.src = iframeRef.current.src;
          }

          setLastSyncAt(new Date().toISOString());
        } catch (err) {
          setSyncError(err instanceof Error ? err.message : 'Sync failed');
        } finally {
          setIsSyncing(false);
        }
      }, 800); // Debounce 800ms for server mode
    },
    [mode, connectionId, themeId]
  );

  // ── Actions ────────────────────────────────────────────────────────

  const updateSetting = useCallback(
    (id: string, value: unknown) => {
      setSettings((prev) => {
        const next = { ...prev, [id]: value };
        syncToPreview(next, blocks);
        return next;
      });
    },
    [syncToPreview, blocks]
  );

  const batchUpdateSettings = useCallback(
    (updates: Record<string, unknown>) => {
      setSettings((prev) => {
        const next = { ...prev, ...updates };
        syncToPreview(next, blocks);
        return next;
      });
    },
    [syncToPreview, blocks]
  );

  const updateBlockSetting = useCallback(
    (blockId: string, settingId: string, value: unknown) => {
      setBlocks((prev) => {
        const next = prev.map((b) =>
          b.id === blockId
            ? { ...b, settings: { ...b.settings, [settingId]: value } }
            : b
        );
        syncToPreview(settings, next);
        return next;
      });
    },
    [syncToPreview, settings]
  );

  const addBlock = useCallback(
    (type: string, blockSettings?: Record<string, unknown>) => {
      setBlocks((prev) => {
        const next = [
          ...prev,
          {
            id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type,
            settings: blockSettings ?? {},
          },
        ];
        syncToPreview(settings, next);
        return next;
      });
    },
    [syncToPreview, settings]
  );

  const removeBlock = useCallback(
    (blockId: string) => {
      setBlocks((prev) => {
        const next = prev.filter((b) => b.id !== blockId);
        syncToPreview(settings, next);
        return next;
      });
    },
    [syncToPreview, settings]
  );

  const reorderBlocks = useCallback(
    (fromIndex: number, toIndex: number) => {
      setBlocks((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        syncToPreview(settings, next);
        return next;
      });
    },
    [syncToPreview, settings]
  );

  const refreshPreview = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  }, []);

  const setIframeRef = useCallback((iframe: HTMLIFrameElement | null) => {
    iframeRef.current = iframe;
  }, []);

  // ── Memoized value ────────────────────────────────────────────────

  const value = useMemo<PreviewSyncContextType>(
    () => ({
      mode,
      isSyncing,
      lastSyncAt,
      syncError,
      settings,
      blocks,
      updateSetting,
      batchUpdateSettings,
      updateBlockSetting,
      addBlock,
      removeBlock,
      reorderBlocks,
      setMode,
      refreshPreview,
      setIframeRef,
    }),
    [
      mode,
      isSyncing,
      lastSyncAt,
      syncError,
      settings,
      blocks,
      updateSetting,
      batchUpdateSettings,
      updateBlockSetting,
      addBlock,
      removeBlock,
      reorderBlocks,
      refreshPreview,
      setIframeRef,
    ]
  );

  return (
    <PreviewSyncContext.Provider value={value}>
      {children}
    </PreviewSyncContext.Provider>
  );
}
