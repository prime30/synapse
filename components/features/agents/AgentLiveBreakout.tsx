'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAgentColor, type AgentColorSet } from '@/lib/agents/agent-colors';

// -- Types --

export interface AgentLiveBreakoutProps {
  /** The agent type currently executing (e.g. 'liquid', 'css'). Null hides the panel. */
  agentType: string | null;
  /** Label to display (e.g. 'Liquid agent'). Falls back to agentType. */
  agentLabel?: string;
  /** File path currently being edited. */
  filePath: string | null;
  /** Live content of the file being edited (updates as the agent streams). */
  liveContent: string | null;
  /** Called when the user closes the breakout. */
  onClose: () => void;
  /** Called when the user minimizes the breakout. */
  onMinimize?: () => void;
}

// -- Helpers --

const SHORT_NAME_RE = /(?:^|\/)([^/]+)$/;
function shortFileName(path: string | null): string {
  if (!path) return 'untitled';
  const match = path.match(SHORT_NAME_RE);
  return match ? match[1] : path;
}

// -- Component --

export function AgentLiveBreakout({
  agentType,
  agentLabel,
  filePath,
  liveContent,
  onClose,
  onMinimize,
}: AgentLiveBreakoutProps) {
  const [minimized, setMinimized] = useState(false);
  const codeRef = useRef<HTMLPreElement>(null);
  const colors: AgentColorSet = useMemo(() => getAgentColor(agentType), [agentType]);
  const label = agentLabel ?? (agentType ? agentType.charAt(0).toUpperCase() + agentType.slice(1) + ' agent' : 'Agent');
  const fileName = shortFileName(filePath);

  // Auto-scroll code view to bottom as content streams in
  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.scrollTop = codeRef.current.scrollHeight;
    }
  }, [liveContent]);

  // Keyboard: Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Persist position in localStorage
  const STORAGE_KEY = 'synapse-breakout-pos';
  const savedPos = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed as { x: number; y: number };
    } catch { /* ignore */ }
    return null;
  }, []);

  // Draggable state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(savedPos);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const origX = position?.x ?? rect.left;
    const origY = position?.y ?? rect.top;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX, origY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPosition({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    // Persist position
    if (position) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(position)); } catch { /* quota */ }
    }
  }, [position, STORAGE_KEY]);

  const handleMinimize = useCallback(() => {
    setMinimized(true);
    onMinimize?.();
  }, [onMinimize]);

  const handleRestore = useCallback(() => {
    setMinimized(false);
  }, []);

  if (!agentType) return null;

  const dotCls = 'w-2 h-2 rounded-full animate-pulse-gentle border ' + colors.bg + ' ' + colors.border;
  const labelCls = 'text-xs font-medium flex-1 truncate ' + colors.text;
  const pillLabelCls = 'text-[11px] font-medium ' + colors.text;
  const titleBarCls = 'flex items-center gap-2 px-3 py-2 border-b ide-border-subtle cursor-grab active:cursor-grabbing select-none border-l-[3px] ' + colors.border;

  // Minimized pill
  if (minimized) {
    return (
      <motion.button
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        onClick={handleRestore}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full px-3 py-1.5 ide-surface-pop border ide-border shadow-lg cursor-pointer hover:shadow-xl transition-shadow"
        aria-label="Restore agent live view"
      >
        <span className={dotCls} />
        <span className={pillLabelCls}>{label}</span>
        <span className="text-[10px] ide-text-muted">{fileName}</span>
      </motion.button>
    );
  }

  // Positioning: if dragged, use absolute coords; otherwise default bottom-right
  const positionStyle: React.CSSProperties = position
    ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' }
    : { right: 16, bottom: 16 };

  return (
    <AnimatePresence>
      <motion.div
        ref={panelRef}
        key="agent-live-breakout"
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        role="dialog"
        aria-label="Agent live editing viewer"
        tabIndex={-1}
        className="fixed z-50 flex flex-col rounded-lg ide-surface-pop shadow-xl overflow-hidden"
        style={{
          width: 420,
          maxHeight: 340,
          ...positionStyle,
        }}
      >
        {/* Title bar (draggable) */}
        <div
          className={titleBarCls}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* Agent color dot + label */}
          <span className={dotCls} />
          <span className={labelCls}>
            {label}
          </span>
          <span className="text-[10px] ide-text-muted truncate max-w-[140px]" title={filePath ?? undefined}>
            {fileName}
          </span>

          {/* Minimize */}
          <button
            onClick={handleMinimize}
            className="p-0.5 rounded ide-text-muted hover:ide-text-2 ide-hover transition-colors"
            aria-label="Minimize agent live view"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-0.5 rounded ide-text-muted hover:ide-text-2 ide-hover transition-colors"
            aria-label="Close agent live view"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Code content */}
        <pre
          ref={codeRef}
          className="flex-1 min-h-0 overflow-auto px-3 py-2 text-[11px] leading-relaxed font-mono ide-text-2 ide-surface-inset whitespace-pre-wrap break-words"
        >
          {liveContent ?? 'Waiting for agent output\u2026'}
        </pre>
      </motion.div>
    </AnimatePresence>
  );
}
