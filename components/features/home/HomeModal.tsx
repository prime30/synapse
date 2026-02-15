'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  X,
  ChevronDown,
  ChevronRight,
  ShoppingBag,
  GitBranch,
  FolderOpen,
  SortAsc,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useProjects } from '@/hooks/useProjects';
import { useActiveStore } from '@/hooks/useActiveStore';
import { useThumbnails } from '@/hooks/useThumbnails';
import { ProjectCard, NewProjectCard } from './ProjectCard';
import { FeatureBanner } from './FeatureBanner';
import { GitImportModal } from './GitImportModal';
import { FolderImportModal } from './FolderImportModal';
import { ImportThemeModal } from '@/components/features/file-management/ImportThemeModal';

const SORT_KEY = 'home-sort';
type SortMode = 'recent' | 'name' | 'created';

function getSavedSort(): SortMode {
  if (typeof window === 'undefined') return 'recent';
  return (localStorage.getItem(SORT_KEY) as SortMode) || 'recent';
}

interface HomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  isFullPage?: boolean;
  currentProjectId?: string;
  onSelectProject: (projectId: string) => void;
  onImportSuccess: (projectId: string) => void;
}

export function HomeModal({
  isOpen,
  onClose,
  isFullPage = false,
  currentProjectId,
  onSelectProject,
  onImportSuccess,
}: HomeModalProps) {
  const queryClient = useQueryClient();
  const {
    activeProjects,
    archivedProjects,
    isLoading,
    deleteProject,
    restoreProject,
    renameProject,
  } = useProjects();

  const { connection } = useActiveStore();
  const { thumbnailUrls, generatingIds, regenerate } = useThumbnails(activeProjects);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>(getSavedSort);
  const [showArchived, setShowArchived] = useState(false);
  const [showGitImport, setShowGitImport] = useState(false);
  const [showFolderImport, setShowFolderImport] = useState(false);
  const [showImportTheme, setShowImportTheme] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  // Persist sort preference
  useEffect(() => {
    try {
      localStorage.setItem(SORT_KEY, sort);
    } catch {
      /* ignore */
    }
  }, [sort]);

  // Auto-focus search on open
  const prevIsOpen = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
    prevIsOpen.current = isOpen;
  }, [isOpen]);

  // Reset search when modal closes (using a callback ref pattern)
  const handleClose = useCallback(() => {
    setSearch('');
    onClose();
  }, [onClose]);

  // Close sort menu on outside click
  useEffect(() => {
    if (!showSortMenu) return;
    function handleClick(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSortMenu]);

  // Keyboard: Escape closes modal
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !showGitImport && !showFolderImport && !showImportTheme) {
        handleClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose, showGitImport, showFolderImport, showImportTheme]);

  // Archive handler
  const handleArchive = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/projects/${id}/archive`, { method: 'POST' });
        queryClient.invalidateQueries({ queryKey: ['projects'] });
      } catch {
        /* ignore */
      }
    },
    [queryClient]
  );

  // Filter and sort
  const filteredProjects = useMemo(() => {
    let list = activeProjects;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.shopify_theme_name && p.shopify_theme_name.toLowerCase().includes(q))
      );
    }
    const sorted = [...list];
    switch (sort) {
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'created':
        sorted.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        break;
      case 'recent':
      default:
        sorted.sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
    }
    return sorted;
  }, [activeProjects, search, sort]);

  const filteredArchived = useMemo(() => {
    if (!search.trim()) return archivedProjects;
    const q = search.toLowerCase();
    return archivedProjects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.shopify_theme_name && p.shopify_theme_name.toLowerCase().includes(q))
    );
  }, [archivedProjects, search]);

  const handleImportSuccess = useCallback(
    (projectId: string) => {
      setShowGitImport(false);
      setShowFolderImport(false);
      setShowImportTheme(false);
      onImportSuccess(projectId);
    },
    [onImportSuccess]
  );

  if (!isOpen) return null;

  const hasProjects = activeProjects.length > 0 || archivedProjects.length > 0;

  const content = (
    <div
      className={`flex flex-col ${
        isFullPage
          ? 'min-h-screen p-6'
          : 'w-[95vw] max-w-7xl h-[90vh] mx-auto my-[5vh]'
      } bg-gray-950 rounded-xl border border-gray-800 overflow-hidden`}
    >
      {/* Feature Banner */}
      <FeatureBanner />

      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-800 shrink-0">
        <h1 className="text-xl font-semibold text-white">Projects</h1>
        {activeProjects.length > 0 && (
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-800 text-gray-400">
            {activeProjects.length}
          </span>
        )}

        {/* Search */}
        <div className="flex-1 max-w-xs ml-4">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md bg-gray-900 border border-gray-700 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-sky-500/50"
            />
          </div>
        </div>

        {/* Sort */}
        <div ref={sortRef} className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <SortAsc size={14} />
            {sort === 'recent' ? 'Recent' : sort === 'name' ? 'Name' : 'Created'}
          </button>
          {showSortMenu && (
            <div className="absolute right-0 top-full mt-1 w-36 py-1 rounded-lg bg-gray-900 border border-gray-700 shadow-xl z-20">
              {(['recent', 'name', 'created'] as SortMode[]).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSort(s);
                    setShowSortMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                    sort === s
                      ? 'text-sky-400 bg-sky-500/10'
                      : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  {s === 'recent'
                    ? 'Recently Modified'
                    : s === 'name'
                      ? 'Name (A-Z)'
                      : 'Date Created'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Close button */}
        {!isFullPage && (
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md hover:bg-gray-800 text-gray-400 hover:text-white transition-colors ml-2"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg bg-gray-900 border border-gray-800 overflow-hidden"
              >
                <div className="aspect-[16/10] bg-gray-800 animate-pulse" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-gray-800 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-gray-800 rounded animate-pulse w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : !hasProjects ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold text-white">Welcome to Synapse</h2>
              <p className="text-gray-400">Import a Shopify theme to get started</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
              <button
                onClick={() => (connection ? setShowImportTheme(true) : undefined)}
                disabled={!connection}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border border-gray-700 hover:border-sky-500/40 bg-gray-900/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
              >
                <ShoppingBag
                  size={32}
                  className="text-green-400 group-hover:scale-110 transition-transform"
                />
                <span className="text-sm font-medium text-gray-200">
                  Import from Shopify
                </span>
                {!connection && (
                  <span className="text-xs text-gray-500">Connect a store first</span>
                )}
              </button>
              <button
                onClick={() => setShowGitImport(true)}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border border-gray-700 hover:border-sky-500/40 bg-gray-900/50 transition-all group"
              >
                <GitBranch
                  size={32}
                  className="text-sky-400 group-hover:scale-110 transition-transform"
                />
                <span className="text-sm font-medium text-gray-200">Clone from Git</span>
              </button>
              <button
                onClick={() => setShowFolderImport(true)}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border border-gray-700 hover:border-sky-500/40 bg-gray-900/50 transition-all group"
              >
                <FolderOpen
                  size={32}
                  className="text-amber-400 group-hover:scale-110 transition-transform"
                />
                <span className="text-sm font-medium text-gray-200">
                  Open Local Folder
                </span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Project grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isActive={project.id === currentProjectId}
                  thumbnailUrl={
                    thumbnailUrls[project.id] || project.thumbnail_url || null
                  }
                  isGeneratingThumbnail={generatingIds.has(project.id)}
                  onSelect={onSelectProject}
                  onArchive={handleArchive}
                  onDelete={(id) => deleteProject(id)}
                  onRename={(id, name) => renameProject(id, name)}
                  onRegenerateThumbnail={regenerate}
                />
              ))}
              <NewProjectCard
                onClick={() =>
                  connection ? setShowImportTheme(true) : setShowFolderImport(true)
                }
              />
            </div>

            {/* No search results */}
            {filteredProjects.length === 0 && search.trim() && (
              <p className="text-center text-gray-500 py-8">
                No projects matching &ldquo;{search}&rdquo;
              </p>
            )}

            {/* Archived section */}
            {archivedProjects.length > 0 && (
              <div className="mt-8">
                <button
                  onClick={() => setShowArchived(!showArchived)}
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-3"
                >
                  {showArchived ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  Archived ({archivedProjects.length})
                </button>
                {showArchived && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 opacity-60">
                    {filteredArchived.map((project) => (
                      <div key={project.id} className="relative">
                        <ProjectCard
                          project={project}
                          isActive={false}
                          thumbnailUrl={
                            thumbnailUrls[project.id] || project.thumbnail_url || null
                          }
                          isGeneratingThumbnail={false}
                          onSelect={() => {}}
                          onArchive={() => {}}
                          onDelete={(id) => deleteProject(id)}
                          onRename={() => {}}
                          onRegenerateThumbnail={() => {}}
                        />
                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 rounded-lg opacity-0 hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => restoreProject(project.id)}
                            className="px-3 py-1.5 text-xs font-medium rounded bg-sky-500 text-white hover:bg-sky-600 transition-colors"
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => deleteProject(project.id)}
                            className="px-3 py-1.5 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom import bar */}
      {hasProjects && (
        <div className="shrink-0 px-6 py-3 border-t border-gray-800 flex items-center gap-2">
          <button
            onClick={() => (connection ? setShowImportTheme(true) : undefined)}
            disabled={!connection}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-gray-300 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={!connection ? 'Connect a Shopify store first' : 'Import from Shopify'}
          >
            <ShoppingBag size={14} />
            Import from Shopify
          </button>
          <button
            onClick={() => setShowGitImport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <GitBranch size={14} />
            Clone from Git
          </button>
          <button
            onClick={() => setShowFolderImport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <FolderOpen size={14} />
            Open Local Folder
          </button>
        </div>
      )}

      {/* Sub-modals */}
      <GitImportModal
        isOpen={showGitImport}
        onClose={() => setShowGitImport(false)}
        onImportSuccess={handleImportSuccess}
      />
      <FolderImportModal
        isOpen={showFolderImport}
        onClose={() => setShowFolderImport(false)}
        onImportSuccess={handleImportSuccess}
      />
      {showImportTheme && (
        <ImportThemeModal
          isOpen={showImportTheme}
          onClose={() => setShowImportTheme(false)}
          onImportSuccess={() => handleImportSuccess('')}
        />
      )}
    </div>
  );

  if (isFullPage) return content;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            {content}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
