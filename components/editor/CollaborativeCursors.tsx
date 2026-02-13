'use client';

import type { RemoteCursor } from '@/hooks/useRemoteCursors';

interface CollaborativeCursorsProps {
  cursors: RemoteCursor[];
}

export function CollaborativeCursors({ cursors }: CollaborativeCursorsProps) {
  if (cursors.length === 0) return null;

  return (
    <div className="absolute top-2 right-2 rounded ide-surface-pop border ide-border px-2 py-1 text-xs ide-text-2">
      Active cursors: {cursors.length}
    </div>
  );
}
