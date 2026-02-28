'use client';

import { useEffect, useRef, useState, useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ProjectLoadingState, LoadingItem } from '@/hooks/useProjectLoadingState';

interface ProjectLoadingOverlayProps {
  projectId: string;
  state: ProjectLoadingState;
  /** Called when the overlay fully collapses so the parent can render a StatusBar indicator. */
  onCollapse?: () => void;
}

const SESSION_KEY_PREFIX = 'synapse-loading-overlay-shown-';
const AUTO_COLLAPSE_DELAY_MS = 1200;

function StatusDot({ status }: { status: LoadingItem['status'] }) {
  const base = 'w-2 h-2 rounded-full shrink-0 transition-colors duration-300';
  switch (status) {
    case 'active':
      return <span className={`${base} bg-sky-500 dark:bg-sky-400 motion-safe:animate-pulse`} />;
    case 'done':
      return <span className={`${base} bg-[oklch(0.745_0.189_148)]`} />;
    case 'error':
      return <span className={`${base} bg-red-500 dark:bg-red-400`} />;
    default:
      return <span className={`${base} bg-stone-300 dark:bg-white/10`} />;
  }
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-[oklch(0.745_0.189_148)]">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ItemRow({ item }: { item: LoadingItem }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <StatusDot status={item.status} />
      <span
        className={`text-[11px] flex-1 truncate transition-colors duration-200 ${
          item.status === 'done'
            ? 'ide-text-muted line-through decoration-stone-300 dark:decoration-white/10'
            : item.status === 'active'
              ? 'ide-text font-medium'
              : item.status === 'error'
                ? 'text-red-500 dark:text-red-400'
                : 'ide-text-muted'
        }`}
      >
        {item.label}
      </span>
      {item.detail && (
        <span className="text-[10px] ide-text-muted tabular-nums whitespace-nowrap">
          {item.detail}
        </span>
      )}
      {item.status === 'done' && <CheckIcon />}
    </div>
  );
}

function ProgressBar({ progress, indeterminate }: { progress?: number; indeterminate?: boolean }) {
  return (
    <div className="h-0.5 rounded-full ide-surface-inset overflow-hidden">
      {indeterminate ? (
        <div className="h-full w-1/3 rounded-full bg-sky-500 dark:bg-sky-400 animate-[indeterminate-slide_1.5s_ease-in-out_infinite]" />
      ) : (
        <div
          className="h-full rounded-full bg-sky-500 dark:bg-sky-400 transition-all duration-300 ease-out"
          style={{ width: `${Math.min(progress ?? 0, 100)}%` }}
        />
      )}
    </div>
  );
}

export function ProjectLoadingOverlay({ projectId, state, onCollapse }: ProjectLoadingOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Session guard: only show once per project per session
  useEffect(() => {
    const key = `${SESSION_KEY_PREFIX}${projectId}`;
    if (typeof window !== 'undefined' && sessionStorage.getItem(key)) {
      setDismissed(true);
      return;
    }
    setVisible(true);
  }, [projectId]);

  // Auto-collapse when critical items finish
  useEffect(() => {
    if (!state.criticalDone || dismissed) return;
    collapseTimerRef.current = setTimeout(() => {
      setVisible(false);
      setDismissed(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(`${SESSION_KEY_PREFIX}${projectId}`, '1');
      }
      onCollapse?.();
    }, AUTO_COLLAPSE_DELAY_MS);
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    };
  }, [state.criticalDone, dismissed, projectId, onCollapse]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`${SESSION_KEY_PREFIX}${projectId}`, '1');
    }
    onCollapse?.();
  }, [projectId, onCollapse]);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    },
    [handleDismiss],
  );

  // Global escape listener
  useEffect(() => {
    if (!visible) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, handleDismiss]);

  const doneCount = state.items.filter(i => i.status === 'done').length;
  const totalCount = state.items.length;
  const overallProgress = Math.round((doneCount / totalCount) * 100);
  const hasActiveWithProgress = state.items.some(i => i.status === 'active' && i.progress != null);

  if (dismissed && !visible) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={panelRef}
          role="status"
          aria-live="polite"
          aria-label="Project loading progress"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="fixed bottom-8 right-4 z-[var(--z-overlay)] w-[280px] rounded-xl ide-surface-panel border ide-border shadow-lg shadow-black/5 dark:shadow-black/30 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
            <span className="text-[11px] font-medium ide-text">
              Loading project
              <span className="ide-text-muted font-normal ml-1.5">{doneCount}/{totalCount}</span>
            </span>
            <button
              type="button"
              onClick={handleDismiss}
              className="w-4 h-4 flex items-center justify-center rounded hover:bg-stone-200 dark:hover:bg-white/10 transition-colors ide-text-muted"
              aria-label="Dismiss loading overlay"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Overall progress bar */}
          <div className="px-3 pb-1.5">
            <ProgressBar
              progress={overallProgress}
              indeterminate={!hasActiveWithProgress && doneCount < totalCount}
            />
          </div>

          {/* Item list */}
          <div className="px-3 pb-2.5 space-y-0.5">
            {state.items.map(item => (
              <ItemRow key={item.id} item={item} />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
