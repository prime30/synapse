'use client';

import { useState, useEffect, useMemo } from 'react';
import { parseSchemaFromContent } from '@/lib/liquid/schema-parser';
import { SymbolExtractor } from '@/lib/context/symbol-extractor';
import { useVersionHistory } from '@/hooks/useVersionHistory';
import { useFileDependencies } from '@/hooks/useDependencyGraph';

// ── Types ──────────────────────────────────────────────────────────────

interface ExplorerContextSectionsProps {
  projectId: string;
  activeFileId: string | null;
  activeFileContent: string | null;
  activeFilePath: string | null;
  activeFileType: string | null;
}

type SectionId = 'outline' | 'timeline' | 'references' | 'dependencies';

const STORAGE_KEY = 'synapse-explorer-sections';

const CHEVRON_PROPS = {
  width: 10,
  height: 10,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const symbolExtractor = new SymbolExtractor();

// ── Helpers ────────────────────────────────────────────────────────────

function getInitialCollapsed(): Set<SectionId> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return new Set(JSON.parse(stored) as SectionId[]);
  } catch {
    // ignore
  }
  return new Set();
}

function persistCollapsed(set: Set<SectionId>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Section Header ─────────────────────────────────────────────────────

function SectionHeader({
  id,
  label,
  count,
  isOpen,
  onToggle,
}: {
  id: SectionId;
  label: string;
  count?: number;
  isOpen: boolean;
  onToggle: (id: SectionId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      className="w-full flex items-center gap-2 px-2 py-1.5 text-left ide-hover rounded transition-colors border-t ide-border-subtle"
    >
      <span
        className="flex-shrink-0 ide-text-muted transition-transform"
        style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
      >
        <svg {...CHEVRON_PROPS}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-wider ide-text-3">
        {label}
      </span>
      {count !== undefined && (
        <span className="ml-auto text-[11px] ide-text-3 tabular-nums">{count}</span>
      )}
    </button>
  );
}

// ── Outline Section ────────────────────────────────────────────────────

function OutlineContent({
  content,
  fileType,
}: {
  content: string | null;
  fileType: string | null;
}) {
  const items = useMemo(() => {
    if (!content || !fileType) return null;

    // Liquid files: try schema first, fall back to includes
    if (fileType === 'liquid') {
      const schema = parseSchemaFromContent(content);
      if (schema) {
        const entries: { label: string; kind: string }[] = [];
        entries.push({ label: schema.name, kind: 'name' });
        for (const s of schema.settings) {
          entries.push({ label: s.id, kind: 'setting' });
        }
        for (const b of schema.blocks) {
          entries.push({ label: b.name || b.type, kind: 'block' });
        }
        return entries;
      }
      // Fall back to liquid includes
      const includes = symbolExtractor.extractLiquidIncludes(content);
      if (includes.length > 0) {
        return includes.map((name) => ({ label: name, kind: 'snippet' }));
      }
      return null;
    }

    if (fileType === 'css') {
      const classes = symbolExtractor.extractCssClasses(content);
      if (classes.length > 0) {
        return classes.map((cls) => ({ label: `.${cls}`, kind: 'class' }));
      }
      return null;
    }

    if (fileType === 'javascript') {
      const funcs = symbolExtractor.extractJsFunctions(content);
      if (funcs.length > 0) {
        return funcs.map((fn) => ({ label: `${fn}()`, kind: 'function' }));
      }
      return null;
    }

    return null;
  }, [content, fileType]);

  if (!content) {
    return (
      <div className="px-3 py-2">
        <div className="h-3 w-24 ide-surface-inset rounded animate-pulse" />
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <p className="px-3 py-2 text-xs ide-text-muted">No outline available</p>
    );
  }

  return (
    <div className="max-h-[200px] overflow-y-auto">
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`} className="flex items-center gap-2 px-3 py-1">
          <span className="text-[10px] ide-text-3 font-mono w-14 text-right flex-shrink-0">
            {item.kind}
          </span>
          <span className="text-xs ide-text truncate">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Timeline Section ───────────────────────────────────────────────────

function TimelineContent({ fileId }: { fileId: string | null }) {
  const { versions, isLoading } = useVersionHistory(fileId);

  if (!fileId) {
    return <p className="px-3 py-2 text-xs ide-text-muted">Select a file to view</p>;
  }

  if (isLoading) {
    return (
      <div className="px-3 py-2 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-3 ide-surface-inset rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (versions.length === 0) {
    return <p className="px-3 py-2 text-xs ide-text-muted">No version history</p>;
  }

  const recent = versions.slice(0, 5);

  return (
    <div className="max-h-[200px] overflow-y-auto">
      {recent.map((v) => (
        <div key={v.id} className="flex items-start gap-2 px-3 py-1.5">
          <span className="text-[10px] ide-text-3 tabular-nums flex-shrink-0 pt-0.5">
            v{v.version_number}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs ide-text truncate">
              {v.change_summary || 'No description'}
            </p>
            <p className="text-[10px] ide-text-muted">
              {formatRelativeTime(v.created_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── References Section ("where is this file used") ─────────────────────

function ReferencesContent({
  filePath,
}: {
  filePath: string | null;
}) {
  // Without server-side dependency graph, we show a message
  // This can be enhanced once GET /api/projects/[projectId]/dependencies exists
  if (!filePath) {
    return <p className="px-3 py-2 text-xs ide-text-muted">Select a file to view</p>;
  }

  return (
    <p className="px-3 py-2 text-xs ide-text-muted">
      Reference tracking requires full project analysis
    </p>
  );
}

// ── Dependencies Section ("what does this file reference") ─────────────

function DependenciesContent({
  content,
  fileType,
}: {
  content: string | null;
  fileType: string | null;
}) {
  const deps = useFileDependencies(fileType === 'liquid' ? content : null);

  const allDeps = useMemo(() => {
    const entries: { path: string; type: string }[] = [];
    for (const r of deps.renders) entries.push({ path: r, type: 'render' });
    for (const r of deps.includes) entries.push({ path: r, type: 'include' });
    for (const s of deps.sections) entries.push({ path: s, type: 'section' });
    for (const a of deps.assets) entries.push({ path: a, type: 'asset' });
    return entries;
  }, [deps]);

  if (!content) {
    return <p className="px-3 py-2 text-xs ide-text-muted">Select a file to view</p>;
  }

  if (fileType !== 'liquid') {
    return <p className="px-3 py-2 text-xs ide-text-muted">Dependency tracking available for Liquid files</p>;
  }

  if (allDeps.length === 0) {
    return <p className="px-3 py-2 text-xs ide-text-muted">No dependencies</p>;
  }

  return (
    <div className="max-h-[200px] overflow-y-auto">
      {allDeps.map((dep, i) => (
        <div key={`${dep.path}-${i}`} className="flex items-center gap-2 px-3 py-1">
          <span className="text-[10px] ide-text-3 font-mono w-14 text-right flex-shrink-0">
            {dep.type}
          </span>
          <span className="text-xs ide-text truncate">{dep.path}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

export function ExplorerContextSections({
  activeFileId,
  activeFileContent,
  activeFilePath,
  activeFileType,
}: ExplorerContextSectionsProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<SectionId>>(getInitialCollapsed);

  useEffect(() => {
    persistCollapsed(collapsedSections);
  }, [collapsedSections]);

  const toggleSection = (id: SectionId) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isOpen = (id: SectionId) => !collapsedSections.has(id);

  const noFile = !activeFileId;

  return (
    <div className="shrink-0">
      {/* Outline */}
      <SectionHeader
        id="outline"
        label="Outline"
        isOpen={isOpen('outline')}
        onToggle={toggleSection}
      />
      {isOpen('outline') && (
        noFile ? (
          <p className="px-3 py-2 text-xs ide-text-muted">Select a file to view</p>
        ) : (
          <OutlineContent content={activeFileContent} fileType={activeFileType} />
        )
      )}

      {/* Timeline */}
      <SectionHeader
        id="timeline"
        label="Timeline"
        isOpen={isOpen('timeline')}
        onToggle={toggleSection}
      />
      {isOpen('timeline') && (
        <TimelineContent fileId={activeFileId} />
      )}

      {/* References */}
      <SectionHeader
        id="references"
        label="References"
        isOpen={isOpen('references')}
        onToggle={toggleSection}
      />
      {isOpen('references') && (
        <ReferencesContent filePath={activeFilePath} />
      )}

      {/* Dependencies */}
      <SectionHeader
        id="dependencies"
        label="Dependencies"
        isOpen={isOpen('dependencies')}
        onToggle={toggleSection}
      />
      {isOpen('dependencies') && (
        <DependenciesContent content={activeFileContent} fileType={activeFileType} />
      )}
    </div>
  );
}
