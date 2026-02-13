'use client';

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { CodeBlock } from './CodeBlock';
import { DiffPreview } from '@/components/features/suggestions/DiffPreview';
import { ElementRefChip } from '@/components/ui/ElementRefChip';
import { SuggestionChips } from './SuggestionChips';
import type { SelectedElement } from '@/components/preview/PreviewPanel';
import type { Suggestion } from '@/lib/ai/prompt-suggestions';
import type { AgentMode, IntentMode } from '@/hooks/useAgentSettings';
import type { OutputMode } from '@/lib/ai/signal-detector';
import { ThinkingBlock, type ThinkingStep } from './ThinkingBlock';
import { PlanApprovalModal, parsePlanSteps, type PlanStep } from './PlanApprovalModal';
import { Square, Search, Paperclip, ChevronDown, Pin, ClipboardCopy, X, Trash2, ImageIcon, Upload, Plus, Pencil, RotateCcw } from 'lucide-react';
import { usePromptProgress } from '@/hooks/usePromptProgress';
import { useContextMeter } from '@/hooks/useContextMeter';
import { ContextMeter } from './ContextMeter';
import { SessionHistory, type ChatSession } from './SessionHistory';
import { detectFilePaths } from '@/lib/ai/file-path-detector';
import { FileText } from 'lucide-react';

/** Try to extract a file name/path from the first line of a code block (e.g. "// sections/header.liquid"). */
function detectFileNameFromCode(code: string): string | undefined {
  const firstLine = code.split('\n')[0]?.trim();
  if (!firstLine) return undefined;
  // Match comment patterns: // path, /* path */, # path, {%- comment -%} path, <!-- path -->
  const commentRe = /^(?:\/\/|\/\*|#|{%-?\s*comment\s*-?%}|<!--)\s*((?:sections|templates|snippets|assets|config|layout|locales|blocks)\/[\w./-]+)/;
  const m = firstLine.match(commentRe);
  return m?.[1] ?? undefined;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Thinking steps emitted during this assistant message (streamed via SSE). */
  thinkingSteps?: ThinkingStep[];
  /** Whether the thinking phase for this message is complete. */
  thinkingComplete?: boolean;
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  onSend: (content: string) => void;
  placeholder?: string;
  className?: string;
  /** When set, displays an element reference chip above the input. */
  selectedElement?: SelectedElement | null;
  /** Called when the user dismisses the selected element chip. */
  onDismissElement?: () => void;
  /** Pre-prompt contextual suggestions (shown when input is empty / no messages). */
  contextSuggestions?: Suggestion[];
  /** Post-response suggestions (shown after the last assistant message). */
  responseSuggestions?: Suggestion[];
  /** Number of files currently loaded in context */
  fileCount?: number;
  /** Called when user clicks Stop to abort streaming */
  onStop?: () => void;
  /** Called when user clicks Review to trigger review mode */
  onReview?: () => void;
  /** Currently selected AI model */
  currentModel?: string;
  /** Called when model is changed */
  onModelChange?: (model: string) => void;
  /** Current agent mode */
  agentMode?: AgentMode;
  /** Called when mode is toggled */
  onModeChange?: (mode: AgentMode) => void;
  /** Whether streaming was stopped by user */
  isStopped?: boolean;
  /** Called when user wants to apply a code block to a file */
  onApplyCode?: (code: string, fileId: string, fileName: string) => void;
  /** Called when user wants to save a code block as new file */
  onSaveCode?: (code: string, fileName: string) => void;
  /** Current editor selection text (for selection injection context) */
  editorSelection?: string | null;
  /** Current AI action for context-specific loading label */
  currentAction?: string;
  /** Number of files being reviewed (used when currentAction is 'review') */
  reviewFileCount?: number;
  /** Called when user clicks Clear chat — clears all messages */
  onClearChat?: () => void;
  /** Called with generated session summary text when chat is cleared */
  onSessionSummary?: (summary: string) => void;
  /** EPIC 2: When true, show "Retry with full context" chip in post-response suggestions */
  showRetryChip?: boolean;
  /** EPIC 5: Output rendering mode based on signal detection */
  outputMode?: OutputMode;
  /** EPIC 8: Called when user pastes/drops an image — uploads and returns AI analysis */
  onImageUpload?: (file: File) => Promise<string>;
  /** EPIC 8: Project ID for image upload context */
  projectId?: string;
  /** Multi-session: all chat sessions for this project */
  sessions?: ChatSession[];
  /** Multi-session: currently active session ID */
  activeSessionId?: string | null;
  /** Multi-session: create a new chat session */
  onNewChat?: () => void;
  /** Multi-session: switch to a different session */
  onSwitchSession?: (sessionId: string) => void;
  /** Multi-session: delete a session */
  onDeleteSession?: (sessionId: string) => void;
  /** Multi-session: rename a session */
  onRenameSession?: (sessionId: string, title: string) => void;
  /** Current intent mode (Ask / Plan / Code / Debug) */
  intentMode?: IntentMode;
  /** Called when the user switches intent mode */
  onIntentModeChange?: (mode: IntentMode) => void;
  /** Called when user edits a message — resends from that point (index, new content) */
  onEditMessage?: (index: number, content: string) => void;
  /** Called when user wants to regenerate the last assistant response */
  onRegenerateMessage?: () => void;
  /** Called when user clicks a file path in an AI response to open it */
  onOpenFile?: (filePath: string) => void;
  /** Current error code from agent (for in-thread display) */
  errorCode?: string | null;
  /** Resolve a file path to a fileId for code block Apply. Returns null if not found. */
  resolveFileId?: (path: string) => string | null;
  /** Number of older messages that were summarized/trimmed */
  trimmedMessageCount?: number;
  /** Summary text of trimmed messages */
  historySummary?: string;
  /** Number of messages that were summarized (for context meter) */
  summarizedCount?: number;
  /** Total files in the project (for context meter "N of M" display) */
  totalFiles?: number;
  /** Whether budget enforcement truncated content (for context meter warning) */
  budgetTruncated?: boolean;
}

function HistorySummaryBlock({ count, summary }: { count: number; summary?: string }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="mx-3 mb-3">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="flex w-full items-center gap-2 rounded-lg ide-surface-inset border ide-border-subtle px-3 py-2 text-left transition-colors ide-hover"
      >
        <svg className="h-3.5 w-3.5 ide-text-muted shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
        </svg>
        <span className="text-xs ide-text-muted font-medium flex-1">
          {count} older message{count !== 1 ? 's' : ''} summarized
        </span>
        <svg
          className={`h-3 w-3 ide-text-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      {expanded && summary && (
        <div className="mt-1 rounded-lg ide-surface-inset border ide-border-subtle px-3 py-2">
          <p className="text-xs ide-text-muted whitespace-pre-wrap">{summary}</p>
        </div>
      )}
    </div>
  );
}

// ── Content renderer with CodeBlock support ────────────────────────────────────

interface ContentSegment {
  type: 'text' | 'code' | 'diff';
  content: string;
  language?: string;
  fileName?: string;
  /** For diff segments: the original code (lines starting with -) */
  originalCode?: string;
  /** For diff segments: the suggested code (lines starting with +) */
  suggestedCode?: string;
}

/** Detect if a code block contains diff-formatted content. */
function isDiffContent(code: string, language?: string): boolean {
  if (language === 'diff') return true;
  const lines = code.split('\n');
  const diffLines = lines.filter(l => l.startsWith('+') || l.startsWith('-'));
  // Consider it a diff if >30% of non-empty lines are diff markers
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  return nonEmpty.length > 2 && diffLines.length / nonEmpty.length > 0.3;
}

/** Parse diff content into original and suggested code. */
function parseDiffContent(code: string): { original: string; suggested: string } {
  const lines = code.split('\n');
  const originalLines: string[] = [];
  const suggestedLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) {
      // Skip diff headers
      continue;
    }
    if (line.startsWith('-')) {
      originalLines.push(line.slice(1));
    } else if (line.startsWith('+')) {
      suggestedLines.push(line.slice(1));
    } else {
      // Context line (no prefix or space prefix)
      const clean = line.startsWith(' ') ? line.slice(1) : line;
      originalLines.push(clean);
      suggestedLines.push(clean);
    }
  }

  return {
    original: originalLines.join('\n'),
    suggested: suggestedLines.join('\n'),
  };
}

function parseContentSegments(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  // Support ```lang or ```lang:filepath (e.g. ```liquid:sections/header.liquid)
  const codeBlockRe = /```(\w*(?::[^\n]*)?)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRe.exec(text)) !== null) {
    // Text before code block
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    // Parse language and optional file name from the fence info string
    const infoString = match[1] || '';
    let language: string | undefined;
    let fileName: string | undefined;

    if (infoString.includes(':')) {
      const [langPart, ...rest] = infoString.split(':');
      language = langPart || undefined;
      fileName = rest.join(':').trim() || undefined;
    } else {
      language = infoString || undefined;
    }

    const code = match[2].replace(/\n$/, ''); // trim trailing newline

    // EPIC 8: Detect diff-formatted code blocks and render as split-diff
    if (isDiffContent(code, language)) {
      const { original, suggested } = parseDiffContent(code);
      segments.push({
        type: 'diff',
        content: code,
        language,
        fileName,
        originalCode: original,
        suggestedCode: suggested,
      });
    } else {
      segments.push({ type: 'code', content: code, language, fileName });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldIdx = remaining.indexOf('**');
    const codeIdx = remaining.indexOf('`');

    if (boldIdx === -1 && codeIdx === -1) {
      parts.push(remaining);
      break;
    }

    const isBoldFirst =
      boldIdx !== -1 && (codeIdx === -1 || boldIdx < codeIdx);

    if (isBoldFirst) {
      if (boldIdx > 0) parts.push(remaining.slice(0, boldIdx));
      const closeIdx = remaining.indexOf('**', boldIdx + 2);
      if (closeIdx === -1) { parts.push(remaining.slice(boldIdx)); break; }
      parts.push(<strong key={`b-${key++}`} className="font-semibold ide-text">{remaining.slice(boldIdx + 2, closeIdx)}</strong>);
      remaining = remaining.slice(closeIdx + 2);
    } else {
      if (codeIdx > 0) parts.push(remaining.slice(0, codeIdx));
      const closeIdx = remaining.indexOf('`', codeIdx + 1);
      if (closeIdx === -1) { parts.push(remaining.slice(codeIdx)); break; }
      parts.push(<code key={`c-${key++}`} className="rounded bg-stone-100 dark:bg-white/10 px-1 py-0.5 text-[0.8em] font-mono text-sky-600 dark:text-sky-300">{remaining.slice(codeIdx + 1, closeIdx)}</code>);
      remaining = remaining.slice(closeIdx + 1);
    }
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/**
 * Render a line of text, replacing detected file paths with clickable chips.
 * Falls back to plain renderInline when onOpenFile is not provided.
 */
function renderInlineWithFiles(
  text: string,
  onOpenFile?: (path: string) => void,
): React.ReactNode {
  if (!onOpenFile) return renderInline(text);

  const filePaths = detectFilePaths(text);
  if (filePaths.length === 0) return renderInline(text);

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const fp of filePaths) {
    // Text before this file path
    if (fp.start > cursor) {
      parts.push(renderInline(text.slice(cursor, fp.start)));
    }

    // File chip
    const fileName = fp.path.split('/').pop() ?? fp.path;
    parts.push(
      <button
        key={`fp-${fp.start}`}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenFile(fp.path);
        }}
        className="inline-flex items-center gap-1 rounded-md bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 px-1.5 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-colors cursor-pointer mx-0.5 align-middle"
        title={`Open ${fp.path}`}
      >
        <FileText className="h-3 w-3" />
        {fileName}
      </button>,
    );

    cursor = fp.end;
  }

  // Remaining text after last file path
  if (cursor < text.length) {
    parts.push(renderInline(text.slice(cursor)));
  }

  return <>{parts}</>;
}

function renderTextContent(text: string, onOpenFile?: (path: string) => void): React.ReactNode {
  if (!text.trim()) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${key++}`} className="list-disc list-inside space-y-0.5 my-1">
          {listItems}
        </ul>
      );
      listItems = [];
    }
  };

  for (const line of lines) {
    const listMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
    if (listMatch) {
      listItems.push(
        <li key={`li-${key++}`}>{renderInlineWithFiles(listMatch[1], onOpenFile)}</li>
      );
      continue;
    }

    flushList();

    if (line.trim() === '') {
      elements.push(<br key={`br-${key++}`} />);
    } else {
      elements.push(
        <p key={`p-${key++}`} className="my-0.5">
          {renderInlineWithFiles(line, onOpenFile)}
        </p>
      );
    }
  }

  flushList();
  return <>{elements}</>;
}

// ── Model options ──────────────────────────────────────────────────────────────

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4', description: 'Fast, balanced' },
  { value: 'claude-opus-4-20250514', label: 'Opus 4', description: 'Most capable' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Google AI' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Fast, efficient' },
];

// ── Action-specific loading labels ────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  analyze: 'Analyzing your request',
  generate: 'Generating code',
  review: 'Reviewing files',
  fix: 'Fixing issues',
  explain: 'Explaining',
  refactor: 'Refactoring code',
  document: 'Generating documentation',
  plan: 'Generating plan',
  summary: 'Summarizing',
};

function getThinkingLabel(action?: string, reviewFileCount?: number): string {
  if (action === 'review' && reviewFileCount != null) {
    return `Reviewing ${reviewFileCount} file${reviewFileCount !== 1 ? 's' : ''}`;
  }
  if (action && action in ACTION_LABELS) return ACTION_LABELS[action];
  return 'Thinking';
}

/** Three dots that pulse sequentially — appended after the thinking label. */
function ThinkingDots() {
  return (
    <span className="inline-flex items-center ml-0.5 gap-[2px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block w-[3px] h-[3px] rounded-full bg-current ai-thinking-shimmer"
          style={{
            animation: 'thinking-dot 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </span>
  );
}

// ── Session summary generator ─────────────────────────────────────────────────

function generateSessionSummary(msgs: ChatMessage[]): string {
  const decisions: string[] = [];
  const codeChanges: string[] = [];
  const openQuestions: string[] = [];

  for (const m of msgs) {
    if (m.role === 'assistant') {
      const lower = m.content.toLowerCase();
      if (lower.includes('decided') || lower.includes('chose') || lower.includes('approach')) {
        decisions.push(m.content.slice(0, 120).replace(/\n/g, ' '));
      }
      if (m.content.includes('```')) {
        codeChanges.push(`Code block at ${m.timestamp.toLocaleTimeString()}`);
      }
    }
    if (m.content.trim().endsWith('?')) {
      openQuestions.push(m.content.slice(0, 100).replace(/\n/g, ' '));
    }
  }

  const parts: string[] = [];
  if (decisions.length) parts.push(`Key decisions:\n${decisions.map(d => `  • ${d}`).join('\n')}`);
  if (codeChanges.length) parts.push(`Code changes:\n${codeChanges.map(c => `  • ${c}`).join('\n')}`);
  if (openQuestions.length) parts.push(`Open questions:\n${openQuestions.map(q => `  • ${q}`).join('\n')}`);

  return parts.length > 0 ? parts.join('\n\n') : 'No key items found in this session.';
}

// ── EPIC 8: Image upload constants ────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

// ── ChatInterface component ───────────────────────────────────────────────────

export function ChatInterface({
  messages,
  isLoading,
  onSend,
  placeholder = 'Ask the agent...',
  className = '',
  selectedElement,
  onDismissElement,
  contextSuggestions = [],
  responseSuggestions = [],
  fileCount = 0,
  onStop,
  onReview,
  currentModel,
  onModelChange,
  agentMode = 'orchestrated',
  onModeChange,
  isStopped = false,
  onApplyCode,
  onSaveCode,
  editorSelection,
  currentAction,
  reviewFileCount,
  onClearChat,
  onSessionSummary,
  showRetryChip = false,
  outputMode,
  onImageUpload,
  sessions = [],
  activeSessionId,
  onNewChat,
  onSwitchSession,
  onDeleteSession,
  onRenameSession,
  intentMode = 'code',
  onIntentModeChange,
  onEditMessage,
  onRegenerateMessage,
  onOpenFile,
  // errorCode — available via prop for future in-thread use
  resolveFileId: resolveFileIdProp,
  trimmedMessageCount = 0,
  historySummary,
  summarizedCount,
  totalFiles,
  budgetTruncated,
}: ChatInterfaceProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** When set, the next submit should edit-and-resend at this message index instead of appending. */
  const editPendingRef = useRef<number | null>(null);
  const [inputHasText, setInputHasText] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<Set<string>>(new Set());
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  // EPIC 5: track the plan key the user has dismissed so modal won't re-show
  const [planDismissedKey, setPlanDismissedKey] = useState('');

  // EPIC 8: Image attachment state
  const [attachedImage, setAttachedImage] = useState<{ file: File; preview: string } | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Prompt progress / countdown
  const promptProgress = usePromptProgress(!!isLoading, currentAction, intentMode);

  // Context window meter
  const contextMeter = useContextMeter(messages, currentModel, fileCount, editorSelection, summarizedCount, totalFiles, budgetTruncated);
  const currentModelOption = MODEL_OPTIONS.find((o) => o.value === currentModel);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, responseSuggestions]);

  // Close model picker when clicking outside
  useEffect(() => {
    if (!showModelPicker) return;
    const handleClick = () => setShowModelPicker(false);
    // Delay to avoid closing on the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [showModelPicker]);

  // Derived: last message in the conversation (used by multiple blocks below)
  const lastMessage = messages[messages.length - 1];

  // ── EPIC 5: Derive plan steps from output mode + last message (no effect) ──
  const planSteps = useMemo((): PlanStep[] => {
    if (outputMode === 'plan' && lastMessage?.role === 'assistant') {
      const steps = parsePlanSteps(lastMessage.content);
      return steps.length >= 2 ? steps : [];
    }
    return [];
  }, [outputMode, lastMessage]);

  const planKey = planSteps.length > 0
    ? planSteps.map(s => s.description).join('|')
    : '';
  // Only auto-open the plan modal when the user explicitly chose Plan intent mode.
  // Otherwise, show an inline "Review Plan" button so it's not intrusive.
  const planModalOpen = planSteps.length > 0 && planDismissedKey !== planKey && intentMode === 'plan';
  const showInlinePlanButton = planSteps.length > 0 && planDismissedKey !== planKey && intentMode !== 'plan';
  const [manualPlanOpen, setManualPlanOpen] = useState(false);

  // ── EPIC 5: Plan modal handlers ──────────────────────────────────────────
  const handlePlanApprove = (steps: PlanStep[]) => {
    setPlanDismissedKey(planKey);
    onSend(`Approved plan. Execute these ${steps.length} steps.`);
  };

  const handlePlanModify = (feedback: string) => {
    setPlanDismissedKey(planKey);
    onSend(`Modify the plan: ${feedback}`);
  };

  // ── Pin toggle ──────────────────────────────────────────────────────────────

  const togglePin = (id: string) => {
    setPinnedMessageIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Copy as reusable prompt ─────────────────────────────────────────────────

  const handleCopyPrompt = (assistantId: string, index: number) => {
    const assistantMsg = messages[index];
    if (!assistantMsg || assistantMsg.role !== 'assistant') return;

    // Find the preceding user message
    let userMsg: ChatMessage | undefined;
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { userMsg = messages[i]; break; }
    }

    const text = userMsg
      ? `Prompt: ${userMsg.content}\nResponse: ${assistantMsg.content}`
      : `Response: ${assistantMsg.content}`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessageId(assistantId);
      setTimeout(() => setCopiedMessageId(null), 1500);
    });
  };

  // ── Copy full response content ────────────────────────────────────────────
  const [copiedResponseId, setCopiedResponseId] = useState<string | null>(null);
  const handleCopyResponse = (msg: ChatMessage) => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopiedResponseId(msg.id);
      setTimeout(() => setCopiedResponseId(null), 1500);
    });
  };

  // ── Clear chat with session summary ─────────────────────────────────────────

  const handleClearChat = () => {
    if (!onClearChat) return;
    const summary = generateSessionSummary(messages);
    setSessionSummary(summary);
    onSessionSummary?.(summary);
    // Auto-dismiss summary after 5 seconds
    setTimeout(() => setSessionSummary(null), 5000);
    onClearChat();
    setPinnedMessageIds(new Set());
  };

  // ── EPIC 8: Image handling ────────────────────────────────────────────────

  const handleImageAttach = useCallback((file: File) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) return;
    if (file.size > MAX_IMAGE_SIZE) return;
    const preview = URL.createObjectURL(file);
    setAttachedImage({ file, preview });
  }, []);

  const handleRemoveImage = useCallback(() => {
    if (attachedImage?.preview) URL.revokeObjectURL(attachedImage.preview);
    setAttachedImage(null);
  }, [attachedImage]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (!onImageUpload) return;
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          handleImageAttach(file);
          return;
        }
      }
    }
  }, [onImageUpload, handleImageAttach]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (onImageUpload) setIsDraggingOver(true);
  }, [onImageUpload]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (!onImageUpload) return;
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('image/')) {
        handleImageAttach(files[i]);
        return;
      }
    }
  }, [onImageUpload, handleImageAttach]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageAttach(file);
    // Reset so same file can be re-selected
    if (e.target) e.target.value = '';
  }, [handleImageAttach]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = inputRef.current?.value?.trim();
    if ((!raw && !attachedImage) || isLoading) return;

    let messageText = raw || '';
    const prefix = selectedElement ? `[${selectedElement.selector}]: ` : '';

    // If image is attached, upload first and include analysis
    if (attachedImage && onImageUpload) {
      setIsUploadingImage(true);
      try {
        const analysis = await onImageUpload(attachedImage.file);
        messageText = prefix + (raw ? `${raw}\n\n[Image analysis]: ${analysis}` : `[Image analysis]: ${analysis}`);
      } catch {
        messageText = prefix + (raw || '[Image attached but analysis failed]');
      } finally {
        setIsUploadingImage(false);
        handleRemoveImage();
      }
    } else {
      messageText = prefix + messageText;
    }

    // If we're editing a previous message, use edit-and-resend instead of appending
    if (editPendingRef.current !== null && onEditMessage) {
      const editIdx = editPendingRef.current;
      editPendingRef.current = null;
      onEditMessage(editIdx, messageText);
    } else if (messageText) {
      onSend(messageText);
    }
    if (inputRef.current) inputRef.current.value = '';
    setInputHasText(false);
    onDismissElement?.();
  };

  const handleSuggestionSelect = (prompt: string) => {
    onSend(prompt);
  };

  // Determine which suggestions to show
  const showPreSuggestions = !inputHasText && messages.length === 0 && !isLoading && contextSuggestions.length > 0;
  const showPostSuggestions = !isLoading && responseSuggestions.length > 0 && messages.length > 0;
  const showPostAfterAssistant = showPostSuggestions && lastMessage?.role === 'assistant';

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${className}`}>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 p-2"
        role="log"
        aria-label="Conversation"
      >
        {/* Session summary banner (shown briefly on clear) */}
        {sessionSummary && (
          <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700/30 rounded-lg p-3 text-xs ide-text-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-sky-500 dark:text-sky-400 uppercase tracking-wider font-medium">Session Summary</span>
              <button
                type="button"
                onClick={() => setSessionSummary(null)}
                className="ide-text-muted hover:ide-text-2 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-sans leading-relaxed">{sessionSummary}</pre>
          </div>
        )}

        {/* Pinned messages */}
        {pinnedMessageIds.size > 0 && messages.some(m => pinnedMessageIds.has(m.id)) && (
          <div className="sticky top-0 z-20 ide-surface-pop backdrop-blur-sm border-b ide-border-subtle rounded-lg p-2 space-y-1.5">
            <p className="text-[10px] text-amber-400/80 uppercase tracking-wider px-1 font-medium flex items-center gap-1">
              <Pin className="h-3 w-3" />
              Pinned
            </p>
            {messages.filter(m => pinnedMessageIds.has(m.id)).map(m => (
              <div
                key={`pin-${m.id}`}
                className={`rounded px-2.5 py-1.5 text-xs leading-relaxed flex items-start justify-between gap-1 ${
                  m.role === 'user'
                    ? 'bg-sky-50 dark:bg-sky-500/10 ide-text-2'
                    : 'ide-surface-inset ide-text-3'
                }`}
              >
                <span className="line-clamp-2">{m.content.replace(/```[\s\S]*?```/g, '[code]')}</span>
                <button
                  type="button"
                  onClick={() => togglePin(m.id)}
                  className="flex-shrink-0 ide-text-quiet hover:ide-text-3 transition-colors"
                  title="Unpin"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Empty state with mode explanations + suggestions */}
        {messages.length === 0 && !isLoading && (
          <div className="py-4 space-y-4">
            <p className="text-sm ide-text-3 text-center">
              What would you like to build?
            </p>
            <div className="grid grid-cols-2 gap-1.5 px-2">
              {[
                { key: 'code', icon: '⌨', label: 'Code', desc: 'Change theme files' },
                { key: 'ask', icon: '?', label: 'Ask', desc: 'Questions about your project' },
                { key: 'plan', icon: '📋', label: 'Plan', desc: 'Step-by-step plans' },
                { key: 'debug', icon: '🔍', label: 'Debug', desc: 'Find and fix issues' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onIntentModeChange?.(item.key as IntentMode)}
                  className={`rounded-md px-2 py-1.5 text-left text-[11px] transition-colors border ${
                    intentMode === item.key
                      ? 'border-sky-400/40 bg-sky-500/10 ide-text'
                      : 'ide-border-subtle ide-surface hover:ide-hover ide-text-muted'
                  }`}
                  aria-label={`Switch to ${item.label} mode: ${item.desc}`}
                >
                  <span className="font-medium">{item.icon} {item.label}</span>
                  <span className="block ide-text-muted text-[10px]">{item.desc}</span>
                </button>
              ))}
            </div>
            {showPreSuggestions && (
              <SuggestionChips
                suggestions={contextSuggestions}
                onSelect={handleSuggestionSelect}
                variant="pre"
              />
            )}
          </div>
        )}

        {/* History summary block (D2) */}
        {trimmedMessageCount > 0 && (
          <HistorySummaryBlock
            count={trimmedMessageCount}
            summary={historySummary}
          />
        )}

        {/* Messages */}
        {messages.map((m, idx) => (
          <div key={m.id} className="group/msg relative">
            {/* Hover action buttons */}
            <div className="absolute -top-1 right-1 hidden group-hover/msg:flex items-center gap-0.5 z-10 ide-surface-pop rounded-md px-0.5 py-0.5 border ide-border-subtle">
              {/* Edit & resend (user messages only) */}
              {m.role === 'user' && onEditMessage && !isLoading && (
                <button
                  type="button"
                  onClick={() => {
                    const el = inputRef.current;
                    if (el) {
                      el.value = m.content;
                      setInputHasText(true);
                      el.focus();
                      // Store the index so submit triggers edit-and-resend
                      editPendingRef.current = idx;
                    }
                  }}
                  className="rounded p-1 ide-text-muted hover:ide-text-2 ide-hover transition-colors"
                  title="Edit and resend"
                  aria-label="Edit and resend this message"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
              {/* Regenerate (last assistant message only) */}
              {m.role === 'assistant' && idx === messages.length - 1 && onRegenerateMessage && !isLoading && (
                <button
                  type="button"
                  onClick={onRegenerateMessage}
                  className="rounded p-1 ide-text-muted hover:ide-text-2 ide-hover transition-colors"
                  title="Regenerate response"
                  aria-label="Regenerate this response"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
              {/* Copy full response (assistant messages) */}
              {m.role === 'assistant' && (
                <button
                  type="button"
                  onClick={() => handleCopyResponse(m)}
                  className="rounded p-1 ide-text-muted hover:ide-text-2 ide-hover transition-colors"
                  title="Copy full response"
                  aria-label="Copy full response"
                >
                  {copiedResponseId === m.id ? (
                    <span className="text-[10px] text-green-400 font-medium px-0.5">Copied!</span>
                  ) : (
                    <ClipboardCopy className="h-3 w-3" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => togglePin(m.id)}
                className={`rounded p-1 transition-colors ${
                  pinnedMessageIds.has(m.id)
                    ? 'text-amber-400 bg-amber-500/10'
                    : 'ide-text-muted hover:ide-text-2 ide-hover'
                }`}
                title={pinnedMessageIds.has(m.id) ? 'Unpin message' : 'Pin message'}
              >
                <Pin className={`h-3 w-3 ${pinnedMessageIds.has(m.id) ? 'fill-current' : ''}`} />
              </button>
              {m.role === 'assistant' && (
                <button
                  type="button"
                  onClick={() => handleCopyPrompt(m.id, idx)}
                  className="rounded p-1 ide-text-muted hover:ide-text-2 ide-hover transition-colors"
                  title="Copy as reusable prompt"
                >
                  {copiedMessageId === m.id ? (
                    <span className="text-[10px] text-green-400 font-medium px-0.5">Copied!</span>
                  ) : (
                    <ClipboardCopy className="h-3 w-3" />
                  )}
                </button>
              )}
            </div>

            <div
              className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-sky-50 dark:bg-sky-500/10 ide-text ml-4'
                  : 'ide-surface-input ide-text-2 mr-4'
              } ${pinnedMessageIds.has(m.id) ? 'ring-1 ring-amber-500/30' : ''}`}
            >
              {m.role === 'assistant' ? (
                <>
                  {/* Thinking block (inline, above response content) */}
                  {m.thinkingSteps && m.thinkingSteps.length > 0 && (
                    <ThinkingBlock
                      steps={m.thinkingSteps}
                      isComplete={m.thinkingComplete ?? false}
                      defaultExpanded={!m.thinkingComplete}
                    />
                  )}
                  {parseContentSegments(m.content).map((seg, i) =>
                    seg.type === 'diff' && seg.originalCode !== undefined && seg.suggestedCode !== undefined ? (
                      <div key={`diff-${i}`} className="my-2">
                        <DiffPreview
                          originalCode={seg.originalCode}
                          suggestedCode={seg.suggestedCode}
                        />
                      </div>
                    ) : seg.type === 'code' ? (() => {
                      const fn = seg.fileName || detectFileNameFromCode(seg.content);
                      const fId = fn && resolveFileIdProp ? resolveFileIdProp(fn) : undefined;
                      return (
                        <CodeBlock
                          key={`code-${i}`}
                          code={seg.content}
                          language={seg.language}
                          fileName={fn}
                          fileId={fId ?? undefined}
                          onApply={onApplyCode}
                          onSave={onSaveCode}
                        />
                      );
                    })() : (
                      <React.Fragment key={`text-${i}`}>
                        {renderTextContent(seg.content, onOpenFile)}
                      </React.Fragment>
                    )
                  )}
                  {/* Blinking caret while streaming */}
                  {isLoading && idx === messages.length - 1 && (
                    <span
                      className="inline-block w-[2px] h-[1.1em] bg-indigo-400 ml-0.5 align-middle rounded-sm ai-streaming-caret"
                      style={{ animation: 'ai-caret-blink 0.8s ease-in-out infinite' }}
                      aria-hidden="true"
                    />
                  )}
                </>
              ) : (
                m.content
              )}
            </div>

            {/* Clarification hint — shows when assistant is asking for more info */}
            {m.role === 'assistant' && !isLoading && idx === messages.length - 1 &&
              /\?\s*$/.test(m.content.trim()) &&
              /(?:could you|can you|please|more detail|clarif|which|what exactly|specify)/i.test(m.content) && (
              <div className="mt-1.5 flex items-center gap-1.5 px-1">
                <span className="text-[10px] ide-text-muted italic">The agent needs more detail.</span>
              </div>
            )}
          </div>
        ))}

        {/* EPIC 5: Output mode badge */}
        {isLoading && outputMode && outputMode !== 'chat' && (
          <div className="px-3 py-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 dark:bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 text-[10px] text-sky-600 dark:text-sky-400">
              {outputMode === 'plan' ? 'Plan mode' : outputMode === 'review' ? 'Review mode' : outputMode === 'fix' ? 'Fix mode' : outputMode}
            </span>
          </div>
        )}

        {/* Loading state with shimmer label and progress bar */}
        {isLoading && (
          <div
            className="rounded-lg px-3 py-2 ide-surface-input space-y-1.5 border ai-thinking-pulse-border"
            style={{ animation: 'ai-thinking-pulse 3s ease-in-out infinite' }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-sm font-medium italic ai-thinking-shimmer"
                style={{
                  background: 'linear-gradient(90deg, rgba(148,163,184,0.6) 0%, rgba(199,210,254,0.9) 50%, rgba(148,163,184,0.6) 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'ai-shimmer 2s ease-in-out infinite',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {getThinkingLabel(currentAction, reviewFileCount)}
                <ThinkingDots />
              </span>
              {promptProgress.secondsRemaining != null && (
                <span className="text-[10px] tabular-nums ide-text-quiet font-mono">
                  ~{promptProgress.secondsRemaining}s
                </span>
              )}
            </div>
            {/* Progress track */}
            <div className="h-1 rounded-full bg-stone-200 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent/70 transition-all duration-150 ease-out"
                style={{ width: `${promptProgress.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Inline "Review Plan" button (when plan detected but not in Plan intent mode) */}
        {showInlinePlanButton && (
          <div className="pt-1 px-1">
            <button
              type="button"
              onClick={() => setManualPlanOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-emerald-400 text-xs font-medium hover:bg-emerald-500/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                <path d="M9 14l2 2 4-4" />
              </svg>
              Review Plan ({planSteps.length} steps)
            </button>
          </div>
        )}

        {/* Post-response suggestions (after last assistant message) */}
        {showPostAfterAssistant && (
          <div className="pt-1">
            <p className="text-[10px] ide-text-quiet uppercase tracking-wider mb-1.5 px-1">Next steps</p>
            <SuggestionChips
              suggestions={responseSuggestions}
              onSelect={handleSuggestionSelect}
              variant="post"
              showRetryChip={showRetryChip}
            />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t ide-border-subtle">
        {/* Consolidated context row: badges + element chip + image + inline suggestions */}
        {(fileCount > 0 || editorSelection || selectedElement || attachedImage || (!showPreSuggestions && !inputHasText && !isLoading && contextSuggestions.length > 0 && messages.length > 0)) && (
          <div className="flex items-center gap-1.5 px-3 py-1 flex-wrap border-b ide-border-subtle">
            {fileCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full ide-surface-inset px-2 py-0.5 text-[10px] ide-text-3">
                <Paperclip className="h-2.5 w-2.5" />
                {fileCount}
              </span>
            )}
            {editorSelection && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-400 truncate max-w-[160px]">
                {editorSelection.slice(0, 30)}{editorSelection.length > 30 ? '...' : ''}
              </span>
            )}
            {selectedElement && (
              <ElementRefChip element={selectedElement} onDismiss={onDismissElement} />
            )}
            {attachedImage && (
              <span className="inline-flex items-center gap-1.5 rounded-full ide-surface-inset px-2 py-0.5 text-[10px] ide-text-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- blob URL */}
                <img src={attachedImage.preview} alt="" className="h-4 w-4 rounded object-cover" />
                <span className="truncate max-w-[80px]">{attachedImage.file.name}</span>
                <button type="button" onClick={handleRemoveImage} className="ide-text-muted hover:ide-text-2">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            {/* Inline suggestion chips (compact, max 2) */}
            {!showPreSuggestions && !inputHasText && !isLoading && contextSuggestions.length > 0 && messages.length > 0 && (
              <SuggestionChips
                suggestions={contextSuggestions.slice(0, 2)}
                onSelect={handleSuggestionSelect}
                variant="pre"
              />
            )}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="px-3 py-2"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Hidden file input for image attachment */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleFileSelect}
          />

          <div className={`relative ${isDraggingOver ? 'ring-2 ring-sky-500/50 dark:ring-sky-400/50 rounded-lg' : ''}`}>
            <textarea
              ref={inputRef}
              name="message"
              rows={2}
              placeholder={attachedImage ? 'Describe what you want to do with this image...' : placeholder}
              disabled={isLoading || isUploadingImage}
              className="w-full rounded-lg border ide-border ide-surface-input px-3 py-2 text-sm ide-text placeholder-stone-400 dark:placeholder-white/40 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50 disabled:opacity-50 resize-none"
              onChange={(e) => setInputHasText(e.target.value.trim().length > 0)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
                // Escape: stop streaming
                if (e.key === 'Escape' && isLoading && onStop) {
                  e.preventDefault();
                  onStop();
                }
                // Up arrow on empty input: recall last user message
                const target = e.target as HTMLTextAreaElement;
                if (e.key === 'ArrowUp' && !target.value?.trim()) {
                  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                  if (lastUserMsg) {
                    e.preventDefault();
                    target.value = lastUserMsg.content;
                    setInputHasText(true);
                  }
                }
              }}
              onPaste={handlePaste}
            />

            {/* Drag-drop overlay */}
            {isDraggingOver && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-sky-500/10 dark:bg-sky-500/10 border-2 border-dashed border-sky-500/40 pointer-events-none">
                <div className="flex items-center gap-2 text-sm text-sky-600 dark:text-sky-400">
                  <Upload className="h-4 w-4" />
                  Drop image here
                </div>
              </div>
            )}
          </div>

          {/* Keyboard hint */}
          <div className="flex items-center justify-end px-1 mt-0.5">
            <span className="text-[10px] ide-text-muted select-none">
              Enter to send · Shift+Enter for new line
            </span>
          </div>

          {/* Action bar */}
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-1.5">
              {/* Model picker */}
              {onModelChange && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowModelPicker(p => !p); }}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] ide-text-3 ide-surface-inset border ide-border hover:border-stone-300 dark:hover:border-white/20 hover:ide-text-2 transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
                  >
                    <span className="truncate max-w-[100px]">{currentModel?.split('-').slice(0, 2).join(' ') || 'Model'}</span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {showModelPicker && (
                    <div className="absolute bottom-full left-0 mb-1 w-56 rounded-lg border ide-border ide-surface-pop shadow-xl z-50 py-1">
                      {MODEL_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => { onModelChange(opt.value); setShowModelPicker(false); }}
                          className={`w-full text-left px-3 py-1.5 text-xs ide-hover transition-colors ${
                            currentModel === opt.value ? 'text-emerald-400' : 'ide-text-2'
                          }`}
                        >
                          <div className="font-medium">{opt.label}</div>
                          <div className="text-[10px] ide-text-muted">{opt.description}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Orchestrated / Solo toggle */}
              {onModeChange && (
                <button
                  type="button"
                  onClick={() => onModeChange(agentMode === 'orchestrated' ? 'solo' : 'orchestrated')}
                  className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] border transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none ${
                    agentMode === 'solo'
                      ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                      : 'ide-text-3 ide-surface-inset ide-border hover:border-stone-300 dark:hover:border-white/20'
                  }`}
                  title={agentMode === 'orchestrated' ? 'Multi-agent mode: PM delegates to specialists' : 'Solo mode: single-pass generation'}
                  aria-label={agentMode === 'orchestrated' ? 'Switch to solo mode' : 'Switch to team mode'}
                >
                  {agentMode === 'solo' ? 'Solo' : 'Team'}
                </button>
              )}

              {/* Intent mode pills — unified emerald accent */}
              {onIntentModeChange && (
                <div className="flex items-center gap-0.5 rounded ide-surface-input border ide-border-subtle p-0.5" role="tablist" aria-label="Agent intent mode">
                  {([
                    { mode: 'ask' as IntentMode, label: 'Ask', tip: 'Ask questions about your code' },
                    { mode: 'plan' as IntentMode, label: 'Plan', tip: 'Get a plan before making changes' },
                    { mode: 'code' as IntentMode, label: 'Code', tip: 'Generate code changes — full agent pipeline' },
                    { mode: 'debug' as IntentMode, label: 'Debug', tip: 'Diagnose and fix issues' },
                  ] as const).map(({ mode, label, tip }) => {
                    const isActive = intentMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-label={tip}
                        onClick={() => onIntentModeChange(mode)}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium border transition-all focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none ${
                          isActive
                            ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/40'
                            : 'ide-text-3 border-transparent hover:ide-text-2 ide-hover'
                        }`}
                        title={tip}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* EPIC 8: Image attachment button */}
              {onImageUpload && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] border transition-colors ${
                    attachedImage
                      ? 'text-sky-500 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/30'
                      : 'ide-text-3 ide-surface-inset ide-border hover:border-stone-300 dark:hover:border-white/20'
                  }`}
                  title="Attach image for AI analysis"
                >
                  <ImageIcon className="h-3 w-3" />
                  {isUploadingImage ? 'Uploading...' : attachedImage ? '1 image' : ''}
                </button>
              )}

              {/* Context window meter */}
              <ContextMeter meter={contextMeter} modelLabel={currentModelOption?.label} onNewChat={onNewChat} />

              {/* Session history */}
              {onSwitchSession && (
                <SessionHistory
                  sessions={sessions}
                  activeSessionId={activeSessionId ?? null}
                  onSwitch={onSwitchSession}
                  onNew={onNewChat ?? (() => {})}
                  onDelete={onDeleteSession}
                  onRename={onRenameSession}
                />
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {/* Stop button (visible during streaming) */}
              {isLoading && onStop && (
                <button
                  type="button"
                  onClick={onStop}
                  className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
                  aria-label="Stop generation"
                >
                  <Square className="h-3 w-3 fill-current" />
                  Stop
                </button>
              )}

              {/* Stopped state with Resend/Edit actions */}
              {!isLoading && isStopped && (
                <div className="inline-flex items-center gap-1.5">
                  <span className="rounded bg-stone-200 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-medium ide-text-muted">Stopped</span>
                  {onRegenerateMessage && (
                    <button
                      type="button"
                      onClick={onRegenerateMessage}
                      className="rounded px-1.5 py-0.5 text-[10px] text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 transition-colors"
                      aria-label="Resend last message"
                    >
                      Resend
                    </button>
                  )}
                </div>
              )}

              {/* New chat button */}
              {onNewChat && !isLoading && (
                <button
                  type="button"
                  onClick={onNewChat}
                  className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs ide-text-muted ide-hover hover:ide-text-2 transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
                  title="New chat"
                  aria-label="New chat"
                >
                  <Plus className="h-3 w-3" />
                </button>
              )}

              {/* Clear chat button */}
              {onClearChat && !isLoading && messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearChat}
                  className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs ide-text-muted ide-hover hover:ide-text-2 transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
                  title="Clear chat"
                  aria-label="Clear chat"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}

              {/* Review button */}
              {onReview && !isLoading && messages.length > 0 && (
                <button
                  type="button"
                  onClick={onReview}
                  className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs ide-text-3 ide-hover hover:ide-text transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
                  aria-label="Review changes"
                >
                  <Search className="h-3 w-3" />
                  Review
                </button>
              )}

              {/* Send button */}
              <button
                type="submit"
                disabled={isLoading || isUploadingImage}
                className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
              >
                {isUploadingImage ? 'Uploading…' : isLoading ? 'Running…' : 'Send'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* EPIC 5: Plan approval modal */}
      <PlanApprovalModal
        steps={planSteps}
        isOpen={planModalOpen || manualPlanOpen}
        onApprove={(steps) => { setManualPlanOpen(false); handlePlanApprove(steps); }}
        onModify={(fb) => { setManualPlanOpen(false); handlePlanModify(fb); }}
        onCancel={() => { setManualPlanOpen(false); setPlanDismissedKey(planKey); }}
      />
    </div>
  );
}
