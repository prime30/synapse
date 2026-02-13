'use client';

import { useRef, useCallback, useEffect } from 'react';

interface ResizeHandleProps {
  /**
   * Which edge of the parent container the handle sits on.
   * - `"right"` — right edge of a left-side panel (width = e.clientX)
   * - `"left"`  — left edge of a right-side panel (width = viewport - e.clientX)
   */
  side: 'left' | 'right';
  minWidth: number;
  maxWidth: number;
  /** Current width in px; when provided, resize uses delta from start to avoid jump/jitter. */
  currentWidth?: number;
  /** Called continuously during drag with the computed new width. */
  onResize: (newWidth: number) => void;
  /** Called on double-click (e.g. reset to default width). */
  onDoubleClick?: () => void;
}

export function ResizeHandle({
  side,
  minWidth,
  maxWidth,
  currentWidth,
  onResize,
  onDoubleClick,
}: ResizeHandleProps) {
  const dragging = useRef(false);
  const startRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const moveCountRef = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const cw = typeof currentWidth === 'number' ? currentWidth : (side === 'right' ? e.clientX : window.innerWidth - e.clientX);
      startRef.current = { startX: e.clientX, startWidth: cw };
      dragging.current = true;
      moveCountRef.current = 0;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [side, currentWidth]
  );

  const handleMove = useCallback(
    (e: MouseEvent | PointerEvent) => {
      if (!dragging.current || !startRef.current) return;
      const { startX, startWidth } = startRef.current;
      const deltaX = e.clientX - startX;
      const raw = side === 'right' ? startWidth + deltaX : startWidth - deltaX;
      const clamped = Math.min(maxWidth, Math.max(minWidth, raw));
      moveCountRef.current += 1;
      onResize(clamped);
    },
    [side, minWidth, maxWidth, onResize]
  );

  const handleUp = useCallback((e?: MouseEvent | PointerEvent) => {
    if (e && 'pointerId' in e && e.target instanceof HTMLElement) {
      try { e.target.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    if (!dragging.current) return;
    dragging.current = false;
    startRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp as (e: PointerEvent) => void);
    window.addEventListener('pointercancel', handleUp as () => void);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp as (e: PointerEvent) => void);
      window.removeEventListener('pointercancel', handleUp as () => void);
    };
  }, [handleMove, handleUp]);

  const positionClass =
    side === 'right'
      ? 'right-0 translate-x-1/2'
      : 'left-0 -translate-x-1/2';

  return (
    <button
      type="button"
      className={`absolute top-0 bottom-0 z-20 w-[5px] cursor-col-resize
        bg-transparent hover:bg-sky-500/40 active:bg-sky-500/60
        transition-colors duration-75 focus:outline-none ${positionClass}`}
      onPointerDown={handlePointerDown}
      onDoubleClick={onDoubleClick}
      aria-label="Resize panel"
    />
  );
}
