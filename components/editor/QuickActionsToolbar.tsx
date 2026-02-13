'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, RefreshCw, FileText, Wrench } from 'lucide-react';

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: string;
  shortcut?: string;
}

export interface QuickActionsToolbarProps {
  /** Whether the toolbar should be visible */
  isVisible: boolean;
  /** Position of the toolbar (absolute, relative to editor container) */
  position: { top: number; left: number };
  /** The selected text in the editor */
  selectedText: string;
  /** Called when user clicks a quick action */
  onAction: (prompt: string) => void;
  /** Called when toolbar is dismissed */
  onDismiss: () => void;
}

const TOOLBAR_OFFSET_Y = 40;

function buildActions(selectedText: string): QuickAction[] {
  return [
    {
      id: 'explain',
      label: 'Explain',
      icon: <MessageSquare size={16} />,
      shortcut: 'E',
      action: `Explain this code:\n\`\`\`\n${selectedText}\n\`\`\``,
    },
    {
      id: 'refactor',
      label: 'Refactor',
      icon: <RefreshCw size={16} />,
      shortcut: 'R',
      action: `Refactor this code for better readability and maintainability:\n\`\`\`\n${selectedText}\n\`\`\``,
    },
    {
      id: 'document',
      label: 'Document',
      icon: <FileText size={16} />,
      shortcut: 'D',
      action: `Add documentation comments to this code:\n\`\`\`\n${selectedText}\n\`\`\``,
    },
    {
      id: 'fix',
      label: 'Fix',
      icon: <Wrench size={16} />,
      shortcut: 'F',
      action: `Fix any issues in this code:\n\`\`\`\n${selectedText}\n\`\`\``,
    },
  ];
}

export function QuickActionsToolbar({
  isVisible,
  position,
  selectedText,
  onAction,
  onDismiss,
}: QuickActionsToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (
        toolbarRef.current &&
        !toolbarRef.current.contains(e.target as Node)
      ) {
        onDismiss();
      }
    },
    [onDismiss]
  );

  useEffect(() => {
    if (!isVisible) return;
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isVisible, handleClickOutside]);

  // Keyboard shortcut handler
  useEffect(() => {
    if (!isVisible) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
        return;
      }

      const actions = buildActions(selectedText);
      const match = actions.find(
        (a) => a.shortcut?.toLowerCase() === e.key.toLowerCase()
      );
      if (match && !e.ctrlKey && !e.metaKey && !e.altKey) {
        onAction(match.action);
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isVisible, selectedText, onAction, onDismiss]);

  const actions = buildActions(selectedText);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={toolbarRef}
          initial={{ opacity: 0, scale: 0.9, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 4 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="absolute z-50 flex items-center rounded-md border ide-border ide-surface-pop shadow-lg backdrop-blur-md"
          style={{
            top: position.top - TOOLBAR_OFFSET_Y,
            left: position.left,
          }}
        >
          {actions.map((action, idx) => (
            <React.Fragment key={action.id}>
              {idx > 0 && (
                <div className="h-5 w-px shrink-0 ide-border-subtle bg-stone-200 dark:bg-white/10" />
              )}
              <button
                type="button"
                onClick={() => onAction(action.action)}
                className="flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-xs ide-text-2 transition-colors first:rounded-l-md last:rounded-r-md ide-hover hover:ide-text"
              >
                <span className="flex shrink-0 items-center ide-text-3 group-hover:ide-text">
                  {action.icon}
                </span>
                <span>{action.label}</span>
                {action.shortcut && (
                  <kbd className="ml-1 rounded border ide-border ide-surface-inset px-1 py-0.5 font-mono text-[10px] leading-none ide-text-muted">
                    {action.shortcut}
                  </kbd>
                )}
              </button>
            </React.Fragment>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
