'use client';

import React, { useState, useRef, useEffect } from 'react';
import { GitBranch } from 'lucide-react';

interface BranchSelectorProps {
  sessions: Array<{ id: string; title: string; updatedAt: string; isCurrent: boolean }>;
  onSelectSession: (sessionId: string) => void;
}

export function BranchSelector({ sessions, onSelectSession }: BranchSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (isOpen && focusedIndex >= 0) {
      itemRefs.current[focusedIndex]?.focus();
    }
  }, [isOpen, focusedIndex]);

  if (sessions.length <= 1) {
    return null;
  }

  const currentSession = sessions.find(s => s.isCurrent) || sessions[0];
  const displayTitle = currentSession.title.length > 20 
    ? currentSession.title.substring(0, 20) + '...'
    : currentSession.title;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const handleSelectSession = (sessionId: string) => {
    onSelectSession(sessionId);
    setIsOpen(false);
    setFocusedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) return;

    if (e.key === 'Escape') {
      setIsOpen(false);
      setFocusedIndex(-1);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => {
        const next = prev < sessions.length - 1 ? prev + 1 : 0;
        itemRefs.current[next]?.focus();
        return next;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : sessions.length - 1;
        itemRefs.current[next]?.focus();
        return next;
      });
      return;
    }

    if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      handleSelectSession(sessions[focusedIndex].id);
      return;
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select conversation branch"
        className={'rounded ide-surface-inset ide-border text-xs px-2 py-1 flex items-center gap-1.5'}
      >
        <GitBranch className={'w-3 h-3'} />
        <span>{displayTitle}</span>
      </button>

      {isOpen && (
        <>
          <div
            className={'fixed inset-0 z-40'}
            onClick={() => setIsOpen(false)}
          />
          <div
            ref={containerRef}
            role="listbox"
            aria-label="Conversation branches"
            onKeyDown={handleKeyDown}
            className={'absolute top-full mt-1 right-0 ide-surface-panel ide-border shadow-lg z-50 rounded min-w-[200px]'}
          >
            {sessions.map((session, index) => (
              <button
                key={session.id}
                ref={(el) => { itemRefs.current[index] = el; }}
                role="option"
                aria-selected={session.isCurrent}
                onClick={() => handleSelectSession(session.id)}
                className={'w-full px-3 py-1.5 text-xs ide-hover transition-colors text-left flex items-center justify-between' + (session.isCurrent ? ' bg-sky-500/10 text-sky-600' : '')}
              >
                <span className={'truncate'}>{session.title}</span>
                <span className={'text-xs opacity-60 ml-2'}>{formatDate(session.updatedAt)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
