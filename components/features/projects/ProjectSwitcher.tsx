'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useProjects, type Project } from '@/hooks/useProjects';

export interface ProjectSwitcherProps {
  currentProjectId: string;
  currentProjectName?: string;
  onSwitchProject: (projectId: string) => void;
  onImportTheme: () => void;
}

export function ProjectSwitcher({
  currentProjectId,
  currentProjectName,
  onSwitchProject,
  onImportTheme,
}: ProjectSwitcherProps) {
  const { projects, isLoading } = useProjects();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Resolve display name: prop override, then look up from fetched list, then fallback
  const displayName = useMemo(() => {
    if (currentProjectName) return currentProjectName;
    const match = projects.find((p) => p.id === currentProjectId);
    return match?.name ?? 'Select Project';
  }, [currentProjectName, currentProjectId, projects]);

  // Filter projects by search query (case-insensitive)
  const filtered = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, search]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      // Small delay so the DOM is painted before we focus
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setSearch('');
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  function handleSelect(project: Project) {
    if (project.id !== currentProjectId) {
      onSwitchProject(project.id);
    }
    setIsOpen(false);
    setSearch('');
  }

  function handleImport() {
    onImportTheme();
    setIsOpen(false);
    setSearch('');
  }

  return (
    <div ref={containerRef} className="relative">
      {/* ── Trigger button ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 hover:border-gray-600 transition-colors max-w-[200px]"
      >
        <span className="truncate">{displayName}</span>
        <ChevronIcon open={isOpen} />
      </button>

      {/* ── Dropdown popover ───────────────────────────────────────────── */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-lg border border-gray-700 bg-gray-900 shadow-xl shadow-black/40 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-700">
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full px-3 py-1.5 text-sm rounded bg-gray-800 border border-gray-600 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Project list */}
          <div className="max-h-60 overflow-y-auto">
            {isLoading ? (
              <LoadingSkeleton />
            ) : filtered.length === 0 ? (
              <EmptyState hasSearch={search.trim().length > 0} />
            ) : (
              <ul role="listbox" className="py-1">
                {filtered.map((project) => (
                  <li key={project.id} role="option" aria-selected={project.id === currentProjectId}>
                    <button
                      type="button"
                      onClick={() => handleSelect(project)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        project.id === currentProjectId
                          ? 'bg-blue-600/20 text-blue-400'
                          : 'text-gray-300 hover:bg-gray-800 hover:text-gray-100'
                      }`}
                    >
                      <span className="block truncate font-medium">
                        {project.name}
                      </span>
                      {project.description && (
                        <span className="block truncate text-xs text-gray-500 mt-0.5">
                          {project.description}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Import action */}
          <div className="border-t border-gray-700 p-1">
            <button
              type="button"
              onClick={handleImport}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-400 hover:bg-gray-800 hover:text-blue-300 rounded transition-colors"
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
      className={`w-4 h-4 shrink-0 text-gray-400 transition-transform duration-150 ${
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

function LoadingSkeleton() {
  return (
    <div className="p-3 space-y-2 animate-pulse">
      <div className="h-4 bg-gray-700 rounded w-3/4" />
      <div className="h-4 bg-gray-700 rounded w-1/2" />
      <div className="h-4 bg-gray-700 rounded w-2/3" />
    </div>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="px-3 py-6 text-center">
      <p className="text-sm text-gray-500">
        {hasSearch
          ? 'No projects match your search'
          : 'No saved projects \u2014 Import a theme to get started'}
      </p>
    </div>
  );
}
