import type { RemoteCursor } from '@/hooks/useRemoteCursors';

/**
 * Placeholder cursor renderer for non-Monaco editors.
 * This returns a simplified representation that can be used by
 * overlay components until Monaco integration is added.
 */
export function getCursorLabel(cursor: RemoteCursor): string {
  const position = cursor.position
    ? `L${cursor.position.line}:${cursor.position.column}`
    : 'unknown';
  return `${cursor.userId} (${position})`;
}
