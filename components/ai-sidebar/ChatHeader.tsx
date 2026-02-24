'use client';

import React from 'react';

export interface ChatHeaderProps {
  /** Session or chat title */
  title?: string;
  /** Slot for share button (e.g. ShareButton component) */
  shareSlot?: React.ReactNode;
  /** Slot for model picker or other controls */
  controlsSlot?: React.ReactNode;
  /** Additional class name for the header container */
  className?: string;
}

/**
 * Minimal chat header with session title and share button slot.
 * Used when ChatInterface is refactored to extract header UI.
 */
export function ChatHeader({
  title,
  shareSlot,
  controlsSlot,
  className = '',
}: ChatHeaderProps) {
  return (
    <div
      className={`flex items-center justify-between border-b ide-border-subtle px-3 py-2 flex-shrink-0 ${className}`}
      role="banner"
    >
      <span className="text-sm font-medium ide-text-2 truncate min-w-0">
        {title ?? 'Chat'}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {controlsSlot}
        {shareSlot}
      </div>
    </div>
  );
}
