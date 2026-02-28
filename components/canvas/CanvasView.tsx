'use client';

/**
 * Top-level spatial canvas view.
 *
 * Lazily loads @xyflow/react (zero bundle cost for non-canvas users).
 * Features: pan/zoom/minimap, directory clustering, AI suggestion nodes,
 * drop zone for ad-hoc file grouping, compact chat input.
 *
 * EPIC 15: Spatial Canvas
 */

import React, {
  Suspense,
  lazy,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';

import type {
  FileContext,
  FileDependency,
} from '@/lib/context/types';
import {
  buildCanvasGraph,
  positionSuggestionNode,
  EDGE_COLORS,
  type CanvasNode,
  type CanvasEdge,
  type AISuggestionNodeData,
  type CanvasFileData,
} from '@/lib/ai/canvas-data-provider';
import type { Node, Edge } from '@xyflow/react';
import { LambdaDots } from '@/components/ui/LambdaDots';

/* ------------------------------------------------------------------ */
/*  Lazy-loaded React Flow core + controls + minimap                   */
/* ------------------------------------------------------------------ */

const ReactFlowInner = lazy(async () => {
  const mod = await import('@xyflow/react');
  // We need to import the CSS here for the canvas to work
  await import('@xyflow/react/dist/style.css');
  return { default: mod.ReactFlow };
});

const MiniMapLazy = lazy(async () => {
  const mod = await import('@xyflow/react');
  return { default: mod.MiniMap };
});

const ControlsLazy = lazy(async () => {
  const mod = await import('@xyflow/react');
  return { default: mod.Controls };
});

const BackgroundLazy = lazy(async () => {
  const mod = await import('@xyflow/react');
  return { default: mod.Background };
});

const ReactFlowProviderLazy = lazy(async () => {
  const mod = await import('@xyflow/react');
  return { default: mod.ReactFlowProvider };
});

/* ------------------------------------------------------------------ */
/*  Lazy-loaded custom nodes + edges                                   */
/* ------------------------------------------------------------------ */

const FileNodeLazy = lazy(() =>
  import('./FileNode').then((mod) => ({ default: mod.FileNode }))
);

const DependencyEdgeLazy = lazy(() =>
  import('./DependencyEdge').then((mod) => ({ default: mod.DependencyEdge }))
);

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface CanvasViewProps {
  files: FileContext[];
  dependencies: FileDependency[];
  activeFileId: string | null;
  modifiedFileIds?: Set<string>;
  diagnosticsCounts?: Map<string, number>;
  /** Callback when user sends a message from the canvas compact chat */
  onCanvasChat?: (message: string, contextFileIds: string[]) => void;
  /** Callback when user clicks a file node (navigate to editor) */
  onFileClick?: (fileId: string) => void;
  /** Files dropped into the drop zone */
  onDropZoneFiles?: (fileIds: string[]) => void;
}

/* ------------------------------------------------------------------ */
/*  AI suggestion stubs (would come from EPIC 12 nudge system)         */
/* ------------------------------------------------------------------ */

function generateMockSuggestions(
  nodes: CanvasNode[]
): AISuggestionNodeData[] {
  // Group nodes by directory
  const dirGroups = new Map<string, CanvasNode[]>();
  for (const node of nodes) {
    const dir = node.data.directory;
    const list = dirGroups.get(dir) ?? [];
    list.push(node);
    dirGroups.set(dir, list);
  }

  const suggestions: AISuggestionNodeData[] = [];

  // Suggest extraction for large clusters
  for (const [dir, group] of dirGroups.entries()) {
    if (group.length >= 3) {
      const fileIds = group.map((n) => n.id);
      const pos = positionSuggestionNode(fileIds, nodes);
      suggestions.push({
        id: `suggest-${dir}`,
        message: `${group.length} files in ${dir}/ — review for shared patterns?`,
        fileIds,
        x: pos.x,
        y: pos.y,
        dismissed: false,
      });
    }
  }

  return suggestions.slice(0, 3); // Cap at 3 suggestions
}

/* ------------------------------------------------------------------ */
/*  SuggestionNode component                                           */
/* ------------------------------------------------------------------ */

function SuggestionNodeInner({ suggestion, onDismiss }: {
  suggestion: AISuggestionNodeData;
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="absolute pointer-events-auto animate-in fade-in duration-300"
      style={{
        left: suggestion.x,
        top: suggestion.y,
        zIndex: 50,
      }}
    >
      <div className="flex items-start gap-2 px-3 py-2 max-w-[240px] rounded-lg ide-surface-pop border ide-border shadow-lg">
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="oklch(0.718 0.174 253)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
        </svg>
        <span className="text-[11px] ide-text leading-tight">
          {suggestion.message}
        </span>
        <button
          type="button"
          onClick={() => onDismiss(suggestion.id)}
          className="shrink-0 w-4 h-4 flex items-center justify-center text-sky-500 dark:text-sky-400 hover:ide-text transition-colors"
          aria-label="Dismiss suggestion"
        >
          <svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

const SuggestionNode = React.memo(SuggestionNodeInner);

/* ------------------------------------------------------------------ */
/*  Drop Zone                                                          */
/* ------------------------------------------------------------------ */

function DropZone({ onDrop }: { onDrop: (fileIds: string[]) => void }) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      try {
        const data = e.dataTransfer.getData('application/synapse-file-ids');
        if (data) {
          const fileIds = JSON.parse(data) as string[];
          onDrop(fileIds);
        }
      } catch {
        // ignore malformed drop data
      }
    },
    [onDrop]
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        absolute bottom-4 left-1/2 -translate-x-1/2 z-40
        px-4 py-2.5 rounded-lg border-2 border-dashed
        text-xs font-medium transition-all duration-200
        ${
          isDragOver
            ? 'border-sky-500 bg-sky-500/10 dark:bg-sky-500/10 text-sky-600 dark:text-sky-300 scale-105'
            : 'ide-border ide-surface-panel ide-text-muted hover:ide-border transition-colors'
        }
      `}
    >
      <div className="flex items-center gap-2">
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Drag files here to create a refactoring context
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Compact Canvas Chat                                                */
/* ------------------------------------------------------------------ */

function CanvasChat({
  selectedFileIds,
  onSend,
}: {
  selectedFileIds: string[];
  onSend: (message: string) => void;
}) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed) return;
      onSend(trimmed);
      setInput('');
    },
    [input, onSend]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="absolute bottom-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-lg ide-surface-pop border ide-border shadow-lg"
    >
      <span className="text-[10px] ide-text-muted shrink-0">
        {selectedFileIds.length > 0
          ? `${selectedFileIds.length} file${selectedFileIds.length > 1 ? 's' : ''}`
          : 'Canvas'}
      </span>
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask about selected files…"
        className="w-64 bg-transparent text-xs ide-text-2 placeholder-ide-text-quiet outline-none"
      />
      <button
        type="submit"
        disabled={!input.trim()}
        className="text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 disabled:ide-text-quiet transition-colors"
        aria-label="Send"
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Legend                                                              */
/* ------------------------------------------------------------------ */

function CanvasLegend() {
  const legendItems: { type: string; color: string; label: string }[] = [
    { type: 'liquid_include', color: EDGE_COLORS.liquid_include, label: 'Liquid include' },
    { type: 'asset_reference', color: EDGE_COLORS.asset_reference, label: 'Asset ref' },
    { type: 'css_import', color: EDGE_COLORS.css_import, label: 'CSS import' },
    { type: 'template_section', color: EDGE_COLORS.template_section, label: 'Section' },
    { type: 'css_class', color: EDGE_COLORS.css_class, label: 'CSS class' },
    { type: 'js_function', color: EDGE_COLORS.js_function, label: 'JS function' },
  ];

  return (
    <div className="absolute top-3 right-3 z-40 flex flex-col gap-1 px-2.5 py-2 rounded-lg ide-surface-pop border ide-border shadow-md">
      <span className="text-[10px] ide-text-3 font-semibold uppercase tracking-wide mb-0.5">
        Dependencies
      </span>
      {legendItems.map((item) => (
        <div key={item.type} className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-0.5 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-[10px] ide-text-3">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading fallback                                                   */
/* ------------------------------------------------------------------ */

function CanvasLoading() {
  return (
    <div className="flex-1 flex items-center justify-center ide-surface">
      <div className="flex flex-col items-center gap-3">
        <LambdaDots size={32} />
        <span className="text-xs ide-text-3">Loading canvas…</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main CanvasView                                                    */
/* ------------------------------------------------------------------ */

export function CanvasView({
  files,
  dependencies,
  activeFileId,
  modifiedFileIds = new Set(),
  diagnosticsCounts = new Map(),
  onCanvasChat,
  onFileClick,
  onDropZoneFiles,
}: CanvasViewProps) {
  // ── Build graph data ──────────────────────────────────────────────
  const graphData = useMemo(
    () =>
      buildCanvasGraph({
        files,
        dependencies,
        focusFileId: activeFileId,
        modifiedFileIds,
        diagnosticsCounts,
      }),
    [files, dependencies, activeFileId, modifiedFileIds, diagnosticsCounts]
  );

  // ── State ─────────────────────────────────────────────────────────
  const [nodes, setNodes] = useState<CanvasNode[]>(graphData.nodes);
  const [edges, setEdges] = useState<CanvasEdge[]>(graphData.edges);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<AISuggestionNodeData[]>([]);
  const [showFullGraph, setShowFullGraph] = useState(false);

  // Sync graph data when inputs change
  useEffect(() => {
    setNodes(graphData.nodes);
    setEdges(graphData.edges);
  }, [graphData]);

  // Generate AI suggestions when graph is ready
  useEffect(() => {
    if (nodes.length > 2) {
      setSuggestions(generateMockSuggestions(nodes));
    }
  }, [nodes]);

  // ── Handlers ──────────────────────────────────────────────────────
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: CanvasNode[] }) => {
      setSelectedNodeIds(selectedNodes.map((n) => n.id));
    },
    []
  );

  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: CanvasNode) => {
      onFileClick?.(node.id);
    },
    [onFileClick]
  );

  const handleDismissSuggestion = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleCanvasChat = useCallback(
    (message: string) => {
      const contextIds =
        selectedNodeIds.length > 0
          ? selectedNodeIds
          : nodes.map((n) => n.id);
      onCanvasChat?.(message, contextIds);
    },
    [selectedNodeIds, nodes, onCanvasChat]
  );

  const handleDropZone = useCallback(
    (fileIds: string[]) => {
      onDropZoneFiles?.(fileIds);
    },
    [onDropZoneFiles]
  );

  const toggleFullGraph = useCallback(() => {
    setShowFullGraph((prev) => !prev);
  }, []);

  // ── Rebuild when toggling full graph ──────────────────────────────
  useEffect(() => {
    const newGraph = buildCanvasGraph({
      files,
      dependencies,
      focusFileId: showFullGraph ? null : activeFileId,
      modifiedFileIds,
      diagnosticsCounts,
    });
    setNodes(newGraph.nodes);
    setEdges(newGraph.edges);
  }, [showFullGraph, files, dependencies, activeFileId, modifiedFileIds, diagnosticsCounts]);

  // ── Node and edge type registrations ──────────────────────────────
  const nodeTypes = useMemo(
    () => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      file: FileNodeLazy as any,
    }),
    []
  );

  const edgeTypes = useMemo(
    () => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dependency: DependencyEdgeLazy as any,
    }),
    []
  );

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="relative flex-1 flex flex-col min-h-0 ide-surface">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b ide-border ide-surface-panel shrink-0">
        <span className="text-[11px] font-semibold ide-text-2 uppercase tracking-wide select-none">
          Canvas
        </span>
        <span className="text-[10px] ide-text-quiet">
          {nodes.length} file{nodes.length !== 1 ? 's' : ''} · {edges.length} dep{edges.length !== 1 ? 's' : ''}
        </span>

        <div className="flex-1" />

        <button
          type="button"
          onClick={toggleFullGraph}
          className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
            showFullGraph
              ? 'bg-sky-500/20 dark:bg-sky-500/20 text-sky-600 dark:text-sky-300 border border-sky-500/30'
              : 'ide-surface-input ide-text-3 border ide-border hover:ide-text-2 ide-hover'
          }`}
        >
          {showFullGraph ? 'Full graph' : 'Focus mode'}
        </button>
      </div>

      {/* Canvas area */}
      <div className="relative flex-1 min-h-0">
        <Suspense fallback={<CanvasLoading />}>
          <ReactFlowProviderLazy>
            <ReactFlowInner
              nodes={nodes as unknown as Node[]}
              edges={edges as unknown as Edge[]}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onSelectionChange={(params) => handleSelectionChange({ nodes: params.nodes as unknown as CanvasNode[] })}
              onNodeDoubleClick={(e, node) => handleNodeDoubleClick(e, node as unknown as CanvasNode)}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1.5 }}
              minZoom={0.1}
              maxZoom={3}
              proOptions={{ hideAttribution: true }}
              className="ide-surface"
              defaultEdgeOptions={{
                type: 'dependency',
              }}
            >
              <Suspense fallback={null}>
                <BackgroundLazy gap={20} size={1} color="oklch(0.279 0.029 260)" />
                <MiniMapLazy
                  nodeColor={(node) => {
                    const data = node.data as unknown as CanvasFileData;
                    switch (data?.fileType) {
                      case 'liquid': return 'oklch(0.777 0.152 199)';
                      case 'javascript': return 'oklch(0.795 0.184 86)';
                      case 'css': return 'oklch(0.702 0.183 293)';
                      default: return 'oklch(0.551 0.027 264)';
                    }
                  }}
                  maskColor="oklch(0 0 0 / 0.7)"
                  style={{
                    backgroundColor: 'oklch(0.208 0.042 265)',
                    borderRadius: '0.5rem',
                    border: '1px solid oklch(0.279 0.029 260)',
                  }}
                />
                <ControlsLazy
                  showInteractive={false}
                  style={{
                    borderRadius: '0.5rem',
                    border: '1px solid oklch(0.373 0.022 261)',
                    backgroundColor: 'oklch(0.235 0.031 264)',
                  }}
                />
              </Suspense>
            </ReactFlowInner>
          </ReactFlowProviderLazy>
        </Suspense>

        {/* AI suggestion nodes (rendered as overlay) */}
        {suggestions
          .filter((s) => !s.dismissed)
          .map((suggestion) => (
            <SuggestionNode
              key={suggestion.id}
              suggestion={suggestion}
              onDismiss={handleDismissSuggestion}
            />
          ))}

        {/* Legend */}
        <CanvasLegend />

        {/* Compact chat */}
        {onCanvasChat && (
          <CanvasChat
            selectedFileIds={selectedNodeIds}
            onSend={handleCanvasChat}
          />
        )}

        {/* Drop zone */}
        {onDropZoneFiles && <DropZone onDrop={handleDropZone} />}
      </div>
    </div>
  );
}
