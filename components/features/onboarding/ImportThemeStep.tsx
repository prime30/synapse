'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useActiveStore } from '@/hooks/useActiveStore';
import { useProjects, type Project } from '@/hooks/useProjects';
import { GlassCard } from '@/components/marketing/glass/GlassCard';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShopifyTheme {
  id: number;
  name: string;
  role: 'main' | 'unpublished' | 'demo' | 'development';
  updated_at: string;
}

// ── Role badges ───────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  main: { label: 'Live', cls: 'bg-green-500/20 text-green-400 border-green-500/40' },
  development: { label: 'Dev', cls: 'ide-active text-sky-500 dark:text-sky-400 border-sky-500/40' },
  demo: { label: 'Demo', cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  unpublished: { label: 'Unpublished', cls: 'bg-stone-500/20 ide-text-muted border-stone-500/40' },
};

function RoleBadge({ role }: { role: string }) {
  const badge = ROLE_BADGE[role] ?? ROLE_BADGE.unpublished;
  return (
    <span
      className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded border ${badge.cls}`}
    >
      {badge.label}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ArrowRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="ide-text-muted shrink-0"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="p-4 rounded-xl bg-stone-100/50 dark:bg-white/[0.03] border border-stone-200 dark:border-white/10 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-stone-200 dark:bg-white/10" />
          <div className="flex items-center gap-2">
            <div className="h-3 w-12 rounded bg-stone-200 dark:bg-white/10" />
            <div className="h-3 w-16 rounded bg-stone-200 dark:bg-white/10" />
          </div>
        </div>
        <div className="h-4 w-4 rounded bg-stone-200 dark:bg-white/10" />
      </div>
    </div>
  );
}

// ── Theme Card (shared layout) ────────────────────────────────────────────────

function ThemeCard({
  theme,
  onClick,
  variant = 'default',
}: {
  theme: ShopifyTheme;
  onClick: () => void;
  variant?: 'live' | 'default';
}) {
  const isLive = variant === 'live';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Import theme: ${theme.name} (${theme.role === 'main' ? 'Live' : theme.role})`}
      className="w-full text-left"
    >
      <div
        className={`flex items-center justify-between p-4 rounded-xl transition-all ${
          isLive
            ? 'bg-green-500/[0.04] border border-green-500/40 shadow-[0_0_20px_rgba(34,197,94,0.12)] hover:shadow-[0_0_28px_rgba(34,197,94,0.2)] hover:border-green-400/60 hover:bg-green-500/[0.07]'
            : 'bg-stone-100/50 dark:bg-white/[0.03] border border-stone-200 dark:border-white/10 hover:border-emerald-500/30 hover:bg-stone-100 dark:hover:bg-white/[0.05]'
        }`}
      >
        <div>
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
            )}
            <span className="text-sm font-medium text-stone-900 dark:text-white">{theme.name}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <RoleBadge role={theme.role} />
            <span className="text-[11px] ide-text-muted">
              {relativeTime(theme.updated_at)}
            </span>
          </div>
        </div>
        <ArrowRightIcon />
      </div>
    </button>
  );
}

// ── Archived project row ──────────────────────────────────────────────────────

function ArchivedRow({
  project,
  onRestore,
  onDelete,
  busy,
}: {
  project: Project;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  busy: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [hovered, setHovered] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-stone-100 dark:bg-white/[0.03] border border-stone-200 dark:border-white/10 text-sm">
        <span className="text-stone-500 dark:text-gray-400 text-xs">Delete permanently?</span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              onDelete(project.id);
              setConfirming(false);
            }}
            className="text-xs font-medium text-red-500 dark:text-red-400 hover:text-red-400 dark:hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-500/10 transition-colors"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-xs ide-text-muted hover:text-stone-700 dark:hover:text-white/70 px-1.5 py-0.5 rounded ide-hover transition-colors"
          >
            No
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between px-4 py-2 rounded-xl bg-stone-100/50 dark:bg-white/[0.03] border border-stone-200 dark:border-white/10 text-sm"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="ide-text-muted font-medium truncate">{project.name}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        {busy ? (
          <svg className="w-4 h-4 animate-spin text-emerald-500" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
          </svg>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onRestore(project.id)}
              aria-label={`Restore ${project.name}`}
              className="text-xs bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg px-2.5 py-1 transition-colors"
            >
              Restore
            </button>
            {hovered && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                aria-label={`Delete ${project.name}`}
                className="text-xs text-red-500 dark:text-red-400 hover:text-red-400 dark:hover:text-red-300 hover:bg-red-500/10 rounded-lg px-2 py-1 transition-colors"
              >
                Delete
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ImportThemeStepProps {
  onImported: (projectId: string) => void;
  onSkip: () => void;
  onBack: () => void;
  activeProjects?: Project[];
  archivedProjects?: Project[];
}

export function ImportThemeStep({ onImported, onSkip, onBack: _onBack, activeProjects = [], archivedProjects = [] }: ImportThemeStepProps) {
  const { connection, importTheme, isImporting } = useActiveStore();
  const router = useRouter();
  const { restoreProject, deleteProject } = useProjects(connection?.id ?? null);
  const [importingThemeName, setImportingThemeName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Dev theme naming step ───────────────────────────────────────────
  const [selectedTheme, setSelectedTheme] = useState<ShopifyTheme | null>(null);
  const [devThemeName, setDevThemeName] = useState('');

  // ── Progress tracking state ──────────────────────────────────────────
  const [totalAssets, setTotalAssets] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Stop polling helper ──────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Clean up polling on unmount
  useEffect(() => stopPolling, [stopPolling]);

  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const handleRestore = useCallback(
    async (id: string) => {
      setBusyIds((prev) => new Set(prev).add(id));
      try {
        await restoreProject(id);
        fetch(`/api/projects/${id}/sync-dev-theme`, { method: 'POST' }).catch(() => {});
        router.push(`/projects/${id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to restore project. Please try again.');
      } finally {
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [restoreProject, router],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setBusyIds((prev) => new Set(prev).add(id));
      try {
        await deleteProject(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete project. Please try again.');
      } finally {
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [deleteProject],
  );

  // ── Fetch themes ──────────────────────────────────────────────────────
  const themesQuery = useQuery({
    queryKey: ['onboarding-themes', connection?.id],
    queryFn: async (): Promise<ShopifyTheme[]> => {
      if (!connection) return [];
      const res = await fetch(`/api/stores/${connection.id}/themes`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Failed to load themes (${res.status})`);
      }
      const json = await res.json();
      return (json.data?.themes ?? json.data ?? []) as ShopifyTheme[];
    },
    enabled: !!connection,
    retry: 1,
  });

  const themes = themesQuery.data ?? [];
  const isLoading = themesQuery.isLoading;

  // Split into live theme and other themes, sorted by most recently edited
  const liveTheme = useMemo(() => themes.find((t) => t.role === 'main'), [themes]);
  const otherThemes = useMemo(
    () => themes
      .filter((t) => t.role !== 'main')
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [themes],
  );

  // ── Select theme → show naming step ──────────────────────────────────
  const handleSelectTheme = useCallback(
    (theme: ShopifyTheme) => {
      setSelectedTheme(theme);
      setDevThemeName(`${theme.name} - Synapse`);
      setError(null);
    },
    [],
  );

  // ── Import handler with progress polling ─────────────────────────────
  const handleImport = useCallback(
    async () => {
      if (!connection || isImporting || !selectedTheme) return;
      const theme = selectedTheme;
      const trimmedName = devThemeName.trim() || `${theme.name} - Synapse`;

      setError(null);
      setImportingThemeName(theme.name);
      setTotalAssets(0);
      setImportedCount(0);

      try {
        // 1. Pre-flight: fetch text asset count (binary deferred to background)
        try {
          const countRes = await fetch(
            `/api/stores/${connection.id}/themes/${theme.id}/asset-count`
          );
          if (countRes.ok) {
            const countJson = await countRes.json();
            // Use text count as denominator — binary assets sync in IDE background
            setTotalAssets(countJson.data?.text ?? countJson.data?.total ?? 0);
          }
        } catch {
          // Non-critical -- progress bar won't show a total
        }

        // 2. Generate client-side project UUID for immediate polling
        const clientProjectId = crypto.randomUUID();

        // 3. Start polling file count (every 1s so progress and completion feel responsive)
        stopPolling();
        pollingRef.current = setInterval(async () => {
          try {
            const res = await fetch(`/api/projects/${clientProjectId}/files/count`);
            if (res.ok) {
              const json = await res.json();
              setImportedCount(json.data?.count ?? 0);
            }
          } catch {
            // Polling failure is non-critical
          }
        }, 1000);

        // 4. Call importTheme with the client projectId and dev theme name
        const result = await importTheme({
          connectionId: connection.id,
          themeId: theme.id,
          themeName: theme.name,
          note: trimmedName,
          projectId: clientProjectId,
        });

        // 5. Import done -- stop polling, set final count
        stopPolling();
        setImportedCount(result.pulled);

        onImported(result.projectId);
      } catch (err) {
        stopPolling();
        setError(err instanceof Error ? err.message : 'Import failed. Please try again.');
        setImportingThemeName(null);
      }
    },
    [connection, importTheme, isImporting, selectedTheme, devThemeName, onImported, stopPolling],
  );

  // ── Dev theme naming step ────────────────────────────────────────────
  if (selectedTheme && !importingThemeName) {
    return (
      <div className="flex flex-col items-center text-center max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-sm space-y-5"
        >
          <div>
            <h2 className="text-xl font-bold text-stone-900 dark:text-white">Name your dev theme</h2>
            <p className="mt-2 text-sm ide-text-muted leading-relaxed">
              We&apos;ll create a development copy of{' '}
              <span className="ide-text-2 font-medium">{selectedTheme.name}</span>{' '}
              so your live theme stays untouched.
            </p>
          </div>

          <div className="text-left space-y-1.5">
            <label htmlFor="dev-theme-name" className="text-xs font-medium ide-text-muted">
              Dev theme name
            </label>
            <input
              id="dev-theme-name"
              type="text"
              value={devThemeName}
              onChange={(e) => setDevThemeName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && devThemeName.trim()) handleImport();
                if (e.key === 'Escape') { setSelectedTheme(null); setError(null); }
              }}
              placeholder={`${selectedTheme.name} - Synapse`}
              className="w-full px-3 py-2.5 rounded-xl ide-input text-sm"
              autoFocus
            />
            <p className="text-[11px] ide-text-muted">
              This name will appear in your Shopify admin under development themes.
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400"
            >
              {error}
            </motion.div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setSelectedTheme(null);
                setError(null);
              }}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium ide-text-2 ide-surface-input border ide-border ide-hover transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!devThemeName.trim()}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Import Theme
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Importing state with progress ────────────────────────────────────
  if (importingThemeName && isImporting) {
    const hasTotal = totalAssets > 0;
    const progress = hasTotal
      ? Math.min(Math.round((importedCount / totalAssets) * 100), 100)
      : 0;

    return (
      <div className="flex flex-col items-center text-center max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-4 w-full max-w-sm"
        >
          <div aria-live="polite">
            <p className="text-sm font-medium ide-text-2">
              Importing {importingThemeName}...
            </p>
            <p className="mt-1 text-xs ide-text-muted">
              Fetching theme files from Shopify and saving to your project.
            </p>
          </div>

          {/* Progress bar + file count */}
          <div className="w-full space-y-1.5">
            <div
              className="h-2 rounded-full bg-stone-200 dark:bg-white/[0.06] overflow-hidden"
              role="progressbar"
              aria-valuenow={hasTotal ? progress : undefined}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={hasTotal ? `Importing theme: ${progress}% complete` : 'Importing theme...'}
            >
              {hasTotal && progress > 0 ? (
                <motion.div
                  className="h-full rounded-full bg-sky-500"
                  initial={{ width: '0%' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              ) : (
                /* Indeterminate: a slow-growing bar that signals activity without bouncing */
                <motion.div
                  className="h-full rounded-full bg-sky-500/70"
                  initial={{ width: '5%' }}
                  animate={{ width: '85%' }}
                  transition={{ duration: 30, ease: 'easeOut' }}
                />
              )}
            </div>

            {/* File count always visible */}
            <div className="flex items-center justify-between text-xs tabular-nums">
              <span className="ide-text-muted">
                {hasTotal
                  ? importedCount === 0
                    ? `0 / ${totalAssets} files (downloading…)`
                    : `${importedCount} / ${totalAssets} files`
                  : importedCount > 0
                    ? `${importedCount} files`
                    : 'Downloading from Shopify...'}
              </span>
              {hasTotal && (
                <span className="ide-text-muted">{progress}%</span>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center max-w-lg mx-auto">
      {/* Heading */}
      <motion.h2
        className="text-2xl font-bold text-stone-900 dark:text-white"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        Import a theme
      </motion.h2>

      {/* Subtitle */}
      <motion.p
        className="mt-3 text-sm ide-text-muted leading-relaxed"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05, ease: 'easeOut' }}
      >
        Choose a theme from your store to start editing.
      </motion.p>

      {/* Store badge */}
      {connection && (
        <motion.div
          className="mt-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-100 dark:bg-white/5 border border-stone-200 dark:border-white/10"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
        >
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs font-mono ide-text-muted">{connection.store_domain}</span>
        </motion.div>
      )}

      {/* Theme list */}
      <motion.div
        className="mt-6 w-full space-y-2"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
      >
        {/* Loading skeletons */}
        {isLoading && (
          <div className="space-y-2">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* Error state */}
        {themesQuery.isError && !isLoading && (
          <GlassCard padding="sm" theme="light">
            <div className="flex flex-col items-center gap-3 py-4">
              <p className="text-sm ide-text-muted">Failed to load themes.</p>
              <button
                type="button"
                onClick={() => themesQuery.refetch()}
                className="px-4 py-1.5 text-sm rounded-lg bg-white/10 text-white hover:bg-white/15 transition-colors"
              >
                Retry
              </button>
            </div>
          </GlassCard>
        )}

        {/* Empty state */}
        {!isLoading && !themesQuery.isError && themes.length === 0 && (
          <GlassCard padding="sm" theme="light">
            <div className="flex flex-col items-center gap-3 py-4">
              <p className="text-sm ide-text-muted">No themes found in your store.</p>
              <p className="text-xs ide-text-muted">
                You can create a blank project from the IDE instead.
              </p>
            </div>
          </GlassCard>
        )}

        {/* Theme cards */}
        {!isLoading && themes.length > 0 && (
          <AnimatePresence>
            {/* ── Live theme (highlighted) ──────────────────────────── */}
            {liveTheme && (
              <motion.div
                key={liveTheme.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <p className="text-[11px] font-medium text-green-400 mb-1.5 text-left px-1">
                  Live on your store
                </p>
                <ThemeCard
                  theme={liveTheme}
                  onClick={() => handleSelectTheme(liveTheme)}
                  variant="live"
                />
              </motion.div>
            )}

            {/* ── Other themes divider ──────────────────────────────── */}
            {liveTheme && otherThemes.length > 0 && (
              <motion.p
                key="divider"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.05 }}
                className="text-[11px] text-stone-500 dark:text-gray-500 text-left px-1 pt-2"
              >
                Other themes
              </motion.p>
            )}

            {/* ── Other theme cards ─────────────────────────────────── */}
            {otherThemes.map((theme, i) => (
              <motion.div
                key={theme.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: (liveTheme ? 1 : 0) * 0.05 + i * 0.05, ease: 'easeOut' }}
              >
                <ThemeCard
                  theme={theme}
                  onClick={() => handleSelectTheme(theme)}
                  variant="default"
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {/* Import error */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400"
          >
            {error}
          </motion.div>
        )}
      </motion.div>

      {/* Skip link */}
      <motion.button
        type="button"
        onClick={onSkip}
        className="mt-8 text-xs text-stone-400 dark:text-gray-500 hover:text-stone-600 dark:hover:text-gray-300 transition-colors"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.25 }}
      >
        Skip for now
      </motion.button>

      {/* ── Existing projects quick-nav ─────────────────────────────── */}
      {activeProjects.length > 0 && (
        <motion.div
          className="mt-8 w-full space-y-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <p className="text-[11px] text-stone-500 dark:text-gray-500 text-left px-1">
            Or open an existing project:
          </p>
          {activeProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => router.push(`/projects/${project.id}`)}
              aria-label={`Open project: ${project.name}`}
              className="w-full text-left p-3 rounded-xl bg-stone-100/50 dark:bg-white/[0.03] border border-stone-200 dark:border-white/10 hover:border-emerald-500/30 hover:bg-stone-100 dark:hover:bg-white/[0.05] transition-all"
            >
              <span className="block text-sm font-medium text-stone-900 dark:text-white">{project.name}</span>
              {project.shopify_theme_name && (
                <span className="block text-xs text-stone-500 dark:text-gray-500 mt-0.5">{project.shopify_theme_name}</span>
              )}
            </button>
          ))}
        </motion.div>
      )}

      {/* ── Archived projects (collapsible) ─────────────────────────── */}
      {archivedProjects.length > 0 && (
        <motion.div
          className="mt-6 w-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.35 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="h-px flex-1 bg-stone-200 dark:bg-white/10" />
            <span className="text-[11px] text-stone-500 dark:text-gray-500 whitespace-nowrap">Archived Themes</span>
            <div className="h-px flex-1 bg-stone-200 dark:bg-white/10" />
          </div>
          <div className="space-y-1.5">
            {archivedProjects.map((project) => (
              <ArchivedRow
                key={project.id}
                project={project}
                onRestore={handleRestore}
                onDelete={handleDelete}
                busy={busyIds.has(project.id)}
              />
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
