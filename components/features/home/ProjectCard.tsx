'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MoreVertical, Pencil, Archive, Trash2, RefreshCw, Plus } from 'lucide-react';
import type { Project } from '@/hooks/useProjects';

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  main: { label: 'Live', cls: 'bg-green-500/20 text-green-400 border-green-500/40' },
  development: { label: 'Dev', cls: 'bg-sky-500/20 text-sky-400 border-sky-500/40' },
  demo: { label: 'Demo', cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  unpublished: {
    label: 'Unpublished',
    cls: 'bg-stone-500/20 text-gray-400 border-stone-500/40',
  },
};

// Suppress unused variable lint -- ROLE_BADGE is available for future use
void ROLE_BADGE;

function relativeTime(iso: string): string {
  const sec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (sec < 60) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getInitials(name: string): string {
  return name
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

interface ProjectCardProps {
  project: Project;
  isActive: boolean;
  thumbnailUrl: string | null;
  isGeneratingThumbnail: boolean;
  onSelect: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onRegenerateThumbnail: (id: string) => void;
}

export const ProjectCard = React.memo(function ProjectCard({
  project,
  isActive,
  thumbnailUrl,
  isGeneratingThumbnail,
  onSelect,
  onArchive,
  onDelete,
  onRename,
  onRegenerateThumbnail,
}: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (isRenaming) renameRef.current?.focus();
  }, [isRenaming]);

  const handleRenameSubmit = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== project.name) {
      onRename(project.id, trimmed);
    }
    setIsRenaming(false);
  }, [renameValue, project.name, project.id, onRename]);

  return (
    <div
      className={`group relative rounded-lg overflow-hidden border transition-all cursor-pointer bg-gray-900/80 hover:scale-[1.02] ${
        isActive
          ? 'ring-2 ring-sky-500/60 border-sky-500/40'
          : 'border-gray-800 hover:border-sky-500/40'
      }`}
      onClick={() => !isRenaming && onSelect(project.id)}
    >
      {/* Thumbnail */}
      <div className="aspect-[16/10] overflow-hidden bg-gradient-to-br from-gray-800 to-gray-700">
        {isGeneratingThumbnail ? (
          <div className="w-full h-full animate-pulse bg-gray-800" />
        ) : thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={project.name}
            className="object-cover w-full h-full"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-2xl font-bold text-gray-500 select-none">
              {getInitials(project.name)}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-3 py-2.5">
        {isRenaming ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') {
                setIsRenaming(false);
                setRenameValue(project.name);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full text-sm font-medium text-gray-200 bg-transparent border-b border-sky-500 outline-none"
          />
        ) : (
          <p className="text-sm font-medium text-gray-200 truncate">{project.name}</p>
        )}
        <div className="flex items-center gap-1.5 mt-0.5">
          {project.shopify_theme_name && (
            <span className="text-xs text-gray-500 truncate">
              {project.shopify_theme_name}
            </span>
          )}
          {project.shopify_theme_name && <span className="text-xs text-gray-600">&middot;</span>}
          <span className="text-xs text-gray-500 shrink-0">
            {relativeTime(project.updated_at)}
          </span>
        </div>
      </div>

      {/* Kebab menu */}
      <div ref={menuRef} className="absolute top-2 right-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
            setConfirmDelete(false);
          }}
          className="p-1.5 rounded-md bg-black/60 opacity-0 group-hover:opacity-100 hover:bg-black/80 text-gray-300 hover:text-white transition-all"
          aria-label="Project menu"
        >
          <MoreVertical size={14} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-8 w-48 py-1 rounded-lg bg-gray-900 border border-gray-700 shadow-xl z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                setIsRenaming(true);
                setRenameValue(project.name);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <Pencil size={14} /> Rename
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onArchive(project.id);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <Archive size={14} /> Archive
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRegenerateThumbnail(project.id);
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <RefreshCw size={14} /> Regenerate Thumbnail
            </button>
            <div className="my-1 border-t border-gray-700" />
            {confirmDelete ? (
              <div className="px-3 py-2 space-y-2">
                <p className="text-xs text-red-400">Are you sure? This cannot be undone.</p>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      setConfirmDelete(false);
                      onDelete(project.id);
                    }}
                    className="flex-1 px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(false);
                    }}
                    className="flex-1 px-2 py-1 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-gray-800 hover:text-red-300 transition-colors"
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  New Project Card variant                                            */
/* ------------------------------------------------------------------ */

interface NewProjectCardProps {
  onClick: () => void;
}

export function NewProjectCard({ onClick }: NewProjectCardProps) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border-2 border-dashed border-gray-600 hover:border-sky-500/40 bg-gray-900/40 flex flex-col items-center justify-center gap-2 aspect-[16/10] cursor-pointer transition-all hover:scale-[1.02] group min-h-[180px]"
    >
      <Plus
        size={32}
        className="text-gray-500 group-hover:text-sky-400 transition-colors"
      />
      <span className="text-sm text-gray-500 group-hover:text-gray-300 transition-colors">
        New Project
      </span>
    </button>
  );
}
