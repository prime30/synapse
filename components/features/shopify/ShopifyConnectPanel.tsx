'use client';

import { useState } from 'react';
import { useShopifyConnection } from '@/hooks/useShopifyConnection';

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

export function ShopifyConnectPanel({ projectId }: ShopifyConnectPanelProps) {
  const {
    connection,
    connected,
    isLoading,
    connect,
    disconnect,
    isDisconnecting,
    sync,
    isSyncing,
    syncResult,
    themes,
    isLoadingThemes,
  } = useShopifyConnection(projectId);

  const [shopDomain, setShopDomain] = useState('');
  const [selectedThemeId, setSelectedThemeId] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleConnect = () => {
    const domain = shopDomain.trim();
    if (!domain) return;
    // Append .myshopify.com if the user only typed the store name
    const fullDomain = domain.includes('.myshopify.com')
      ? domain
      : `${domain}.myshopify.com`;
    connect(fullDomain);
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  };

  const handleSync = async (action: 'pull' | 'push') => {
    if (!selectedThemeId) return;
    setSyncError(null);
    try {
      await sync({ action, themeId: selectedThemeId });
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Sync failed');
    }
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="border border-gray-700 rounded-lg bg-gray-900/50 p-5 space-y-4 animate-pulse">
        <div className="h-5 bg-gray-700 rounded w-40" />
        <div className="h-4 bg-gray-700 rounded w-60" />
        <div className="h-9 bg-gray-700 rounded w-full" />
      </div>
    );
  }

  // ── Disconnected state ────────────────────────────────────────────────────
  if (!connected || !connection) {
    return (
      <div className="border border-gray-700 rounded-lg bg-gray-900/50 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <StatusDot status="disconnected" />
          <h3 className="text-sm font-semibold text-gray-200">
            Shopify Store
          </h3>
        </div>

        <p className="text-xs text-gray-400">
          Connect a Shopify store to sync theme files with this project.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={shopDomain}
            onChange={(e) => setShopDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            placeholder="store-name.myshopify.com"
            className="flex-1 px-3 py-2 text-sm rounded bg-gray-800 border border-gray-600 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <button
            type="button"
            onClick={handleConnect}
            disabled={!shopDomain.trim()}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Connect
          </button>
        </div>
      </div>
    );
  }

  // ── Connected state ───────────────────────────────────────────────────────
  return (
    <div className="border border-gray-700 rounded-lg bg-gray-900/50 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusDot status={connection.sync_status} />
          <h3 className="text-sm font-semibold text-gray-200">
            Shopify Store
          </h3>
        </div>
        <span className="text-xs text-gray-400 font-mono">
          {connection.store_domain}
        </span>
      </div>

      {/* Last sync */}
      <div className="text-xs text-gray-500">
        Last synced: {formatTimestamp(connection.last_sync_at)}
      </div>

      {/* Theme selector */}
      <div className="space-y-2">
        <label
          htmlFor="theme-select"
          className="block text-xs font-medium text-gray-400"
        >
          Theme
        </label>
        <select
          id="theme-select"
          value={selectedThemeId ?? ''}
          onChange={(e) =>
            setSelectedThemeId(e.target.value ? Number(e.target.value) : null)
          }
          disabled={isLoadingThemes}
          className="w-full px-3 py-2 text-sm rounded bg-gray-800 border border-gray-600 text-gray-200 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
        >
          <option value="">
            {isLoadingThemes ? 'Loading themes…' : 'Select a theme'}
          </option>
          {themes.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
              {theme.role === 'main' ? ' (Live)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Sync buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleSync('pull')}
          disabled={!selectedThemeId || isSyncing}
          className="flex-1 px-3 py-2 text-sm rounded bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSyncing ? 'Syncing…' : 'Pull from Shopify'}
        </button>
        <button
          type="button"
          onClick={() => handleSync('push')}
          disabled={!selectedThemeId || isSyncing}
          className="flex-1 px-3 py-2 text-sm rounded bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSyncing ? 'Syncing…' : 'Push to Shopify'}
        </button>
      </div>

      {/* Sync result feedback */}
      {syncResult && (
        <div className="text-xs p-3 rounded bg-gray-800 border border-gray-700 space-y-1">
          <p className="text-gray-300">
            Pulled: {syncResult.pulled} &middot; Pushed: {syncResult.pushed}
          </p>
          {syncResult.conflicts.length > 0 && (
            <p className="text-yellow-400">
              Conflicts: {syncResult.conflicts.join(', ')}
            </p>
          )}
          {syncResult.errors.length > 0 && (
            <p className="text-red-400">
              Errors: {syncResult.errors.join(', ')}
            </p>
          )}
        </div>
      )}

      {syncError && (
        <p className="text-xs text-red-400">{syncError}</p>
      )}

      {/* Disconnect */}
      <div className="pt-2 border-t border-gray-700">
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={isDisconnecting}
          className="px-3 py-1.5 text-xs rounded text-red-400 hover:text-red-300 hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isDisconnecting ? 'Disconnecting…' : 'Disconnect Store'}
        </button>
      </div>
    </div>
  );
}
