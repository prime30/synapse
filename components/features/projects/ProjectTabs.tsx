'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useProjects, type Project } from '@/hooks/useProjects';

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
  const { projects } = useProjects();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [openIds, setOpenIds] = useState<string[]>(() => {
    const stored = getOpenProjectIds();
    // Always include the current project
    if (!stored.includes(currentProjectId)) {
      return [currentProjectId, ...stored];
    }
    return stored;
  });

  // Ensure current project is always in the open list
  useEffect(() => {
    setOpenIds((prev) => {
      // #region agent log H3
      fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'reload-stuck-run1',hypothesisId:'H3',location:'components/features/projects/ProjectTabs.tsx:52',message:'ensure-current-project effect running',data:{currentProjectId,prevCount:prev.length,hasCurrent:prev.includes(currentProjectId)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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

  // Build tab data: only show projects that exist in the fetched list
  const tabs = useMemo(() => {
    if (projects.length === 0) {
      // Projects haven't loaded yet — show current project ID as placeholder
      return openIds.map((id) => ({ id, name: id === currentProjectId ? 'Loading...' : id }));
    }
    const projectMap = new Map(projects.map((p) => [p.id, p]));
    return openIds
      .filter((id) => projectMap.has(id))
      .map((id) => ({ id, name: projectMap.get(id)!.name }));
  }, [openIds, projects, currentProjectId]);

  useEffect(() => {
    // #region agent log H3
    fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'reload-stuck-run1',hypothesisId:'H3',location:'components/features/projects/ProjectTabs.tsx:78',message:'project tabs snapshot',data:{currentProjectId,openIdsCount:openIds.length,projectsCount:projects.length,tabsCount:tabs.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [currentProjectId, openIds.length, projects.length, tabs.length]);

  const handleClose = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const next = openIds.filter((oid) => oid !== id);
      setOpenIds(next);

      // If closing the active tab, switch to the nearest remaining tab
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
              {/* Close button — always visible on active, on hover for others */}
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

      {/* New project button */}
      <button
        type="button"
        onClick={onCreateProject}
        className="flex items-center justify-center w-7 h-7 shrink-0 ml-0.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 rounded transition-colors"
        aria-label="New project"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M6 1v10M1 6h10" />
        </svg>
      </button>
    </div>
  );
}
