'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send } from 'lucide-react';
import { safeTransition, trapFocus } from '@/lib/accessibility';

export interface AnnotationRegion {
  /** Fraction of container width (0-1) */
  x: number;
  /** Fraction of container height (0-1) */
  y: number;
  /** Fraction of container width */
  width: number;
  /** Fraction of container height */
  height: number;
}

export interface AnnotationData {
  region: AnnotationRegion;
  note: string;
  /** Preview path at time of annotation */
  previewPath?: string;
}

interface PreviewAnnotatorProps {
  active: boolean;
  onClose: () => void;
  onSubmit: (data: AnnotationData) => void;
  previewPath?: string;
}

export function PreviewAnnotator({ active, onClose, onSubmit, previewPath }: PreviewAnnotatorProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const [region, setRegion] = useState<AnnotationRegion | null>(null);
  const [note, setNote] = useState('');
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  // Focus the note input when a region is drawn
  useEffect(() => {
    if (region && noteInputRef.current) {
      noteInputRef.current.focus();
    }
  }, [region]);

  // Trap focus when annotator is active
  useEffect(function() {
    if (!active || !overlayRef.current) return;
    const cleanup = trapFocus(overlayRef.current);
    return cleanup;
  }, [active]);

  const getRelativePosition = useCallback((e: React.MouseEvent) => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setRegion(null);
    setNote('');
    const pos = getRelativePosition(e);
    setStartPoint(pos);
    setCurrentPoint(pos);
    setDrawing(true);
  }, [getRelativePosition]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing) return;
    setCurrentPoint(getRelativePosition(e));
  }, [drawing, getRelativePosition]);

  const handleMouseUp = useCallback(() => {
    if (!drawing || !startPoint || !currentPoint) return;
    setDrawing(false);

    const x = Math.min(startPoint.x, currentPoint.x);
    const y = Math.min(startPoint.y, currentPoint.y);
    const width = Math.abs(currentPoint.x - startPoint.x);
    const height = Math.abs(currentPoint.y - startPoint.y);

    if (width < 0.02 && height < 0.02) {
      setStartPoint(null);
      setCurrentPoint(null);
      return;
    }

    setRegion({ x, y, width, height });
    setStartPoint(null);
    setCurrentPoint(null);
  }, [drawing, startPoint, currentPoint]);

  const handleSubmit = useCallback(() => {
    if (!region) return;
    onSubmit({
      region,
      note: note.trim(),
      previewPath,
    });
    onClose();
  }, [region, note, previewPath, onSubmit, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && !e.shiftKey && region) {
      e.preventDefault();
      handleSubmit();
    }
  }, [onClose, region, handleSubmit]);

  if (!active) return null;

  // Compute the visual rectangle
  let visualRect: { left: string; top: string; width: string; height: string } | null = null;
  if (region) {
    visualRect = {
      left: String(region.x * 100) + '%',
      top: String(region.y * 100) + '%',
      width: String(region.width * 100) + '%',
      height: String(region.height * 100) + '%',
    };
  } else if (drawing && startPoint && currentPoint) {
    const sx = Math.min(startPoint.x, currentPoint.x);
    const sy = Math.min(startPoint.y, currentPoint.y);
    const sw = Math.abs(currentPoint.x - startPoint.x);
    const sh = Math.abs(currentPoint.y - startPoint.y);
    visualRect = {
      left: String(sx * 100) + '%',
      top: String(sy * 100) + '%',
      width: String(sw * 100) + '%',
      height: String(sh * 100) + '%',
    };
  }

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-30"
      role="dialog"
      aria-modal="true"
      aria-label="Annotation overlay"
      style={{ cursor: region ? 'default' : 'crosshair' }}
      onMouseDown={region ? undefined : handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Semi-transparent overlay */}
      <div className="absolute inset-0 bg-black/10" />

      {/* Instruction banner */}
      <AnimatePresence>
        {!region && !drawing && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 text-white text-xs font-medium shadow-lg"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 3v18" />
            </svg>
            Draw a rectangle over the area you want to discuss
            <button
              type="button"
              onClick={function(e) { e.stopPropagation(); onClose(); }}
              className="ml-1 p-0.5 rounded-full hover:bg-white/20 transition-colors"
              aria-label="Cancel annotation"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selection rectangle */}
      {visualRect && (
        <div
          className="absolute border-2 border-sky-500 bg-sky-500/10 rounded-sm pointer-events-none"
          style={visualRect}
        />
      )}

      {/* Note input (appears after drawing) */}
      <AnimatePresence>
        {region && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={safeTransition(0.15)}
            className="absolute bottom-4 left-4 right-4 z-40"
          >
            <div className="rounded-lg ide-surface-panel border ide-border shadow-xl p-3">
              <div className="flex items-start gap-2">
                <textarea
                  ref={noteInputRef}
                  value={note}
                  onChange={function(e) { setNote(e.target.value); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe what you want to change about this area..."
                  rows={2}
                  className="flex-1 px-2 py-1.5 text-xs rounded ide-surface-input border ide-border-subtle ide-text placeholder:ide-text-muted focus:outline-none focus:ring-1 focus:ring-sky-500/20 focus:border-sky-500/30 resize-none"
                />
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="p-2 rounded bg-sky-500 text-white hover:bg-sky-600 transition-colors"
                    title="Send annotation to chat"
                    aria-label="Send annotation"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-2 rounded ide-surface-inset ide-text-muted hover:ide-text-2 ide-hover transition-colors"
                    title="Cancel"
                    aria-label="Cancel annotation"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[10px] ide-text-muted">
                  {'Region: ' + Math.round(region.x * 100) + '%, ' + Math.round(region.y * 100) + '% | ' + Math.round(region.width * 100) + '% x ' + Math.round(region.height * 100) + '%'}
                </span>
                <span className="text-[10px] ide-text-muted">
                  Enter to send
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
