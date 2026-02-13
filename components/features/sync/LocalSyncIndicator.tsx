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
 *   - idle: green dot + "Local sync" (hover shows path)
 *   - pulling: yellow pulsing dot + "Syncing..."
 *   - error: red dot + error on hover
 */
export function LocalSyncIndicator({ projectId }: LocalSyncIndicatorProps) {
  const { status, localPath, error, fileCount, enabled } = useLocalSync(projectId);
  const [copied, setCopied] = useState(false);

  const handleCopyPath = useCallback(() => {
    if (!localPath) return;
    navigator.clipboard.writeText(localPath).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [localPath]);

  if (!enabled || status === 'disabled') return null;

  const dotColor = statusDotColor(status);
  const label = statusLabel(status, fileCount);
  const tooltip = statusTooltip(status, localPath, error, copied);

  return (
    <AnimatePresence>
      <motion.button
        type="button"
        key="local-sync"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.3 } }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        onClick={handleCopyPath}
        title={tooltip}
        aria-label={`Local sync: ${label}. ${tooltip}`}
        className="inline-flex items-center gap-1.5 text-[11px] ide-text-muted hover:ide-text-2 transition-colors cursor-default select-none"
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
        <span className="tabular-nums">{label}</span>
      </motion.button>
    </AnimatePresence>
  );
}

function statusDotColor(status: LocalSyncStatus): string {
  switch (status) {
    case 'idle':
      return 'bg-green-500';
    case 'pulling':
      return 'bg-yellow-500 animate-pulse';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-stone-400 dark:bg-white/40';
  }
}

function statusLabel(status: LocalSyncStatus, fileCount: number): string {
  switch (status) {
    case 'idle':
      return fileCount > 0 ? `Local (${fileCount})` : 'Local sync';
    case 'pulling':
      return 'Syncing...';
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
  if (localPath) return `Click to copy: ${localPath}`;
  return 'Local file sync active';
}
