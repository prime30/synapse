'use client';

import { useRef, useEffect, useCallback, useState, type CSSProperties } from 'react';
import { analyzeDataFlowFromSource } from '@/lib/liquid/flow-analyzer';
import type { FlowPath, FlowGraphConfig } from '@/lib/liquid/flow-graph-builder';
import { buildFlowPaths, getVisiblePaths, getPathsAtPosition, DEFAULT_FLOW_CONFIG, editorToPixel } from '@/lib/liquid/flow-graph-builder';
import type { ParticleSystem } from '@/lib/liquid/particle-system';
import { createParticleSystem, renderParticles, renderFlowLines, DEFAULT_COLORS } from '@/lib/liquid/particle-system';

interface FlowCanvasProps {
  /** The Liquid source code to analyze */
  source: string;
  /** Monaco editor instance for scroll sync (null before mount) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: Record<string, any> | null;
  /** Whether the flow visualization is enabled */
  enabled: boolean;
  /** Callback to toggle enabled state */
  onToggle: () => void;
  /** Current cursor line (1-based) for highlighting active paths */
  cursorLine?: number;
  /** Current cursor column (1-based) */
  cursorColumn?: number;
  /** Editor font size for config calculation */
  fontSize?: number;
  /** Width of the editor area in CSS pixels */
  width: number;
  /** Height of the editor area in CSS pixels */
  height: number;
}

/** Render small circles at source/usage locations along visible paths. */
function renderNodeDots(
  ctx: CanvasRenderingContext2D,
  paths: FlowPath[],
  activePaths: Set<string>,
  config: FlowGraphConfig,
  dpr: number,
): void {
  ctx.save();
  const radius = 3 * dpr;
  for (const path of paths) {
    const isActive = activePaths.has(path.id);
    const color = DEFAULT_COLORS[path.dataType as keyof typeof DEFAULT_COLORS] ?? DEFAULT_COLORS.unknown;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = isActive ? 0.8 : 0.2;
    ctx.lineWidth = 1.2 * dpr;

    for (const pt of path.points) {
      const { x, y } = editorToPixel(pt.line, pt.column, config);
      ctx.beginPath();
      ctx.arc(x * dpr, y * dpr, radius, 0, Math.PI * 2);
      // Assignments = filled, outputs/others = hollow
      if (pt.label.includes('=') || pt.label.startsWith('capture') || pt.label.startsWith('for')) {
        ctx.fill();
      } else {
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/**
 * FlowCanvas renders an HTML5 Canvas overlay behind a Monaco editor showing
 * animated data-flow paths with particles traveling along bezier curves.
 * Includes a toggle button, hover tooltips, and color-coded visual language.
 */
export function FlowCanvas({
  source, editor, enabled, onToggle,
  cursorLine = 1, cursorColumn = 1,
  fontSize = 14, width, height,
}: FlowCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const systemRef = useRef<ParticleSystem | null>(null);
  const pathsRef = useRef<FlowPath[]>([]);
  const configRef = useRef<FlowGraphConfig>({ ...DEFAULT_FLOW_CONFIG });
  const lastTimeRef = useRef(0);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    configRef.current = {
      ...DEFAULT_FLOW_CONFIG,
      lineHeight: Math.round(fontSize * 1.35),
      charWidth: fontSize * 0.55,
    };
  }, [fontSize]);

  useEffect(() => {
    if (!enabled || !source) {
      pathsRef.current = [];
      systemRef.current?.reset();
      return;
    }
    const graph = analyzeDataFlowFromSource(source);
    const paths = buildFlowPaths(graph, configRef.current);
    pathsRef.current = paths;
    const system = createParticleSystem(paths);
    systemRef.current = system;
  }, [source, enabled]);

  useEffect(() => { // scroll sync
    if (!editor) return;
    const disposable = editor.onDidScrollChange((e: { scrollTop?: number; scrollLeft?: number }) => {
      configRef.current.scrollTop = e.scrollTop ?? 0;
      configRef.current.scrollLeft = e.scrollLeft ?? 0;
    });
    return () => disposable.dispose();
  }, [editor]);

  useEffect(() => { // active paths
    if (!systemRef.current || !enabled) return;
    const nearby = getPathsAtPosition(pathsRef.current, cursorLine, cursorColumn);
    systemRef.current.setActivePaths(new Set(nearby.map((p: FlowPath) => p.id)));
  }, [cursorLine, cursorColumn, enabled]);

  useEffect(() => { // animation loop
    if (!enabled) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const animate = (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) { animRef.current = requestAnimationFrame(animate); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { animRef.current = requestAnimationFrame(animate); return; }

      const dpr = window.devicePixelRatio || 1;
      const delta = lastTimeRef.current ? time - lastTimeRef.current : 16;
      lastTimeRef.current = time;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const visible = getVisiblePaths(
        pathsRef.current, configRef.current.scrollTop,
        configRef.current.scrollTop + height, configRef.current,
      );

      const active = new Set(
        getPathsAtPosition(pathsRef.current, cursorLine, cursorColumn).map((p: FlowPath) => p.id),
      );

      renderFlowLines(ctx, visible, active, DEFAULT_COLORS, dpr);
      renderNodeDots(ctx, visible, active, configRef.current, dpr);

      if (systemRef.current) {
        renderParticles(ctx, systemRef.current.tick(delta), dpr, true);
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [enabled, height, cursorLine, cursorColumn]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cfg = configRef.current;
    const line = Math.floor((y + cfg.scrollTop) / cfg.lineHeight) + 1;
    const col = Math.floor((x - cfg.gutterWidth + cfg.scrollLeft) / cfg.charWidth) + 1;

    const nearby = getPathsAtPosition(pathsRef.current, line, col);
    if (nearby.length > 0) {
      const path = nearby[0];
      const pt = path.points.find((p: { line: number }) => Math.abs(p.line - line) <= 1);
      if (pt) {
        setTooltip({ x: x + 12, y: y - 8, text: `${path.variableName}: ${path.dataType}` });
        return;
      }
    }
    setTooltip(null);
  }, []);

  useEffect(() => { // resize canvas
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }, [width, height]);

  return (
    <div className="relative" style={{ width, height }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ zIndex: 0, pointerEvents: enabled ? 'auto' : 'none' } as CSSProperties}
        onMouseMove={enabled ? handleMouseMove : undefined}
        onMouseLeave={() => setTooltip(null)}
      />

      {/* Toggle button */}
      <button
        type="button"
        onClick={onToggle}
        className={`absolute top-2 right-2 z-10 flex items-center justify-center w-7 h-7
          rounded-md border transition-colors ${
          enabled
            ? 'ide-active border-sky-500/40 text-sky-500 dark:text-sky-400 hover:bg-sky-500/20'
            : 'ide-surface-panel ide-border ide-text-muted ide-hover'
        }`}
        title={enabled ? 'Hide flow visualization' : 'Show flow visualization'}
        aria-label={enabled ? 'Hide flow visualization' : 'Show flow visualization'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      </button>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-20 px-2.5 py-1.5 rounded-md text-xs font-mono
            ide-surface-pop ide-text-quiet ide-border shadow-lg
            pointer-events-none whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
