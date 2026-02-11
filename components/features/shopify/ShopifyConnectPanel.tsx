'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useActiveStore } from '@/hooks/useActiveStore';
import { useShopifyConnection } from '@/hooks/useShopifyConnection';
import { emitPreviewSyncComplete } from '@/lib/preview/sync-listener';

interface ShopifyConnectPanelProps {
  projectId: string;
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'connected'
      ? 'bg-green-500'
      : status === 'syncing'
        ? 'bg-yellow-500 animate-pulse'
        : status === 'error'
          ? 'bg-red-500'
          : 'bg-gray-500';

  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sec = (now.getTime() - date.getTime()) / 1000;
  if (sec < 60) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hours ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)} days ago`;
  return formatTimestamp(iso);
}

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  import: 'After import',
  auto_save: 'Auto-save',
  rollback: 'Rollback',
};

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  main: { label: 'Live', cls: 'bg-green-500/20 text-green-400 border-green-500/40' },
  development: { label: 'Dev', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  demo: { label: 'Demo', cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  unpublished: { label: 'Unpublished', cls: 'bg-gray-500/20 text-gray-400 border-gray-500/40' },
};

function themeRelativeTime(iso: string): string {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface PushHistoryRow {
  id: string;
  pushed_at: string;
  note: string | null;
  trigger: string;
  file_count: number;
}

export function ShopifyConnectPanel({ projectId }: ShopifyConnectPanelProps) {
  const queryClient = useQueryClient();
  const {
    connection: activeConnection,
    isLoading: storeLoading,
    connectStore,
    isConnecting,
    connectError,
  } = useActiveStore(projectId);
  const {
    sync,
    isSyncing,
    syncResult,
    themes,
    isLoadingThemes,
    themesError,
  } = useShopifyConnection(projectId);

  const [shopDomain, setShopDomain] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [selectedThemeId, setSelectedThemeId] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pushNote, setPushNote] = useState('');
  const [rollbackPushId, setRollbackPushId] = useState<string | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [rollbackMessage, setRollbackMessage] = useState<string | null>(null);
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const themeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(e.target as Node)) {
        setThemeDropdownOpen(false);
      }
    }
    if (themeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [themeDropdownOpen]);

  const connected = !!activeConnection;
  const connection = activeConnection;

  const { data: pushHistory = [] } = useQuery({
    queryKey: ['shopify-push-history', projectId],
    queryFn: async (): Promise<PushHistoryRow[]> => {
      const res = await fetch(`/api/projects/${projectId}/shopify/push-history`);
      if (!res.ok) throw new Error('Failed to fetch push history');
      const json = await res.json();
      return (json.data ?? json) as PushHistoryRow[];
    },
    enabled: connected === true,
  });

  const effectiveThemeId =
    selectedThemeId ??
    (connection?.theme_id ? Number(connection.theme_id) : null);

  const handleConnect = async () => {
    const domain = shopDomain.trim();
    const token = adminToken.trim();
    if (!domain || !token) return;

    const fullDomain = domain.includes('.myshopify.com')
      ? domain
      : `${domain}.myshopify.com`;

    try {
      await connectStore({
        storeDomain: fullDomain,
        adminApiToken: token,
        projectId,
      });
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  };

  const handleSync = async (action: 'pull' | 'push') => {
    if (effectiveThemeId === null) return;
    const themeId = effectiveThemeId;
    setSyncError(null);
    try {
      await sync({
        action,
        themeId,
        note: action === 'push' ? pushNote.trim() || undefined : undefined,
      });
      if (action === 'push') {
        setPushNote('');
        await queryClient.invalidateQueries({
          queryKey: ['shopify-push-history', projectId],
        });
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Sync failed');
    }
  };

  const handleRollback = (pushId: string) => setRollbackPushId(pushId);
  const confirmRollback = async () => {
    if (!rollbackPushId) return;
    setIsRollingBack(true);
    setRollbackMessage(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/shopify/push-history/${rollbackPushId}/rollback`,
        { method: 'POST' }
      );
      const json = await res.json().catch(() => ({}));
      const data = json.data ?? json;
      if (!res.ok) {
        setRollbackMessage(json.error ?? data?.message ?? 'Rollback failed');
        return;
      }
      const restored = data.restored ?? 0;
      const errors = data.errors as string[] | undefined;
      const dateStr = pushHistory.find((p) => p.id === rollbackPushId)?.pushed_at;
      const dateLabel = dateStr ? relativeTime(dateStr) : 'that push';
      if (errors?.length) {
        setRollbackMessage(
          `Restored ${restored} files. Some files could not be restored: ${errors.slice(0, 2).join('; ')}${errors.length > 2 ? '...' : ''}`
        );
      } else {
        setRollbackMessage(`Preview restored to push from ${dateLabel}.`);
      }
      emitPreviewSyncComplete(projectId);
      await queryClient.invalidateQueries({
        queryKey: ['shopify-push-history', projectId],
      });
      setRollbackPushId(null);
    } catch (err) {
      setRollbackMessage(err instanceof Error ? err.message : 'Rollback failed');
    } finally {
      setIsRollingBack(false);
    }
  };

  // Loading skeleton
  if (storeLoading) {
    return (
      <div className="border border-gray-700 rounded-lg bg-gray-900/50 p-5 space-y-4 animate-pulse">
        <div className="h-5 bg-gray-700 rounded w-40" />
        <div className="h-4 bg-gray-700 rounded w-60" />
        <div className="h-9 bg-gray-700 rounded w-full" />
      </div>
    );
  }

  // Disconnected state
  if (!connected || !connection) {
    return (
      <div className="border border-gray-700 rounded-lg bg-gray-900/50 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <StatusDot status="disconnected" />
          <h3 className="text-sm font-semibold text-gray-200">Shopify Store</h3>
        </div>

        <p className="text-xs text-gray-400">
          Connect a Shopify store to sync theme files.
        </p>

        <div className="space-y-2">
          <div className="flex gap-0">
            <input
              type="text"
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value.replace(/\.myshopify\.com$/i, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              placeholder="your-store-name"
              className="flex-1 min-w-0 px-3 py-2 text-sm rounded-l bg-gray-800 border border-r-0 border-gray-600 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <span className="inline-flex items-center px-3 py-2 text-sm text-gray-500 bg-gray-800/60 border border-l-0 border-gray-600 rounded-r select-none whitespace-nowrap">
              .myshopify.com
            </span>
          </div>

          <input
            type="password"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            placeholder="Admin API token (shpat_...)"
            className="w-full px-3 py-2 text-sm rounded bg-gray-800 border border-gray-600 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />

          <button
            type="button"
            onClick={handleConnect}
            disabled={!shopDomain.trim() || !adminToken.trim() || isConnecting}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>

          {connectError && (
            <p className="text-xs text-red-400">{connectError.message}</p>
          )}
        </div>
      </div>
    );
  }

  // Connected state
  return (
    <div className="border border-gray-700 rounded-lg bg-gray-900/50 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusDot status={connection.sync_status} />
          <h3 className="text-sm font-semibold text-gray-200">Shopify Store</h3>
        </div>
        <span className="text-xs text-gray-400 font-mono">{connection.store_domain}</span>
      </div>

      {/* Last sync */}
      <div className="text-xs text-gray-500">
        Last synced: {formatTimestamp(connection.last_sync_at)}
      </div>

      {/* Theme selector */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-400">
          Theme
        </label>
        <div ref={themeDropdownRef} className="relative">
          <button
            type="button"
            onClick={() => !isLoadingThemes && setThemeDropdownOpen((o) => !o)}
            disabled={isLoadingThemes}
            className="w-full flex items-center justify-between px-3 py-2 text-sm rounded bg-gray-800 border border-gray-600 text-gray-200 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
          >
            <span className="truncate">
              {isLoadingThemes
                ? 'Loading themes...'
                : themesError
                  ? 'Failed to load themes'
                  : effectiveThemeId
                    ? themes.find((t) => t.id === effectiveThemeId)?.name ?? 'Select a theme'
                    : themes.length === 0
                      ? 'No themes found'
                      : 'Select a theme'}
            </span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${themeDropdownOpen ? 'rotate-180' : ''}`}>
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          {themeDropdownOpen && themes.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded bg-gray-800 border border-gray-600 shadow-lg">
              {themes.map((theme) => {
                const badge = ROLE_BADGE[theme.role] ?? ROLE_BADGE.unpublished;
                const isSelected = theme.id === effectiveThemeId;
                return (
                  <li key={theme.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedThemeId(theme.id);
                        setThemeDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors ${
                        isSelected
                          ? 'bg-blue-600/20 text-white'
                          : 'text-gray-200 hover:bg-gray-700'
                      }`}
                    >
                      <span className="flex-1 min-w-0 truncate">{theme.name}</span>
                      <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded border ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {theme.updated_at && (
                        <span className="shrink-0 text-[10px] text-gray-500 tabular-nums">
                          {themeRelativeTime(theme.updated_at)}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Push note */}
      <div>
        <label htmlFor="push-note" className="block text-xs font-medium text-gray-400 mb-1">
          Note (optional, for manual push)
        </label>
        <input
          id="push-note"
          type="text"
          value={pushNote}
          onChange={(e) => setPushNote(e.target.value)}
          placeholder="e.g. Homepage update"
          className="w-full px-3 py-2 text-sm rounded bg-gray-800 border border-gray-600 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {/* Sync buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleSync('pull')}
          disabled={!effectiveThemeId || isSyncing}
          className="flex-1 px-3 py-2 text-sm rounded bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSyncing ? 'Syncing...' : 'Pull from Shopify'}
        </button>
        <button
          type="button"
          onClick={() => handleSync('push')}
          disabled={!effectiveThemeId || isSyncing}
          className="flex-1 px-3 py-2 text-sm rounded bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSyncing ? 'Syncing...' : 'Push to Shopify'}
        </button>
      </div>

      {/* Sync result feedback */}
      {syncResult && (
        <div className="text-xs p-3 rounded bg-gray-800 border border-gray-700 space-y-1">
          <p className="text-gray-300">
            Pulled: {syncResult.pulled} &middot; Pushed: {syncResult.pushed}
          </p>
          {syncResult.conflicts.length > 0 && (
            <p className="text-yellow-400">Conflicts: {syncResult.conflicts.join(', ')}</p>
          )}
          {syncResult.errors.length > 0 && (
            <p className="text-red-400">Errors: {syncResult.errors.join(', ')}</p>
          )}
        </div>
      )}

      {syncError && <p className="text-xs text-red-400">{syncError}</p>}
      {rollbackMessage && <p className="text-xs text-green-400">{rollbackMessage}</p>}

      {/* Push history */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-gray-400">Push history</h4>
        {pushHistory.length === 0 ? (
          <p className="text-xs text-gray-500">No pushes yet.</p>
        ) : (
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {pushHistory.map((row, index) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 py-1.5 px-2 rounded bg-gray-800/60 border border-gray-700 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-gray-400">{relativeTime(row.pushed_at)}</span>
                  {row.note && (
                    <span className="ml-2 text-gray-500 truncate block" title={row.note}>
                      {row.note.length > 24 ? `${row.note.slice(0, 24)}...` : row.note}
                    </span>
                  )}
                  <span className="text-gray-500">
                    {TRIGGER_LABELS[row.trigger] ?? row.trigger} &middot; {row.file_count} files
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {index === 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-gray-600 text-gray-300 text-[10px]">Current</span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRollback(row.id)}
                    disabled={index === 0 || isRollingBack}
                    className="px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed text-[11px] transition-colors"
                  >
                    Rollback to this
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Rollback confirmation dialog */}
      {rollbackPushId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-label="Confirm rollback"
          onKeyDown={(e) => { if (e.key === 'Escape') setRollbackPushId(null); }}
        >
          <div className="bg-gray-900 rounded-lg shadow-xl w-full max-w-sm mx-4 border border-gray-700 p-4 space-y-3">
            <p className="text-sm text-gray-200">
              Restore preview theme to this push? Current preview state will be overwritten.
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setRollbackPushId(null)} className="px-3 py-1.5 text-sm rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={confirmRollback} disabled={isRollingBack} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {isRollingBack ? 'Rolling back...' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
