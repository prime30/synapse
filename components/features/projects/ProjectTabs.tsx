'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useProjects, type Project } from '@/hooks/useProjects';
import { useActiveStore } from '@/hooks/useActiveStore';

const OPEN_PROJECTS_KEY = 'synapse-open-projects';

function getOpenProjectIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(OPEN_PROJECTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function setOpenProjectIds(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(OPEN_PROJECTS_KEY, JSON.stringify(ids));
  } catch {
    // Ignore storage errors
  }
}

export interface ProjectTabsProps {
  currentProjectId: string;
  onSwitchProject: (projectId: string) => void;
  onCreateProject: () => void;
}

export function ProjectTabs({
  currentProjectId,
  onSwitchProject,
  onCreateProject,
}: ProjectTabsProps) {
  // Filter projects by active store connection
  const { connection } = useActiveStore();
  const { projects } = useProjects(connection?.id ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [openIds, setOpenIds] = useState<string[]>(() => {
    const stored = getOpenProjectIds();
    if (!stored.includes(currentProjectId)) {
      return [currentProjectId, ...stored];
    }
    return stored;
  });

  // Ensure current project is always in the open list
  useEffect(() => {
    setOpenIds((prev) => {
      if (prev.includes(currentProjectId)) return prev;
      const next = [...prev, currentProjectId];
      setOpenProjectIds(next);
      return next;
    });
  }, [currentProjectId]);

  // Persist to localStorage when openIds change
  useEffect(() => {
    setOpenProjectIds(openIds);
  }, [openIds]);

  // Build tab data: only show projects that exist in the fetched (store-filtered) list
  const tabs = useMemo(() => {
    if (projects.length === 0) {
      return openIds.map((id) => ({ id, name: id === currentProjectId ? 'Loading...' : id }));
    }
    const projectMap = new Map(projects.map((p) => [p.id, p]));
    return openIds
      .filter((id) => projectMap.has(id))
      .map((id) => ({ id, name: projectMap.get(id)!.name }));
  }, [openIds, projects, currentProjectId]);

  const handleClose = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const next = openIds.filter((oid) => oid !== id);
      setOpenIds(next);

      if (id === currentProjectId && next.length > 0) {
        const closedIndex = openIds.indexOf(id);
        const newIndex = Math.min(closedIndex, next.length - 1);
        onSwitchProject(next[newIndex]);
      }
    },
    [openIds, currentProjectId, onSwitchProject]
  );

  // Scroll active tab into view
  useEffect(() => {
    if (!scrollRef.current) return;
    const activeEl = scrollRef.current.querySelector('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [currentProjectId]);

  return (
    <div className="flex items-center min-w-0 flex-1">
      {/* Store domain breadcrumb */}
      {connection && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 shrink-0 border-r border-gray-700/50">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-[11px] text-gray-500 font-mono truncate max-w-[120px]">
            {connection.store_domain.replace('.myshopify.com', '')}
          </span>
          <svg width="6" height="10" viewBox="0 0 6 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-gray-600">
            <path d="M1 1l4 4-4 4" />
          </svg>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex items-center gap-0 overflow-x-auto scrollbar-none min-w-0"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === currentProjectId;
          return (
            <button
              key={tab.id}
              type="button"
              data-active={isActive}
              onClick={() => {
                if (!isActive) onSwitchProject(tab.id);
              }}
              className={`group flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium border-r border-gray-700/50 whitespace-nowrap shrink-0 transition-colors ${
                isActive
                  ? 'bg-gray-800/60 text-gray-200 border-b-2 border-b-blue-500'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
              }`}
            >
              <span className="truncate max-w-[140px]">{tab.name}</span>
              {tabs.length > 1 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => handleClose(tab.id, e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleClose(tab.id, e as unknown as React.MouseEvent);
                  }}
                  className={`w-4 h-4 flex items-center justify-center rounded-sm hover:bg-gray-600/50 transition-colors ${
                    isActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-70'
                  }`}
                  aria-label={`Close ${tab.name}`}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M1 1l6 6M7 1l-6 6" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Import theme button (replaces "new project") */}
      <button
        type="button"
        onClick={onCreateProject}
        className="flex items-center justify-center w-7 h-7 shrink-0 ml-0.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 rounded transition-colors"
        aria-label="Import theme"
        title="Import theme"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M6 1v10M1 6h10" />
        </svg>
      </button>
    </div>
  );
}
