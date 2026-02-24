'use client';

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  useLayoutEffect,
} from 'react';
import { SlashCommandMenu } from './SlashCommandMenu';
import { MentionMenu } from './MentionMenu';
import { SlashHistoryGhost } from './SlashHistoryGhost';
import { getSlashHistory, addToSlashHistory } from '@/lib/storage/slash-history';
import type { SlashCommand } from '@/lib/ai/slash-commands';
import type { MentionResult } from '@/lib/ai/mention-resolver';
import { insertMention } from '@/lib/ai/mention-resolver';

const DRAFT_STORAGE_KEY = (projectId: string) =>
  `synapse-prompt-draft-${projectId}`;
const MAX_LINES = 10;
const LINE_HEIGHT = 22;

interface PromptComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string, mode?: string) => void;
  projectId: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function PromptComposer({
  value,
  onChange,
  onSubmit,
  projectId,
  placeholder = 'Ask anything...',
  disabled = false,
  className = '',
}: PromptComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showSlash, setShowSlash] = useState(false);
  const [showMention, setShowMention] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [mentionQuery, setMentionQuery] = useState('');
  const [anchorRect, setAnchorRect] = useState<DOMRect | undefined>();
  const [cursorPos, setCursorPos] = useState(0);
  const [selectedMode, setSelectedMode] = useState<string | undefined>();
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyItems, setHistoryItems] = useState<string[]>([]);

  const hasRestoredRef = useRef(false);

  // Load slash history on mount
  useEffect(() => {
    if (!projectId) return;
    setHistoryItems(getSlashHistory(projectId));
  }, [projectId]);

  // Restore draft from localStorage on mount (once, when value is empty)
  useEffect(() => {
    if (hasRestoredRef.current || value || !projectId) return;
    hasRestoredRef.current = true;
    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY(projectId));
      if (stored) onChange(stored);
    } catch {
      // ignore
    }
  }, [projectId, value, onChange]);

  // Persist draft to localStorage on change
  useEffect(() => {
    if (!value) return;
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY(projectId), value);
    } catch {
      // ignore
    }
  }, [projectId, value]);

  const updateAnchorRect = useCallback(() => {
    const el = textareaRef.current;
    if (el) setAnchorRect(el.getBoundingClientRect());
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const draft = e.target.value;
      const pos = e.target.selectionStart ?? draft.length;
      onChange(draft);
      setCursorPos(pos);
      setHistoryIndex(-1);
      updateAnchorRect();

      // Slash command: line starts with /
      const lineStart = draft.lastIndexOf('\n', pos - 1) + 1;
      const lineText = draft.slice(lineStart, pos);
      if (lineText.startsWith('/')) {
        setSlashQuery(lineText);
        setShowSlash(true);
        setShowMention(false);
      } else {
        setShowSlash(false);

        // Mention: @ with no space/newline in query
        const lastAt = draft.lastIndexOf('@', pos - 1);
        if (
          lastAt >= 0 &&
          (lastAt === 0 || draft[lastAt - 1] === ' ' || draft[lastAt - 1] === '\n')
        ) {
          const q = draft.slice(lastAt + 1, pos);
          if (!q.includes(' ') && !q.includes('\n')) {
            setMentionQuery(q);
            setShowMention(true);
          } else {
            setShowMention(false);
          }
        } else {
          setShowMention(false);
        }
      }
    },
    [onChange, updateAnchorRect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showSlash || showMention) {
        // Let the menu handle ArrowUp/Down, Enter, Escape
        if (
          e.key === 'ArrowDown' ||
          e.key === 'ArrowUp' ||
          e.key === 'Enter' ||
          e.key === 'Escape'
        ) {
          e.preventDefault();
          return;
        }
      }

      // Slash history navigation (only when both menus are closed)
      if (!showSlash && !showMention) {
        if (e.key === 'ArrowUp' && (value === '' || value.startsWith('/'))) {
          if (historyItems.length > 0) {
            e.preventDefault();
            const nextIndex =
              historyIndex < historyItems.length - 1
                ? historyIndex + 1
                : historyItems.length - 1;
            setHistoryIndex(nextIndex);
            onChange(historyItems[nextIndex]);
          }
          return;
        }
        if (e.key === 'ArrowDown' && historyIndex >= 0) {
          e.preventDefault();
          const nextIndex = historyIndex - 1;
          if (nextIndex < 0) {
            setHistoryIndex(-1);
            onChange('');
          } else {
            setHistoryIndex(nextIndex);
            onChange(historyItems[nextIndex]);
          }
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const trimmed = value.trim();
        if (trimmed) {
          if (trimmed.startsWith('/')) {
            addToSlashHistory(projectId, trimmed);
            setHistoryItems(getSlashHistory(projectId));
          }
          setHistoryIndex(-1);
          onSubmit(trimmed, selectedMode);
          setSelectedMode(undefined);
          onChange('');
          try {
            localStorage.removeItem(DRAFT_STORAGE_KEY(projectId));
          } catch {
            // ignore
          }
        }
      }
    },
    [
      showSlash,
      showMention,
      value,
      selectedMode,
      historyIndex,
      historyItems,
      onSubmit,
      onChange,
      projectId,
    ]
  );

  const handleSlashSelect = useCallback(
    (cmd: SlashCommand) => {
      const lineStart = value.lastIndexOf('\n', cursorPos - 1) + 1;
      const before = value.slice(0, lineStart);
      const after = value.slice(cursorPos);
      const newValue = before + (cmd.promptPrefix ?? '') + after;
      onChange(newValue);
      setShowSlash(false);
      setSelectedMode(cmd.mode);
      const newPos = lineStart + (cmd.promptPrefix?.length ?? 0);
      setCursorPos(newPos);
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(newPos, newPos);
      }, 0);
    },
    [value, cursorPos, onChange]
  );

  const handleSlashClose = useCallback(() => {
    setShowSlash(false);
  }, []);

  const handleMentionSelect = useCallback(
    (mention: MentionResult) => {
      const { newText, newCursorPos } = insertMention(value, cursorPos, mention);
      onChange(newText);
      setShowMention(false);
      setCursorPos(newCursorPos);
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    },
    [value, cursorPos, onChange]
  );

  const handleMentionClose = useCallback(() => {
    setShowMention(false);
  }, []);

  // Auto-resize textarea (up to MAX_LINES, then scroll)
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineCount = (el.value.match(/\n/g)?.length ?? 0) + 1;
    const height = Math.min(lineCount, MAX_LINES) * LINE_HEIGHT;
    el.style.height = `${height}px`;
  }, [value]);

  const ghostText =
    historyIndex > 0 ? historyItems[historyIndex - 1] : null;
  const showGhost = historyIndex >= 0 && !!ghostText;

  return (
    <div className={`relative flex flex-col ${className}`}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="w-full resize-none overflow-y-auto rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder-stone-500"
        style={{ minHeight: LINE_HEIGHT }}
      />
      <SlashHistoryGhost text={ghostText} visible={showGhost} />

      {showSlash && (
        <SlashCommandMenu
          query={slashQuery}
          onSelect={handleSlashSelect}
          onClose={handleSlashClose}
          anchorRect={anchorRect}
        />
      )}

      {showMention && (
        <MentionMenu
          query={mentionQuery}
          projectId={projectId}
          onSelect={handleMentionSelect}
          onClose={handleMentionClose}
          anchorRect={anchorRect}
        />
      )}
    </div>
  );
}
