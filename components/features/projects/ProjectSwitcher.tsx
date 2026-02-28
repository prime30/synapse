'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useProjects, type Project } from '@/hooks/useProjects';
import { LambdaDots } from '@/components/ui/LambdaDots';

export interface ProjectSwitcherProps {
  currentProjectId: string;
  currentProjectName?: string;
  onSwitchProject: (projectId: string) => void;
  onImportTheme: () => void;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/** Simple relative-time formatter (no library needed). */
function relativeTime(dateString: string | undefined | null): string {
  if (!dateString) return '';
  const now = Date.now();
  const diff = now - new Date(dateString).getTime();
  if (diff < 0) return 'just now';
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Build a subtitle string from theme name + relative time. */
function subtitle(project: Project): string {
  const parts: string[] = [];
  if (project.shopify_theme_name) parts.push(project.shopify_theme_name);
  const rt = relativeTime(project.updated_at);
  if (rt) parts.push(rt);
  return parts.join(' · ');
}

/* ── Component ────────────────────────────────────────────────────────────── */

export function ProjectSwitcher({
  currentProjectId,
  currentProjectName,
  onSwitchProject,
  onImportTheme,
}: ProjectSwitcherProps) {
  const {
    activeProjects,
    archivedProjects,
    isLoading,
    restoreProject,
    deleteProject,
  } = useProjects();

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Display name for trigger button
  const displayName = useMemo(() => {
    if (currentProjectName) return currentProjectName;
    const match = [...activeProjects, ...archivedProjects].find(
      (p) => p.id === currentProjectId
    );
    return match?.name ?? 'Select Project';
  }, [currentProjectName, currentProjectId, activeProjects, archivedProjects]);

  // Expand archived section if user's current project is archived
  const isCurrentArchived = useMemo(
    () => archivedProjects.some((p) => p.id === currentProjectId),
    [archivedProjects, currentProjectId]
  );

  useEffect(() => {
    if (isCurrentArchived) setArchivedExpanded(true);
  }, [isCurrentArchived]);

  // Filter projects by search (case-insensitive)
  const q = search.toLowerCase().trim();
  const filteredActive = useMemo(
    () =>
      q
        ? activeProjects.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              (p.shopify_theme_name ?? '').toLowerCase().includes(q)
          )
        : activeProjects,
    [activeProjects, q]
  );

  const filteredArchived = useMemo(
    () =>
      q
        ? archivedProjects.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              (p.shopify_theme_name ?? '').toLowerCase().includes(q)
          )
        : archivedProjects,
    [archivedProjects, q]
  );

  // ── Event handlers ──────────────────────────────────────────────────────

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
        setConfirmDeleteId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Auto-focus search on open
  useEffect(() => {
    if (isOpen) requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [isOpen]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setSearch('');
        setConfirmDeleteId(null);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  function handleSelect(project: Project) {
    if (project.id !== currentProjectId) onSwitchProject(project.id);
    setIsOpen(false);
    setSearch('');
  }

  function handleImport() {
    onImportTheme();
    setIsOpen(false);
    setSearch('');
  }

  const handleRestore = useCallback(
    async (projectId: string) => {
      setBusyIds((prev) => new Set(prev).add(projectId));
      try {
        await restoreProject(projectId);
        // Trigger background dev theme push (same deferred pattern as import)
        fetch(`/api/projects/${projectId}/sync-dev-theme`, { method: 'POST' }).catch(() => {});
      } catch (err) {
        console.error('Restore failed', err);
      } finally {
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(projectId);
          return next;
        });
      }
    },
    [restoreProject]
  );

  const handleDelete = useCallback(
    async (projectId: string) => {
      setBusyIds((prev) => new Set(prev).add(projectId));
      setConfirmDeleteId(null);
      try {
        await deleteProject(projectId);
      } catch (err) {
        console.error('Delete failed', err);
      } finally {
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(projectId);
          return next;
        });
      }
    },
    [deleteProject]
  );

  const handleRestoreAll = useCallback(async () => {
    for (const p of archivedProjects) {
      await handleRestore(p.id);
    }
  }, [archivedProjects, handleRestore]);

  return (
    <div ref={containerRef} className="relative">
      {/* ── Trigger button ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded ide-surface-input border ide-border ide-text ide-hover transition-colors max-w-[200px]"
      >
        <span className="truncate">{displayName}</span>
        <ChevronIcon open={isOpen} />
      </button>

      {/* ── Dropdown popover ───────────────────────────────────────────── */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-lg border ide-border ide-surface-pop shadow-xl shadow-black/40 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b ide-border">
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full px-3 py-1.5 text-sm rounded ide-surface-input border ide-border ide-text placeholder-stone-400 dark:placeholder-white/40 focus:outline-none focus:border-sky-500 dark:focus:border-sky-400 transition-colors"
            />
          </div>

          {/* ── Active Projects ───────────────────────────────────────── */}
          <div className="max-h-60 overflow-y-auto">
            {isLoading ? (
              <LoadingSkeleton />
            ) : filteredActive.length === 0 && filteredArchived.length === 0 ? (
              <EmptyState hasSearch={q.length > 0} />
            ) : (
              <ul role="listbox" className="py-1">
                {filteredActive.map((project) => (
                  <li
                    key={project.id}
                    role="option"
                    aria-selected={project.id === currentProjectId}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelect(project)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        project.id === currentProjectId
                          ? 'ide-active text-sky-500 dark:text-sky-400'
                          : 'ide-text ide-hover'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="block truncate font-medium flex-1">
                          {project.name}
                        </span>
                        {project.id === currentProjectId && (
                          <span className="text-[10px] text-sky-500 dark:text-sky-400 opacity-60 shrink-0">
                            curr
                          </span>
                        )}
                      </span>
                      {subtitle(project) && (
                        <span className="block truncate text-xs ide-text-muted mt-0.5">
                          {subtitle(project)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Archived Section ──────────────────────────────────────── */}
          {filteredArchived.length > 0 && (
            <div className="border-t ide-border">
              {/* Collapsible header */}
              <button
                type="button"
                onClick={() => setArchivedExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs ide-text-muted ide-hover transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`w-3.5 h-3.5 transition-transform duration-150 ${
                      archivedExpanded ? 'rotate-90' : ''
                    }`}
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Archived ({filteredArchived.length})
                </span>
                {archivedExpanded && archivedProjects.length >= 2 && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRestoreAll();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        handleRestoreAll();
                      }
                    }}
                    className="text-[10px] text-sky-500 dark:text-sky-400 hover:text-sky-400 dark:hover:text-sky-300 cursor-pointer"
                  >
                    Restore All
                  </span>
                )}
              </button>

              {/* Archived rows */}
              {archivedExpanded && (
                <ul className="pb-1">
                  {filteredArchived.map((project) => {
                    const busy = busyIds.has(project.id);
                    const isConfirming = confirmDeleteId === project.id;
                    const isHovered = hoveredRowId === project.id;

                    return (
                      <li
                        key={project.id}
                        className="px-3 py-2 text-sm"
                        onMouseEnter={() => setHoveredRowId(project.id)}
                        onMouseLeave={() => {
                          setHoveredRowId(null);
                          if (isConfirming) setConfirmDeleteId(null);
                        }}
                      >
                        {isConfirming ? (
                          // Inline delete confirmation
                          <div className="flex items-center justify-between">
                            <span className="text-xs ide-text-muted">
                              Delete permanently?
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDelete(project.id)}
                                className="text-xs font-medium text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-900/20 transition-colors"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-xs ide-text-muted hover:ide-text px-1.5 py-0.5 rounded ide-hover transition-colors"
                              >
                                No
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate ide-text-muted font-medium">
                              {project.name}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {busy ? (
                                <Spinner />
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleRestore(project.id)}
                                    disabled={busyIds.size > 0}
                                    className="text-xs bg-sky-600 hover:bg-sky-500 text-white rounded px-2 py-0.5 transition-colors disabled:opacity-50"
                                  >
                                    Sync
                                  </button>
                                  {isHovered && (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(project.id)}
                                      disabled={busyIds.size > 0}
                                      className="text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded px-2 py-0.5 transition-colors disabled:opacity-50"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Import action */}
          <div className="border-t ide-border p-1">
            <button
              type="button"
              onClick={handleImport}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sky-500 dark:text-sky-400 ide-hover hover:text-sky-400 dark:hover:text-sky-300 rounded transition-colors"
            >
              <span className="text-base leading-none">+</span>
              <span>Import New Theme</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`w-4 h-4 shrink-0 ide-text-muted transition-transform duration-150 ${
        open ? 'rotate-180' : ''
      }`}
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function Spinner() {
  return <LambdaDots size={16} />;
}

function LoadingSkeleton() {
  return (
    <div className="p-3 space-y-2 animate-pulse">
      <div className="h-4 ide-surface-inset rounded w-3/4" />
      <div className="h-4 ide-surface-inset rounded w-1/2" />
      <div className="h-4 ide-surface-inset rounded w-2/3" />
    </div>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="px-3 py-6 text-center">
      <p className="text-sm ide-text-muted">
        {hasSearch
          ? 'No projects match your search'
          : 'No saved projects \u2014 Import a theme to get started'}
      </p>
    </div>
  );
}
