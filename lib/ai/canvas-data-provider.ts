/**
 * Canvas data provider — converts DependencyDetector output into React Flow
 * nodes + edges with dagre-powered auto-layout.
 *
 * EPIC 15: Spatial Canvas
 */

import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type {
  FileContext,
  FileDependency,
  DependencyReference,
} from '@/lib/context/types';

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface CanvasFileData extends Record<string, unknown> {
  fileId: string;
  fileName: string;
  filePath: string;
  fileType: 'liquid' | 'javascript' | 'css' | 'other';
  sizeBytes: number;
  isModified: boolean;
  diagnosticsCount: number;
  /** Theme directory bucket (sections, snippets, assets, templates, etc.) */
  directory: string;
}

export interface CanvasEdgeData extends Record<string, unknown> {
  dependencyType: FileDependency['dependencyType'];
  referenceCount: number;
  references: DependencyReference[];
}

export type CanvasNode = Node<CanvasFileData, 'file'>;
export type CanvasEdge = Edge<CanvasEdgeData>;

export interface CanvasCluster {
  directory: string;
  nodeIds: string[];
  expanded: boolean;
}

export interface CanvasGraphData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  clusters: CanvasCluster[];
}

export interface AISuggestionNodeData {
  id: string;
  message: string;
  fileIds: string[];
  /** Position relative to centroid of related file cluster */
  x: number;
  y: number;
  dismissed: boolean;
}

/* ------------------------------------------------------------------ */
/*  Edge color mapping                                                 */
/* ------------------------------------------------------------------ */

export const EDGE_COLORS: Record<FileDependency['dependencyType'], string> = {
  liquid_include: 'oklch(0.623 0.214 259)', // blue
  asset_reference: 'oklch(0.723 0.191 149)', // green
  css_import: 'oklch(0.702 0.183 52)', // orange
  css_class: 'oklch(0.586 0.262 293)', // purple
  js_function: 'oklch(0.795 0.184 86)', // yellow
  js_import: 'oklch(0.702 0.183 52)', // orange (same family as css_import)
  template_section: 'oklch(0.715 0.143 215)', // cyan
  data_attribute: 'oklch(0.551 0.014 264)', // gray
  schema_setting: 'oklch(0.627 0.265 3)', // pink
  css_section: 'oklch(0.702 0.183 52)', // orange (same family as css)
  snippet_variable: 'oklch(0.585 0.233 264)', // violet
};

/* ------------------------------------------------------------------ */
/*  Directory extraction                                               */
/* ------------------------------------------------------------------ */

function getDirectory(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (parts.length <= 1) return 'root';
  return parts[0]; // sections, snippets, assets, templates, config, locales, layout
}

/* ------------------------------------------------------------------ */
/*  Node dimensions for dagre layout                                   */
/* ------------------------------------------------------------------ */

const NODE_WIDTH = 220;
const NODE_HEIGHT = 72;

/* ------------------------------------------------------------------ */
/*  Core: build graph from dependency data                             */
/* ------------------------------------------------------------------ */

export interface BuildGraphOptions {
  files: FileContext[];
  dependencies: FileDependency[];
  /** Only include nodes reachable from this file ID (1 hop). Null = full graph. */
  focusFileId?: string | null;
  /** File IDs that have unsaved changes */
  modifiedFileIds?: Set<string>;
  /** Map of fileId -> diagnostics count */
  diagnosticsCounts?: Map<string, number>;
  /** Direction: TB (top-to-bottom) or LR (left-to-right) */
  direction?: 'TB' | 'LR';
}

/**
 * Build the full React Flow graph from dependency detector output.
 * When `focusFileId` is set, only the active file and its direct
 * dependencies are included (performance optimisation for 200+ file themes).
 */
export function buildCanvasGraph(options: BuildGraphOptions): CanvasGraphData {
  const {
    files,
    dependencies,
    focusFileId = null,
    modifiedFileIds = new Set(),
    diagnosticsCounts = new Map(),
    direction = 'TB',
  } = options;

  // ── 1. Determine which files to include ──────────────────────────
  let includedFileIds: Set<string>;

  if (focusFileId) {
    includedFileIds = new Set([focusFileId]);
    for (const dep of dependencies) {
      if (dep.sourceFileId === focusFileId) {
        includedFileIds.add(dep.targetFileId);
      }
      if (dep.targetFileId === focusFileId) {
        includedFileIds.add(dep.sourceFileId);
      }
    }
  } else {
    includedFileIds = new Set(files.map((f) => f.fileId));
  }

  const fileMap = new Map(files.map((f) => [f.fileId, f]));

  // ── 2. Build nodes ───────────────────────────────────────────────
  const nodes: CanvasNode[] = [];
  for (const fileId of includedFileIds) {
    const file = fileMap.get(fileId);
    if (!file) continue;

    nodes.push({
      id: fileId,
      type: 'file',
      position: { x: 0, y: 0 }, // dagre will assign real positions
      data: {
        fileId: file.fileId,
        fileName: file.fileName.split('/').pop() ?? file.fileName,
        filePath: file.fileName,
        fileType: file.fileType,
        sizeBytes: file.sizeBytes,
        isModified: modifiedFileIds.has(fileId),
        diagnosticsCount: diagnosticsCounts.get(fileId) ?? 0,
        directory: getDirectory(file.fileName),
      },
    });
  }

  // ── 3. Build edges ───────────────────────────────────────────────
  const edges: CanvasEdge[] = [];
  for (const dep of dependencies) {
    if (
      !includedFileIds.has(dep.sourceFileId) ||
      !includedFileIds.has(dep.targetFileId)
    ) {
      continue;
    }

    edges.push({
      id: `${dep.sourceFileId}-${dep.targetFileId}-${dep.dependencyType}`,
      source: dep.sourceFileId,
      target: dep.targetFileId,
      type: 'dependency',
      data: {
        dependencyType: dep.dependencyType,
        referenceCount: dep.references.length,
        references: dep.references,
      },
    });
  }

  // ── 4. Auto-layout with dagre ────────────────────────────────────
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 100,
    marginx: 40,
    marginy: 40,
  });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  // Apply dagre positions to nodes (dagre gives center, React Flow uses top-left)
  for (const node of nodes) {
    const dagreNode = g.node(node.id);
    if (dagreNode) {
      node.position = {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - NODE_HEIGHT / 2,
      };
    }
  }

  // ── 5. Build clusters ────────────────────────────────────────────
  const clusterMap = new Map<string, string[]>();
  for (const node of nodes) {
    const dir = node.data.directory;
    const list = clusterMap.get(dir) ?? [];
    list.push(node.id);
    clusterMap.set(dir, list);
  }

  const clusters: CanvasCluster[] = Array.from(clusterMap.entries()).map(
    ([directory, nodeIds]) => ({
      directory,
      nodeIds,
      expanded: true,
    })
  );

  return { nodes, edges, clusters };
}

/* ------------------------------------------------------------------ */
/*  AI suggestion node positioning                                     */
/* ------------------------------------------------------------------ */

/**
 * Position an AI suggestion node near the centroid of its related file cluster.
 */
export function positionSuggestionNode(
  fileIds: string[],
  nodes: CanvasNode[],
  offsetX = 250,
  offsetY = -20
): { x: number; y: number } {
  const relevant = nodes.filter((n) => fileIds.includes(n.id));
  if (relevant.length === 0) return { x: offsetX, y: offsetY };

  const cx =
    relevant.reduce((sum, n) => sum + n.position.x, 0) / relevant.length;
  const cy =
    relevant.reduce((sum, n) => sum + n.position.y, 0) / relevant.length;

  return { x: cx + offsetX, y: cy + offsetY };
}
