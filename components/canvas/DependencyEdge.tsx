'use client';

/**
 * Custom React Flow edge for dependency links.
 * Color-coded by dependency type; shows reference count on hover.
 *
 * EPIC 15: Spatial Canvas
 */

import { memo, useState, useCallback, type CSSProperties } from 'react';
import {
  BaseEdge,
  getSmoothStepPath,
  EdgeLabelRenderer,
  type EdgeProps,
} from '@xyflow/react';
import {
  EDGE_COLORS,
  type CanvasEdgeData,
} from '@/lib/ai/canvas-data-provider';
import type { FileDependency } from '@/lib/context/types';

/* ------------------------------------------------------------------ */
/*  Human-readable labels                                              */
/* ------------------------------------------------------------------ */

const TYPE_LABELS: Record<FileDependency['dependencyType'], string> = {
  liquid_include: 'Liquid include',
  asset_reference: 'Asset ref',
  css_import: 'CSS import',
  css_class: 'CSS class',
  js_function: 'JS function',
  js_import: 'JS import',
  template_section: 'Section',
  data_attribute: 'Data attr',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function DependencyEdgeInner(props: EdgeProps<CanvasEdgeData>) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
  } = props;

  const [hovered, setHovered] = useState(false);

  const depType = data?.dependencyType ?? 'liquid_include';
  const refCount = data?.referenceCount ?? 0;
  const strokeColor = EDGE_COLORS[depType] ?? '#6b7280';

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });

  const handleMouseEnter = useCallback(() => setHovered(true), []);
  const handleMouseLeave = useCallback(() => setHovered(false), []);

  const edgeStyle: CSSProperties = {
    stroke: strokeColor,
    strokeWidth: selected ? 2.5 : hovered ? 2 : 1.5,
    opacity: hovered || selected ? 1 : 0.6,
    transition: 'stroke-width 150ms, opacity 150ms',
  };

  return (
    <>
      {/* Invisible wider path for easier hover targeting */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: 'pointer' }}
      />

      <BaseEdge id={id} path={edgePath} style={edgeStyle} />

      {/* Hover label */}
      {(hovered || selected) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-800/95 border border-gray-700 shadow-lg text-[10px] whitespace-nowrap">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: strokeColor }}
              />
              <span className="text-gray-300 font-medium">
                {TYPE_LABELS[depType]}
              </span>
              {refCount > 0 && (
                <span className="text-gray-500">
                  × {refCount}
                </span>
              )}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const DependencyEdge = memo(DependencyEdgeInner);
