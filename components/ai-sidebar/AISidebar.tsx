'use client';

import { useRef, useCallback, useEffect } from 'react';
import { ContextPanel } from './ContextPanel';
import { ChatInterface } from './ChatInterface';
import type { ChatMessage } from './ChatInterface';
import type { AISidebarContextValue } from '@/hooks/useAISidebar';

interface AISidebarProps {
  isOpen: boolean;
  width: number;
  minWidth: number;
  maxWidth: number;
  onClose: () => void;
  onResize: (width: number) => void;
  context: AISidebarContextValue;
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (content: string) => void;
  className?: string;
}

export function AISidebar({
  isOpen,
  width,
  minWidth,
  maxWidth,
  onClose,
  onResize,
  context,
  messages,
  isLoading,
  onSend,
  className = '',
}: AISidebarProps) {
  const resizeRef = useRef<boolean>(false);

  const handleMouseDown = useCallback(() => {
    resizeRef.current = true;
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!resizeRef.current) return;
      // Resize from left edge: new width = window width - e.clientX
      const newWidth = Math.min(maxWidth, Math.max(minWidth, window.innerWidth - e.clientX));
      onResize(newWidth);
    },
    [minWidth, maxWidth, onResize]
  );

  const handleMouseUp = useCallback(() => {
    resizeRef.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className={`relative flex flex-col border-l border-gray-800 bg-gray-900 flex-shrink-0 ${className}`}
        style={{ width: `${width}px` }}
        role="complementary"
        aria-label="AI assistant"
      >
        {/* Resize handle (left edge) */}
        <button
          type="button"
          className="absolute left-0 top-0 bottom-0 z-10 w-1 cursor-col-resize hover:bg-blue-500/30 focus:outline-none"
          onMouseDown={handleMouseDown}
          aria-label="Resize sidebar"
        />
        <div className="flex flex-col flex-1 min-h-0 pl-1">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-800 px-2 py-1.5 flex-shrink-0">
            <span className="text-xs font-medium text-gray-300">AI Assistant</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
              aria-label="Close sidebar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <ContextPanel context={context} className="mx-2 mt-2 flex-shrink-0" />
          <ChatInterface
            messages={messages}
            isLoading={isLoading}
            onSend={onSend}
            className="flex-1 min-h-0 mt-2"
          />
        </div>
      </div>
    </>
  );
}
