'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface TakeToCursorModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeDomain: string;
  themeId: string | number;
}

export function TakeToCursorModal({ isOpen, onClose, storeDomain, themeId }: TakeToCursorModalProps) {
  const [copied, setCopied] = useState(false);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const hasStore = !!storeDomain;
  const hasTheme = !!themeId;

  const parts = ['npx @synapse/theme-cli init'];
  if (hasStore) parts.push(`--store ${storeDomain}`);
  if (hasTheme) parts.push(`--theme ${themeId}`);
  const command = parts.join(' ');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full max-w-lg mx-4 rounded-xl ide-surface-panel border ide-border shadow-2xl">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-stone-900 dark:text-white">
              Take to Cursor
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md ide-text-muted hover:ide-text ide-hover transition-colors"
              aria-label="Close"
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="text-sm text-stone-600 dark:text-gray-400 mb-4">
            Set up Cursor with Shopify theme intelligence, MCP tools, and live preview integration.
          </p>

          {!hasStore && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 text-sm text-amber-700 dark:text-amber-400">
              Connect a Shopify store first to generate the full setup command.
            </div>
          )}

          <div className="relative">
            <pre className="bg-stone-100 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg p-4 pr-12 font-mono text-[12px] text-stone-900 dark:text-white overflow-x-auto whitespace-pre-wrap break-all">{command}</pre>
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-3 right-3 p-1.5 rounded-md ide-text-muted hover:ide-text ide-hover transition-colors"
              title="Copy to clipboard"
            >
              {copied ? (
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </button>
          </div>

          <div className="mt-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-gray-500">
              What this sets up
            </h3>
            <ul className="space-y-1.5 text-sm text-stone-600 dark:text-gray-400">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 w-4 h-4 rounded bg-stone-200 dark:bg-white/10 flex items-center justify-center text-[9px] font-bold text-stone-500 dark:text-gray-500">R</span>
                <span>Cursor rules for Shopify theme architecture and best practices</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 w-4 h-4 rounded bg-stone-200 dark:bg-white/10 flex items-center justify-center text-[9px] font-bold text-stone-500 dark:text-gray-500">T</span>
                <span>MCP tools for theme intelligence, store queries, and preview inspection</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 w-4 h-4 rounded bg-stone-200 dark:bg-white/10 flex items-center justify-center text-[9px] font-bold text-stone-500 dark:text-gray-500">P</span>
                <span>Live preview with bridge injection via <code className="px-1 py-0.5 rounded bg-stone-100 dark:bg-white/5 font-mono text-[11px]">synapse-theme dev</code></span>
              </li>
            </ul>
          </div>

          <div className="mt-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-gray-500">
              After setup
            </h3>
            <ol className="space-y-2 text-sm text-stone-600 dark:text-gray-400">
              <li className="flex gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-stone-200 dark:bg-white/10 flex items-center justify-center text-[10px] font-bold text-stone-600 dark:text-gray-400">1</span>
                <span>Authenticate: <code className="px-1 py-0.5 rounded bg-stone-100 dark:bg-white/5 font-mono text-[11px]">synapse-theme store-add --store {storeDomain || 'your-store.myshopify.com'}</code></span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-stone-200 dark:bg-white/10 flex items-center justify-center text-[10px] font-bold text-stone-600 dark:text-gray-400">2</span>
                <span>Pull theme files: <code className="px-1 py-0.5 rounded bg-stone-100 dark:bg-white/5 font-mono text-[11px]">synapse-theme pull</code></span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-stone-200 dark:bg-white/10 flex items-center justify-center text-[10px] font-bold text-stone-600 dark:text-gray-400">3</span>
                <span>Open the folder in Cursor and start editing</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-stone-200 dark:bg-white/10 flex items-center justify-center text-[10px] font-bold text-stone-600 dark:text-gray-400">4</span>
                <span>Run <code className="px-1 py-0.5 rounded bg-stone-100 dark:bg-white/5 font-mono text-[11px]">synapse-theme dev</code> for live preview with Alt+click inspection</span>
              </li>
            </ol>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg ide-text-2 ide-hover transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
