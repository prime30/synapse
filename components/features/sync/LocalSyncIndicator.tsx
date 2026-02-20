'use client';

import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocalSync, type LocalSyncStatus } from '@/hooks/useLocalSync';

interface LocalSyncIndicatorProps {
  projectId: string | null;
}

/**
 * Subtle sync status indicator for the local file mirror.
 * Shows in the StatusBar when NEXT_PUBLIC_ENABLE_LOCAL_SYNC is enabled.
 *
 * States:
 *   - disabled: hidden
 *   - idle: green dot + "Local sync" (hover shows path) + push button
 *   - pulling: yellow pulsing dot + "Syncing..."
 *   - pushing: sky pulsing dot + "Pushing..."
 *   - error: red dot + error on hover
 */
export function LocalSyncIndicator({ projectId }: LocalSyncIndicatorProps) {
  const {
    status,
    localPath,
    error,
    fileCount,
    enabled,
    pushToDevTheme,
    lastPush,
  } = useLocalSync(projectId);
  const [copied, setCopied] = useState(false);

  const handleCopyPath = useCallback(() => {
    if (!localPath) return;
    navigator.clipboard.writeText(localPath).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [localPath]);

  const handlePush = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    pushToDevTheme();
  }, [pushToDevTheme]);

  if (!enabled || status === 'disabled') return null;

  const dotColor = statusDotColor(status);
  const label = statusLabel(status, fileCount, lastPush);
  const tooltip = statusTooltip(status, localPath, error, copied);

  return (
    <AnimatePresence>
      <motion.div
        key="local-sync"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.3 } }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="inline-flex items-center gap-1.5"
      >
        <button
          type="button"
          onClick={handleCopyPath}
          title={tooltip}
          aria-label={`Local sync: ${label}. ${tooltip}`}
          className="inline-flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors cursor-default select-none"
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
          <span className="tabular-nums">{label}</span>
        </button>

        {status === 'idle' && (
          <button
            type="button"
            onClick={handlePush}
            title="Push local changes to Shopify dev theme"
            className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-white/5 border border-stone-200 dark:border-white/10 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-white/10 hover:text-stone-800 dark:hover:text-white transition-colors"
          >
            Push to Dev
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function statusDotColor(status: LocalSyncStatus): string {
  switch (status) {
    case 'idle':
      return 'bg-green-500';
    case 'pulling':
      return 'bg-yellow-500 animate-pulse';
    case 'pushing':
      return 'bg-sky-500 animate-pulse';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-stone-400 dark:bg-white/40';
  }
}

function statusLabel(
  status: LocalSyncStatus,
  fileCount: number,
  lastPush: { pushed: number; errors: string[] } | null,
): string {
  switch (status) {
    case 'idle':
      if (lastPush && lastPush.pushed > 0) {
        return `Pushed ${lastPush.pushed} files`;
      }
      return fileCount > 0 ? `Local (${fileCount})` : 'Local sync';
    case 'pulling':
      return 'Syncing...';
    case 'pushing':
      return 'Pushing to dev...';
    case 'error':
      return 'Sync error';
    default:
      return '';
  }
}

function statusTooltip(
  status: LocalSyncStatus,
  localPath: string | null,
  error: string | null,
  copied: boolean,
): string {
  if (copied) return 'Path copied!';
  if (status === 'error' && error) return `Error: ${error}`;
  if (status === 'pulling') return 'Pulling files to local disk...';
  if (status === 'pushing') return 'Pushing changes to Shopify dev theme...';
  if (localPath) return `Click to copy: ${localPath}`;
  return 'Local file sync active';
}
