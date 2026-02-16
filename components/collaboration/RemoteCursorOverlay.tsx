'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { CollaborativePeer } from '@/hooks/useCollaborativeEditor';
import type { editor } from 'monaco-editor';

interface RemoteCursorOverlayProps {
  peers: CollaborativePeer[];
  editorRef: React.RefObject<unknown>;
}

interface CursorState {
  visible: boolean;
  lastMoveTime: number;
}

/**
 * Renders remote user cursors and selections on top of a Monaco editor
 * for collaborative editing visualization.
 */
export function RemoteCursorOverlay({ peers, editorRef }: RemoteCursorOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasEditor, setHasEditor] = useState(false);
  const [cursorStates, setCursorStates] = useState<Record<string, CursorState>>({});
  const [positions, setPositions] = useState<Record<string, { top: number; left: number; height: number }>>({});
  const [selectionRanges, setSelectionRanges] = useState<Record<string, Array<{ top: number; left: number; width: number; height: number }>>>({});

  // Update cursor positions based on Monaco editor coordinates
  useEffect(() => {
    const editor = editorRef.current as editor.IStandaloneCodeEditor | null;
    setHasEditor(!!editor);
    if (!editor || !containerRef.current) return;

    const lineHeight = (editor.getTopForLineNumber(2) - editor.getTopForLineNumber(1)) || 20;

    const updatePositions = () => {
      const newPositions: Record<string, { top: number; left: number; height: number }> = {};
      const newSelectionRanges: Record<string, Array<{ top: number; left: number; width: number; height: number }>> = {};
      const now = Date.now();

      peers.forEach((peer) => {
        if (!peer.cursor) return;

        const { lineNumber, column } = peer.cursor;
        const coords = editor.getScrolledVisiblePosition({ lineNumber, column });

        if (coords) {
          newPositions[peer.userId] = {
            top: coords.top,
            left: coords.left,
            height: lineHeight,
          };

          // Update cursor state for label visibility
          setCursorStates((prev) => {
            const existing = prev[peer.userId];
            if (!existing || existing.lastMoveTime < now - 100) {
              return {
                ...prev,
                [peer.userId]: {
                  visible: true,
                  lastMoveTime: now,
                },
              };
            }
            return prev;
          });

          // Handle selection ranges
          if (peer.selection) {
            const model = editor.getModel();
            if (model) {
              const ranges: Array<{ top: number; left: number; width: number; height: number }> = [];
              const { startLineNumber, startColumn, endLineNumber, endColumn } = peer.selection;

              // Handle multi-line selections
              if (startLineNumber === endLineNumber) {
                // Single line selection
                const startCoords = editor.getScrolledVisiblePosition({ lineNumber: startLineNumber, column: startColumn });
                const endCoords = editor.getScrolledVisiblePosition({ lineNumber: endLineNumber, column: endColumn });
                if (startCoords && endCoords) {
                  ranges.push({
                    top: startCoords.top,
                    left: startCoords.left,
                    width: Math.max(1, endCoords.left - startCoords.left),
                    height: lineHeight,
                  });
                }
              } else {
                // Multi-line selection
                for (let line = startLineNumber; line <= endLineNumber; line++) {
                  const lineStartCol = line === startLineNumber ? startColumn : 1;
                  const lineEndCol = line === endLineNumber ? endColumn : model.getLineContent(line).length + 1;

                  const startCoords = editor.getScrolledVisiblePosition({ lineNumber: line, column: lineStartCol });
                  const endCoords = editor.getScrolledVisiblePosition({ lineNumber: line, column: lineEndCol });

                  if (startCoords && endCoords) {
                    ranges.push({
                      top: startCoords.top,
                      left: startCoords.left,
                      width: Math.max(1, endCoords.left - startCoords.left),
                      height: lineHeight,
                    });
                  }
                }
              }

              if (ranges.length > 0) {
                newSelectionRanges[peer.userId] = ranges;
              }
            }
          }
        }
      });

      setPositions(newPositions);
      setSelectionRanges(newSelectionRanges);
    };

    // Initial update
    updatePositions();

    // Listen to scroll events for more efficient updates
    const scrollDisposable = editor.onDidScrollChange(() => {
      updatePositions();
    });

    // Fallback interval for cases where scroll events might be missed
    const interval = setInterval(updatePositions, 200);

    return () => {
      scrollDisposable.dispose();
      clearInterval(interval);
    };
  }, [peers, editorRef]);

  // Auto-hide labels after 3 seconds of no movement
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setCursorStates((prev) => {
        const updated = { ...prev };
        let changed = false;

        Object.keys(updated).forEach((userId) => {
          const state = updated[userId];
          if (state.visible && now - state.lastMoveTime > 3000) {
            updated[userId] = { ...state, visible: false };
            changed = true;
          }
        });

        return changed ? updated : prev;
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  if (!hasEditor || peers.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ overflow: 'hidden' }}
    >
      {peers.map((peer) => {
        const position = positions[peer.userId];
        const selection = selectionRanges[peer.userId];
        const cursorState = cursorStates[peer.userId];
        const showLabel = cursorState?.visible !== false;

        if (!position) return null;

        const color = peer.color || '#3b82f6'; // Default blue

        return (
          <React.Fragment key={peer.userId}>
            {/* Selection highlight */}
            {selection &&
              selection.map((range, idx) => (
                <div
                  key={`selection-${idx}`}
                  className="absolute transition-opacity duration-200"
                  style={{
                    top: `${range.top}px`,
                    left: `${range.left}px`,
                    width: `${range.width}px`,
                    height: `${range.height}px`,
                    backgroundColor: color,
                    opacity: 0.2,
                    pointerEvents: 'none',
                  }}
                />
              ))}

            {/* Cursor line */}
            <div
              className="absolute transition-opacity duration-200"
              style={{
                top: `${position.top}px`,
                left: `${position.left}px`,
                width: '2px',
                height: `${position.height}px`,
                backgroundColor: color,
                pointerEvents: 'none',
              }}
            />

            {/* Name label */}
            {showLabel && peer.name && (
              <div
                className="absolute px-1.5 py-0.5 text-xs font-medium text-white rounded transition-opacity duration-200 whitespace-nowrap"
                style={{
                  top: `${position.top - 18}px`,
                  left: `${position.left}px`,
                  backgroundColor: color,
                  pointerEvents: 'none',
                  transform: 'translateX(-50%)',
                }}
              >
                {peer.name}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
