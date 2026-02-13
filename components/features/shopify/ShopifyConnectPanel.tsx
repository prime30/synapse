'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useActiveStore } from '@/hooks/useActiveStore';
import { useShopifyConnection } from '@/hooks/useShopifyConnection';
import { setAutoSyncEnabled } from '@/hooks/useFileEditor';
import { emitPreviewSyncComplete } from '@/lib/preview/sync-listener';
import type { QuickScanResult, QuickScanIssue } from '@/lib/ai/theme-reviewer';

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
          : 'bg-stone-500';

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
  development: { label: 'Dev', cls: 'ide-active text-sky-500 dark:text-sky-400 border-sky-500/40' },
  demo: { label: 'Demo', cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  unpublished: { label: 'Unpublished', cls: 'bg-stone-500/20 ide-text-muted border-stone-500/40' },
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
  const router = useRouter();
  const {
    sync,
    isSyncing,
    syncResult,
    themes,
    isLoadingThemes,
    themesError,
    deleteTheme,
    isDeletingTheme,
    renameTheme,
    isRenamingTheme,
    cloneTheme,
    isCloningTheme,
    publishTheme,
    isPublishingTheme,
    diffTheme,
    isDiffingTheme,
    diffResult,
    cloneProject,
    isCloningProject,
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

  // Theme management state
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const [renameInput, setRenameInput] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState<string | null>(null);
  const [deleteInputValue, setDeleteInputValue] = useState('');
  const [cloneModal, setCloneModal] = useState<'shopify' | 'project' | null>(null);
  const [cloneNameInput, setCloneNameInput] = useState('');
  const [publishConfirmStep, setPublishConfirmStep] = useState<0 | 1 | 2>(0);
  const [publishInput, setPublishInput] = useState('');
  const [scanResult, setScanResult] = useState<QuickScanResult | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const [autoSyncOn, setAutoSyncOn] = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return localStorage.getItem(`synapse-auto-sync-${projectId}`) === '1'; } catch { return false; }
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(e.target as Node)) {
        setThemeDropdownOpen(false);
      }
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setActionMenuOpen(false);
      }
    }
    if (themeDropdownOpen || actionMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [themeDropdownOpen, actionMenuOpen]);

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

  const handlePushWithPreflight = async () => {
    if (effectiveThemeId === null) return;
    setSyncError(null);
    setScanResult(null);

    try {
      // Run the push which now includes pre-flight scan
      const response = await fetch(`/api/projects/${projectId}/shopify/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'push',
          note: pushNote.trim() || undefined,
        }),
      });

      const json = await response.json().catch(() => ({}));
      const data = json.data ?? json;

      if (data.blocked) {
        setScanResult(data.scanResult);
        setSyncError(`Push blocked: ${data.message}`);
        return;
      }

      if (data.scanResult) {
        setScanResult(data.scanResult);
      }

      setPushNote('');
      await queryClient.invalidateQueries({
        queryKey: ['shopify-push-history', projectId],
      });
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Push failed');
    }
  };

  const handleReviewTheme = async () => {
    if (!effectiveThemeId) return;
    setIsReviewing(true);
    setReviewError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/shopify/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'review' }),
      });

      const json = await response.json().catch(() => ({}));
      const data = json.data ?? json;

      // For now, just show scan results since full AI review
      // will be handled by ThemeReviewReport component in the sidebar
      if (data.scanResult) {
        setScanResult(data.scanResult);
      }
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Review failed');
    } finally {
      setIsReviewing(false);
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
      <div className="border ide-border rounded-lg ide-surface-panel p-5 space-y-4 animate-pulse">
        <div className="h-5 ide-surface-inset rounded w-40" />
        <div className="h-4 ide-surface-inset rounded w-60" />
        <div className="h-9 ide-surface-inset rounded w-full" />
      </div>
    );
  }

  // Disconnected state
  if (!connected || !connection) {
    return (
      <div className="border ide-border rounded-lg ide-surface-panel p-5 space-y-4">
        <div className="flex items-center gap-2">
          <StatusDot status="disconnected" />
          <h3 className="text-sm font-semibold ide-text-2">Shopify Store</h3>
        </div>

        <p className="text-xs ide-text-muted">
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
              className="flex-1 min-w-0 px-3 py-2 text-sm rounded-l ide-surface-input border border-r-0 ide-border ide-text placeholder-ide-text-muted focus:outline-none focus:border-sky-500 dark:focus:border-sky-400 transition-colors"
            />
            <span className="inline-flex items-center px-3 py-2 text-sm ide-text-muted ide-surface-inset border border-l-0 ide-border rounded-r select-none whitespace-nowrap">
              .myshopify.com
            </span>
          </div>

          <input
            type="password"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            placeholder="Admin API token (shpat_...)"
            className="w-full px-3 py-2 text-sm rounded ide-surface-input border ide-border ide-text placeholder-ide-text-muted focus:outline-none focus:border-sky-500 dark:focus:border-sky-400 transition-colors"
          />

          <button
            type="button"
            onClick={handleConnect}
            disabled={!shopDomain.trim() || !adminToken.trim() || isConnecting}
            className="px-4 py-2 text-sm rounded bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
    <div className="border ide-border rounded-lg ide-surface-panel p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusDot status={connection.sync_status} />
          <h3 className="text-sm font-semibold ide-text-2">Shopify Store</h3>
        </div>
        <span className="text-xs ide-text-muted font-mono">{connection.store_domain}</span>
      </div>

      {/* Last sync */}
      <div className="text-xs ide-text-muted">
        Last synced: {formatTimestamp(connection.last_sync_at)}
      </div>

      {/* Theme selector */}
      <div className="space-y-2">
        <label className="block text-xs font-medium ide-text-muted">
          Theme
        </label>
        <div ref={themeDropdownRef} className="relative">
          <button
            type="button"
            onClick={() => !isLoadingThemes && setThemeDropdownOpen((o) => !o)}
            disabled={isLoadingThemes}
            className="w-full flex items-center justify-between px-3 py-2 text-sm rounded ide-surface-input border ide-border ide-text focus:outline-none focus:border-sky-500 dark:focus:border-sky-400 transition-colors disabled:opacity-50"
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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 shrink-0 ide-text-3 transition-transform ${themeDropdownOpen ? 'rotate-180' : ''}`}>
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          {themeDropdownOpen && themes.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded ide-surface-pop border ide-border shadow-lg">
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
                          ? 'ide-active ide-text'
                          : 'ide-text-2 ide-hover'
                      }`}
                    >
                      <span className="flex-1 min-w-0 truncate">{theme.name}</span>
                      <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded border ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {theme.updated_at && (
                        <span className="shrink-0 text-[10px] ide-text-muted tabular-nums">
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

      {/* Theme actions */}
      {effectiveThemeId && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Action menu */}
          <div ref={actionMenuRef} className="relative">
<button type="button" onClick={() => setActionMenuOpen((o) => !o)} className="px-2 py-1.5 text-xs rounded ide-surface-input ide-text-2 hover:ide-text ide-hover transition-colors">
            Actions ▾
            </button>
            {actionMenuOpen && (
              <ul className="absolute z-20 mt-1 w-48 rounded ide-surface-pop border ide-border shadow-lg text-xs">
                <li><button type="button" className="w-full text-left px-3 py-2 ide-text-2 ide-hover" onClick={() => { setRenameInput(themes.find((t) => t.id === effectiveThemeId)?.name ?? ''); setActionMenuOpen(false); }}>Rename</button></li>
                <li><button type="button" className="w-full text-left px-3 py-2 ide-text-2 ide-hover" onClick={() => { setCloneNameInput(`Copy of ${themes.find((t) => t.id === effectiveThemeId)?.name ?? 'theme'}`); setCloneModal('shopify'); setActionMenuOpen(false); }}>Clone on Shopify</button></li>
                <li><button type="button" className="w-full text-left px-3 py-2 ide-text-2 ide-hover" onClick={() => { setCloneNameInput(`Copy of project`); setCloneModal('project'); setActionMenuOpen(false); }}>Clone as new project</button></li>
                {themes.find((t) => t.id === effectiveThemeId)?.role !== 'main' && (
                  <li><button type="button" className="w-full text-left px-3 py-2 ide-text-2 ide-hover" onClick={() => { setPublishConfirmStep(1); setActionMenuOpen(false); }}>Publish to live</button></li>
                )}
                <li><a href={`/api/projects/${projectId}/export`} download className="block px-3 py-2 ide-text-2 ide-hover">Export JSON</a></li>
                {themes.find((t) => t.id === effectiveThemeId)?.role !== 'main' && (
                  <li><button type="button" className="w-full text-left px-3 py-2 text-red-500 dark:text-red-400 ide-hover" onClick={() => { setDeleteConfirmName(themes.find((t) => t.id === effectiveThemeId)?.name ?? ''); setDeleteInputValue(''); setActionMenuOpen(false); }}>Delete theme</button></li>
                )}
              </ul>
            )}
          </div>

          {/* Review changes button */}
          <button type="button" onClick={() => effectiveThemeId && diffTheme(effectiveThemeId)} disabled={isDiffingTheme || !effectiveThemeId} className="px-2 py-1.5 text-xs rounded ide-surface-input ide-text-2 hover:ide-text ide-hover disabled:opacity-50 transition-colors">
            {isDiffingTheme ? 'Loading...' : 'Review changes'}
          </button>

          {/* Review Theme button (full AI review) */}
          <button
            type="button"
            onClick={handleReviewTheme}
            disabled={isReviewing || !effectiveThemeId}
            className="px-2 py-1.5 text-xs rounded bg-purple-600/20 text-purple-300 border border-purple-500/30 hover:bg-purple-600/30 disabled:opacity-50 transition-colors"
          >
            {isReviewing ? 'Reviewing...' : 'Review Theme'}
          </button>

          {/* Auto-sync toggle */}
          <label className="flex items-center gap-1.5 text-xs ide-text-muted cursor-pointer select-none">
            <input type="checkbox" checked={autoSyncOn} onChange={(e) => { setAutoSyncOn(e.target.checked); setAutoSyncEnabled(projectId, e.target.checked); }} className="rounded ide-border ide-surface-input text-sky-500 focus:ring-sky-500 focus:ring-offset-0 w-3.5 h-3.5" />
            Auto-push on save
          </label>
        </div>
      )}

      {/* Inline rename */}
      {renameInput !== null && effectiveThemeId && (
        <div className="flex gap-2">
          <input type="text" value={renameInput} onChange={(e) => setRenameInput(e.target.value)} className="flex-1 px-3 py-1.5 text-sm rounded ide-input" autoFocus />
          <button type="button" disabled={!renameInput.trim() || isRenamingTheme} onClick={async () => { await renameTheme({ themeId: effectiveThemeId, name: renameInput.trim() }); setRenameInput(null); }} className="px-3 py-1.5 text-xs rounded bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 transition-colors">{isRenamingTheme ? 'Saving...' : 'Save'}</button>
          <button type="button" onClick={() => setRenameInput(null)} className="px-3 py-1.5 text-xs rounded ide-surface-panel ide-text-2 ide-hover transition-colors">Cancel</button>
        </div>
      )}

      {/* Diff results */}
      {diffResult && diffResult.files.length > 0 && (
        <div className="text-xs p-3 rounded ide-surface-panel border ide-border space-y-1 max-h-48 overflow-y-auto">
          <p className="ide-text-2 font-medium mb-2">{diffResult.files.length} pending changes</p>
          {diffResult.files.map((f) => (
            <div key={f.path} className="flex items-center gap-2 py-0.5">
              <span className={`shrink-0 px-1 py-0.5 rounded text-[10px] ${f.status === 'added' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{f.status}</span>
              <span className="ide-text-muted truncate">{f.path}</span>
            </div>
          ))}
        </div>
      )}
      {diffResult && diffResult.files.length === 0 && (
        <p className="text-xs ide-text-muted">No pending changes to push.</p>
      )}

      {/* Pre-flight scan results */}
      {scanResult && (
        <div className={`text-xs p-3 rounded border space-y-2 ${
          scanResult.passed
            ? 'bg-green-900/20 border-green-700/30'
            : 'bg-red-900/20 border-red-700/30'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`font-medium ${scanResult.passed ? 'text-green-400' : 'text-red-400'}`}>
              {scanResult.passed ? 'Pre-flight passed' : 'Pre-flight failed'}
            </span>
            <span className="ide-text-muted">
              {scanResult.scannedFiles} files in {scanResult.scanTimeMs}ms
            </span>
          </div>

          {scanResult.issues.length > 0 && (
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {scanResult.issues.map((issue: QuickScanIssue, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <span className={`shrink-0 px-1 py-0.5 rounded text-[10px] font-medium ${
                    issue.severity === 'critical'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {issue.severity}
                  </span>
                  <span className="ide-text-muted">
                    <span className="ide-text-muted">{issue.file}</span>
                    {issue.line && <span className="ide-text-quiet">:{issue.line}</span>}
                    {' — '}{issue.message}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setScanResult(null)}
            className="text-[10px] ide-text-muted hover:ide-text-2 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {reviewError && <p className="text-xs text-red-400">{reviewError}</p>}

      {/* Push note */}
      <div>
        <label htmlFor="push-note" className="block text-xs font-medium ide-text-muted mb-1">
          Note (optional, for manual push)
        </label>
        <input
          id="push-note"
          type="text"
          value={pushNote}
          onChange={(e) => setPushNote(e.target.value)}
          placeholder="e.g. Homepage update"
          className="w-full px-3 py-2 text-sm rounded ide-input"
        />
      </div>

      {/* Sync buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleSync('pull')}
          disabled={!effectiveThemeId || isSyncing}
          className="flex-1 px-3 py-2 text-sm rounded ide-surface-panel ide-text ide-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSyncing ? 'Syncing...' : 'Pull from Shopify'}
        </button>
        <button
          type="button"
          onClick={handlePushWithPreflight}
          disabled={!effectiveThemeId || isSyncing}
          className="flex-1 px-3 py-2 text-sm rounded ide-surface-panel ide-text ide-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSyncing ? 'Syncing...' : 'Push to Shopify'}
        </button>
      </div>

      {/* Sync result feedback */}
      {syncResult && (
        <div className="text-xs p-3 rounded ide-surface-panel border ide-border space-y-1">
          <p className="ide-text-2">
            Pulled: {syncResult.pulled} &middot; Pushed: {syncResult.pushed}
          </p>
          {syncResult.conflicts?.length > 0 && (
            <p className="text-yellow-400">Conflicts: {syncResult.conflicts.join(', ')}</p>
          )}
          {syncResult.errors?.length > 0 && (
            <p className="text-red-400">Errors: {syncResult.errors.join(', ')}</p>
          )}
        </div>
      )}

      {syncError && <p className="text-xs text-red-400">{syncError}</p>}
      {rollbackMessage && <p className="text-xs text-green-400">{rollbackMessage}</p>}

      {/* Push history */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium ide-text-muted">Push history</h4>
        {pushHistory.length === 0 ? (
          <p className="text-xs ide-text-muted">No pushes yet.</p>
        ) : (
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {pushHistory.map((row, index) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 py-1.5 px-2 rounded ide-surface-panel border ide-border text-xs"
              >
                <div className="min-w-0 flex-1">
                  <span className="ide-text-muted">{relativeTime(row.pushed_at)}</span>
                  {row.note && (
                    <span className="ml-2 ide-text-muted truncate block" title={row.note}>
                      {row.note.length > 24 ? `${row.note.slice(0, 24)}...` : row.note}
                    </span>
                  )}
                  <span className="ide-text-muted">
                    {TRIGGER_LABELS[row.trigger] ?? row.trigger} &middot; {row.file_count} files
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {index === 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-stone-500/20 ide-text-muted border-stone-500/40 text-[10px]">Current</span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRollback(row.id)}
                    disabled={index === 0 || isRollingBack}
                    className="px-2 py-1 rounded ide-surface-panel ide-text-2 ide-hover disabled:opacity-50 disabled:cursor-not-allowed text-[11px] transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center ide-overlay" role="dialog" aria-modal="true" aria-label="Confirm rollback"
          onKeyDown={(e) => { if (e.key === 'Escape') setRollbackPushId(null); }}
        >
          <div className="ide-surface-pop rounded-lg shadow-xl w-full max-w-sm mx-4 border ide-border p-4 space-y-3">
            <p className="text-sm ide-text">
              Restore preview theme to this push? Current preview state will be overwritten.
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setRollbackPushId(null)} className="px-3 py-1.5 text-sm rounded ide-surface-panel ide-text-2 ide-hover transition-colors">
                Cancel
              </button>
              <button type="button" onClick={confirmRollback} disabled={isRollingBack} className="px-3 py-1.5 text-sm rounded bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {isRollingBack ? 'Rolling back...' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete theme confirmation dialog */}
      {deleteConfirmName !== null && effectiveThemeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center ide-overlay" role="dialog" aria-modal="true">
          <div className="ide-surface-pop rounded-lg shadow-xl w-full max-w-sm mx-4 border ide-border p-4 space-y-3">
            <p className="text-sm ide-text">Delete theme <strong>&ldquo;{deleteConfirmName}&rdquo;</strong>? This will remove it from Shopify permanently.</p>
            <p className="text-xs ide-text-muted">Type the theme name to confirm:</p>
            <input type="text" value={deleteInputValue} onChange={(e) => setDeleteInputValue(e.target.value)} className="w-full px-3 py-2 text-sm rounded ide-input focus:border-red-500 focus:ring-red-500/20" placeholder={deleteConfirmName} autoFocus />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setDeleteConfirmName(null)} className="px-3 py-1.5 text-sm rounded ide-surface-panel ide-text-2 ide-hover transition-colors">Cancel</button>
              <button type="button" disabled={deleteInputValue !== deleteConfirmName || isDeletingTheme} onClick={async () => { await deleteTheme(effectiveThemeId); setDeleteConfirmName(null); }} className="px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">{isDeletingTheme ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Clone modal */}
      {cloneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center ide-overlay" role="dialog" aria-modal="true">
          <div className="ide-surface-pop rounded-lg shadow-xl w-full max-w-sm mx-4 border ide-border p-4 space-y-3">
            <p className="text-sm ide-text">{cloneModal === 'shopify' ? 'Clone theme on Shopify' : 'Clone as new project'}</p>
            <input type="text" value={cloneNameInput} onChange={(e) => setCloneNameInput(e.target.value)} className="w-full px-3 py-2 text-sm rounded ide-input" placeholder="Name" autoFocus />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setCloneModal(null)} className="px-3 py-1.5 text-sm rounded ide-surface-panel ide-text-2 ide-hover transition-colors">Cancel</button>
              <button type="button" disabled={!cloneNameInput.trim() || isCloningTheme || isCloningProject} onClick={async () => {
                if (cloneModal === 'shopify' && effectiveThemeId) {
                  await cloneTheme({ themeId: effectiveThemeId, name: cloneNameInput.trim() });
                } else {
                  const result = await cloneProject({ name: cloneNameInput.trim() });
                  router.push(`/projects/${result.projectId}`);
                }
                setCloneModal(null);
              }} className="px-3 py-1.5 text-sm rounded bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {isCloningTheme || isCloningProject ? 'Cloning...' : 'Clone'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish confirmation (two-step) */}
      {publishConfirmStep > 0 && effectiveThemeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center ide-overlay" role="dialog" aria-modal="true">
          <div className="ide-surface-pop rounded-lg shadow-xl w-full max-w-sm mx-4 border ide-border p-4 space-y-3">
            {publishConfirmStep === 1 && (
              <>
                <p className="text-sm ide-text">This will make this theme <strong>live</strong> on your store. The current live theme will be replaced.</p>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setPublishConfirmStep(0)} className="px-3 py-1.5 text-sm rounded ide-surface-panel ide-text-2 ide-hover transition-colors">Cancel</button>
                  <button type="button" onClick={() => { setPublishConfirmStep(2); setPublishInput(''); }} className="px-3 py-1.5 text-sm rounded bg-yellow-600 text-white hover:bg-yellow-500 transition-colors">Continue</button>
                </div>
              </>
            )}
            {publishConfirmStep === 2 && (
              <>
                <p className="text-sm ide-text">Type <strong>PUBLISH</strong> to confirm:</p>
                <input type="text" value={publishInput} onChange={(e) => setPublishInput(e.target.value)} className="w-full px-3 py-2 text-sm rounded ide-input focus:border-yellow-500 focus:ring-yellow-500/20" placeholder="PUBLISH" autoFocus />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setPublishConfirmStep(0)} className="px-3 py-1.5 text-sm rounded ide-surface-panel ide-text-2 ide-hover transition-colors">Cancel</button>
                  <button type="button" disabled={publishInput !== 'PUBLISH' || isPublishingTheme} onClick={async () => { await publishTheme(effectiveThemeId); setPublishConfirmStep(0); }} className="px-3 py-1.5 text-sm rounded bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">{isPublishingTheme ? 'Publishing...' : 'Publish to live'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
