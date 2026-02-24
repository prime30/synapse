'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pin } from 'lucide-react';
import { safeTransition } from '@/lib/accessibility';
import { DependencyTree, type DependencyTreeFile } from './DependencyTree';
import { Skeleton } from '@/components/ui/Skeleton';

export interface ContextDrawerFile {
  path: string;
  tokenCount: number;
  source: 'active' | 'pinned' | 'auto' | 'preview';
  isPinned: boolean;
}

export interface ContextDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  contextFiles: ContextDrawerFile[];
  totalTokens: number;
  modelLimit: number;
  onTogglePin: (filePath: string) => void;
  /** Optional dependency graph for "Dependencies" view. When provided, enables the view toggle. */
  dependencyFiles?: DependencyTreeFile[];
  /** Called when user clicks a file in the dependency tree (e.g. to open in editor). */
  onFileClick?: (path: string) => void;
  /** Optional: show skeleton while context files are loading. */
  isLoading?: boolean;
}

const SOURCE_COLORS: Record<ContextDrawerFile['source'], string> = {
  active: 'bg-sky-500',
  pinned: 'bg-[oklch(0.745_0.189_148)]',
  auto: 'bg-stone-400 dark:bg-stone-500',
  preview: 'bg-purple-500',
};

type ContextViewMode = 'list' | 'dependencies';

export function ContextDrawer({
  isOpen,
  onClose,
  contextFiles,
  totalTokens,
  modelLimit,
  onTogglePin,
  dependencyFiles = [],
  onFileClick,
  isLoading = false,
}: ContextDrawerProps) {
  const [viewMode, setViewMode] = useState<ContextViewMode>('list');
  const usagePercent = modelLimit > 0 ? Math.min(100, (totalTokens / modelLimit) * 100) : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/20 dark:bg-black/40 z-20"
            onClick={onClose}
            aria-hidden
          />
          {/* Drawer panel */}
          <motion.aside
            initial={{ translateX: '100%' }}
            animate={{ translateX: 0 }}
            exit={{ translateX: '100%' }}
            transition={safeTransition(0.2)}
            className="fixed right-0 top-0 h-full w-80 z-30 bg-white dark:bg-[oklch(0.185_0_0)] border-l border-stone-200 dark:border-white/10 shadow-xl flex flex-col"
            role="dialog"
            aria-label="Context panel"
          >
            {/* Token budget bar */}
            <div className="shrink-0 h-1 bg-stone-100 dark:bg-stone-800">
              <div
                className="h-full bg-sky-500 dark:bg-sky-400 transition-all duration-300"
                style={{ width: `${usagePercent}%` }}
              />
            </div>

            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-white/10">
              <h2 className="text-sm font-medium text-stone-900 dark:text-white">
                Context
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 dark:hover:bg-white/5 transition-colors"
                aria-label="Close context panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Token summary */}
            <div className="shrink-0 px-4 py-2 text-[10px] tabular-nums text-stone-500 dark:text-stone-400">
              {totalTokens.toLocaleString()} / {modelLimit.toLocaleString()} tokens
            </div>

            {/* View toggle: List / Dependencies */}
            <div className="shrink-0 flex gap-1 px-4 pb-2">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`text-xs rounded-md px-2 py-1 transition-colors ${
                  viewMode === 'list'
                    ? 'bg-stone-200 dark:bg-white/10 text-stone-900 dark:text-white'
                    : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-white/5'
                }`}
                aria-pressed={viewMode === 'list'}
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setViewMode('dependencies')}
                className={`text-xs rounded-md px-2 py-1 transition-colors ${
                  viewMode === 'dependencies'
                    ? 'bg-stone-200 dark:bg-white/10 text-stone-900 dark:text-white'
                    : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-white/5'
                }`}
                aria-pressed={viewMode === 'dependencies'}
              >
                Dependencies
              </button>
            </div>

            {/* File list or Dependency tree */}
            <div className="flex-1 overflow-y-auto">
              {viewMode === 'dependencies' ? (
                <DependencyTree
                  files={dependencyFiles}
                  onFileClick={onFileClick}
                />
              ) : isLoading && contextFiles.length === 0 ? (
                <div className="px-4 py-8">
                  <Skeleton variant="list" lines={6} />
                </div>
              ) : contextFiles.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-stone-500 dark:text-stone-400">
                  No files in context
                </div>
              ) : (
                <ul className="divide-y divide-stone-100 dark:divide-white/5">
                  {contextFiles.map((file) => (
                    <li
                      key={file.path}
                      className="flex items-center gap-2 px-4 py-2 hover:bg-stone-50 dark:hover:bg-white/5"
                    >
                      {/* Source indicator */}
                      <span
                        className={`shrink-0 w-1.5 h-1.5 rounded-full ${SOURCE_COLORS[file.source]}`}
                        title={file.source}
                        aria-hidden
                      />
                      {/* Path */}
                      <span
                        className="text-xs font-mono text-stone-700 dark:text-stone-300 truncate flex-1 min-w-0"
                        title={file.path}
                      >
                        {file.path}
                      </span>
                      {/* Token count */}
                      <span className="text-[10px] tabular-nums text-stone-400 dark:text-stone-500 shrink-0">
                        {file.tokenCount.toLocaleString()}
                      </span>
                      {/* Pin button */}
                      <button
                        type="button"
                        onClick={() => onTogglePin(file.path)}
                        className={`w-6 h-6 flex items-center justify-center rounded shrink-0 transition-colors ${
                          file.isPinned
                            ? 'text-sky-500 dark:text-sky-400'
                            : 'text-stone-400 hover:text-sky-500 dark:hover:text-sky-400'
                        }`}
                        title={file.isPinned ? 'Unpin' : 'Pin'}
                        aria-label={file.isPinned ? 'Unpin file' : 'Pin file'}
                      >
                        <Pin
                          className={`h-3.5 w-3.5 ${file.isPinned ? 'fill-current' : ''}`}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
