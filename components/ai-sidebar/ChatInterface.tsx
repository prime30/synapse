'use client';

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { ElementRefChip } from '@/components/ui/ElementRefChip';
import { SuggestionChips } from './SuggestionChips';
import type { SelectedElement } from '@/components/preview/PreviewPanel';
import type { Suggestion } from '@/lib/ai/prompt-suggestions';
import type { AgentMode, IntentMode, MaxAgents } from '@/hooks/useAgentSettings';
import type { OutputMode } from '@/lib/ai/signal-detector';
import { ThinkingBlock, type ThinkingStep } from './ThinkingBlock';
import { ProgressRail } from './ProgressRail';
import { deriveRailSteps } from '@/lib/agents/phase-mapping';
import type { ExecutionMode } from '@/lib/agents/phase-mapping';
import { PlanApprovalModal, parsePlanSteps, type PlanStep } from './PlanApprovalModal';
import { PlanCard } from './PlanCard';
import { ReviewBlock } from './ReviewBlock';
import { ClarificationCard } from './ClarificationCard';
import { PreviewNavToast } from './PreviewNavToast';
import { FileCreateCard } from './FileCreateCard';
import { FileOperationToast } from './FileOperationToast';
import { ShopifyOperationCard } from './ShopifyOperationCard';
import { ScreenshotCard } from './ScreenshotCard';
import { CitationsBlock } from './CitationsBlock';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Square, Search, Paperclip, ChevronDown, Pin, ClipboardCopy, X, Trash2, ImageIcon, Upload, Plus, Pencil, RotateCcw, BookOpen, GitBranch } from 'lucide-react';
import { PromptTemplateLibrary } from './PromptTemplateLibrary';
import { ShareButton } from './ShareButton';
import { ConflictResolver } from './ConflictResolver';
import { AnimatePresence, motion } from 'framer-motion';
import { safeTransition } from '@/lib/accessibility';
import { usePromptProgress } from '@/hooks/usePromptProgress';
import { useContextMeter } from '@/hooks/useContextMeter';
import { ContextMeter } from './ContextMeter';
import type { ChatSession } from './SessionHistory';

/** Sanitize user message content for the sticky prompt banner. */
function sanitizeForStickyPrompt(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/!\[.*?\]\(.*?\)/g, '[image]')
    .trim();
}

/**
 * Regex to detect CSS selector-like references in user messages.
 * Matches patterns like `[header#shopify-section-header > div.wrapper]:`
 * that were historically baked into the user message.
 */
const SELECTOR_REF_PATTERN = /^\[([^\]]{5,})\]:\s*/;

/**
 * Regex to detect IDE context metadata blocks that may exist in older stored messages.
 * Strips `[IDE Context] ...` through to the first double-newline boundary.
 */
const IDE_CONTEXT_PATTERN = /\[IDE Context\][^\n]*(?:\n(?!\n)[^\n]*)*/g;

/**
 * Strips metadata prefixes from legacy stored messages and renders
 * element-selector references as compact token pills.
 */
function UserMessageContent({ content }: { content: string }) {
  // Strip any residual IDE context metadata (for backward compat with stored messages)
  let cleaned = content.replace(IDE_CONTEXT_PATTERN, '').trim();

  // Check for a leading selector reference
  const selectorMatch = cleaned.match(SELECTOR_REF_PATTERN);
  let selectorChip: React.ReactNode = null;
  if (selectorMatch) {
    const selector = selectorMatch[1];
    // Build a short human-readable label from the selector
    const label = selector.length > 40 ? selector.slice(0, 37) + '...' : selector;
    selectorChip = (
      <span
        className="inline-flex items-center rounded-md border ide-border ide-surface-panel px-2 py-1 text-[11px] font-mono text-sky-500 dark:text-sky-400 self-start truncate max-w-full"
        title={selector}
      >
        {label}
      </span>
    );
    cleaned = cleaned.slice(selectorMatch[0].length);
  }

  // Strip [Selected code in editor] and [Full file context] blocks (legacy stored messages)
  cleaned = cleaned
    .replace(/\[Selected code in editor\]:[\s\S]*?```\n*/g, '')
    .replace(/\[Full file context[^\]]*\]:[\s\S]*?```\n*/g, '')
    .trim();

  if (!cleaned && !selectorChip) return null;

  return (
    <div className="flex flex-col gap-2">
      {selectorChip}
      {cleaned && <span>{cleaned}</span>}
    </div>
  );
}

// PlanStep is now unified in PlanApprovalModal (supports both `text` and `description`)
export type { PlanStep } from './PlanApprovalModal';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Thinking steps emitted during this assistant message (streamed via SSE). */
  thinkingSteps?: ThinkingStep[];
  /** Whether the thinking phase for this message is complete. */
  thinkingComplete?: boolean;
  /** Context stats from the agent pipeline for accurate ContextMeter display. */
  contextStats?: { loadedFiles: number; loadedTokens: number; totalFiles: number };
  /** Whether budget enforcement truncated content during this request. */
  budgetTruncated?: boolean;
  /** Phase 8: Parallel worker progress data. */
  workers?: Array<{ workerId: string; label: string; status: 'running' | 'complete' }>;

  // ── Tool card metadata (Phase 3) ────────────────────────────────────
  /** Proposed implementation plan from propose_plan tool. */
  planData?: { title: string; description: string; steps: PlanStep[]; filePath?: string };
  /** Proposed code edits from propose_code_edit tool. */
  codeEdits?: Array<{ filePath: string; reasoning?: string; newContent: string; originalContent?: string; status: 'pending' | 'applied' | 'rejected' }>;
  /** Clarification question from ask_clarification tool or SSE clarification event. */
  clarification?: { question: string; options: Array<{ id: string; label: string; recommended?: boolean }>; allowMultiple?: boolean };
  /** Preview navigation from navigate_preview tool. */
  previewNav?: { path: string; description?: string };
  /** New file creation from create_file tool. */
  fileCreates?: Array<{ fileName: string; content: string; reasoning?: string; status: 'pending' | 'confirmed' | 'cancelled' }>;
  /** Currently active tool call (loading state). */
  activeToolCall?: { name: string; id: string };
  /** Citation references from the citations API. */
  citations?: Array<{ citedText: string; documentTitle: string; startIndex?: number; endIndex?: number }>;

  // ── Agent Power Tools card metadata (Phase 7) ──────────────────────
  /** File mutation operations (write, delete, rename) from agent tools. */
  fileOps?: Array<{ type: 'write' | 'delete' | 'rename'; fileName: string; success: boolean; error?: string; newFileName?: string }>;
  /** Shopify operation results from agent tools. */
  shopifyOps?: Array<{ type: 'push' | 'pull' | 'list_themes' | 'list_resources' | 'get_asset'; status: 'pending' | 'success' | 'error'; summary: string; detail?: string; error?: string }>;
  /** Screenshot capture results from agent tools. */
  screenshots?: Array<{ url: string; storeDomain?: string; themeId?: string; path?: string; error?: string }>;
  /** Screenshot comparison result from agent tools. */
  screenshotComparison?: { beforeUrl: string; afterUrl: string; diffPercentage?: number; threshold?: number; passed?: boolean };
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
  /** Max sub-agents per specialist (1-4) */
  maxAgents?: MaxAgents;
  /** Called when the user changes the max agent count */
  onMaxAgentsChange?: (count: MaxAgents) => void;
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

  // ── Tool card handlers (Phase 3) ──────────────────────────────────
  /** Called when user clicks "View Plan" — opens the plan file in an editor tab. */
  onOpenPlanFile?: (filePath: string) => void;
  /** Called when user clicks "Build" on a plan card with selected step numbers. */
  onBuildPlan?: (checkedSteps: Set<number>) => void;
  /** Called when navigate_preview auto-navigates — sets preview path. */
  onNavigatePreview?: (path: string) => void;
  /** Called when user confirms a new file creation from create_file tool. */
  onConfirmFileCreate?: (fileName: string, content: string) => void;
  /** Called when an edit status changes (applied/rejected) — for persisting status. */
  onEditStatusChange?: (messageId: string, editIndex: number, status: 'applied' | 'rejected') => void;
  /** Phase 3b: Called when attached files change (drag-and-drop from file tree). */
  onAttachedFilesChange?: (files: Array<{ id: string; name: string; path: string }>) => void;
  /** Phase 4b: Whether verbose/inner monologue is active */
  verbose?: boolean;
  /** Phase 4b: Toggle verbose mode */
  onToggleVerbose?: () => void;
  /** Phase 5a: Fork conversation at a message index */
  onForkAtMessage?: (messageIndex: number) => void;
  /** Phase 6a: Called when user pins/unpins a message as a preference */
  onPinAsPreference?: (content: string) => void;
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

// Content rendering is handled by MarkdownRenderer component.

// ── Model options ──────────────────────────────────────────────────────────────

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5', description: 'Fast, balanced' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6', description: 'Most capable' },
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
  // Sessions are managed by SessionSidebar in AgentPromptPanel; these props remain
  // for backward compatibility but are no longer used in ChatInterface directly.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sessions: _sessions = [],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  activeSessionId: _activeSessionId,
  onNewChat,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onSwitchSession: _onSwitchSession,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDeleteSession: _onDeleteSession,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onRenameSession: _onRenameSession,
  intentMode = 'code',
  onIntentModeChange,
  maxAgents = 1,
  onMaxAgentsChange,
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
  onOpenPlanFile,
  onBuildPlan,
  onNavigatePreview,
  onConfirmFileCreate,
  onEditStatusChange,
  onAttachedFilesChange,
  verbose,
  onToggleVerbose,
  onForkAtMessage,
  projectId,
  activeSessionId,
  onPinAsPreference,
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
  // Scroll-to-bottom button state
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  // Sticky last-prompt banner
  const [stickyPromptDismissedId, setStickyPromptDismissedId] = useState<string | null>(null);
  const lastUserMessage = useMemo(() => [...messages].reverse().find(m => m.role === 'user'), [messages]);
  const showStickyPrompt = !!(
    lastUserMessage
    && messages.length >= 2
    && messages[messages.length - 1]?.role === 'assistant'
    && stickyPromptDismissedId !== lastUserMessage.id
  );

  // EPIC 8: Image attachment state
  const [attachedImage, setAttachedImage] = useState<{ file: File; preview: string } | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase 3b: Attached files (dragged from file tree)
  const [attachedFiles, setAttachedFiles] = useState<Array<{ id: string; name: string; path: string }>>([]);

  // Phase 3c: Template library
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  useEffect(() => { onAttachedFilesChange?.(attachedFiles); }, [attachedFiles, onAttachedFilesChange]);

  // Prompt progress / countdown
  const promptProgress = usePromptProgress(!!isLoading, currentAction, intentMode);

  // Context window meter
  const contextMeter = useContextMeter(messages, currentModel, fileCount, editorSelection, summarizedCount, totalFiles, budgetTruncated);
  const currentModelOption = MODEL_OPTIONS.find((o) => o.value === currentModel);

  // Auto-scroll to bottom (only when user hasn't scrolled up)
  useEffect(() => {
    if (!userScrolledUp) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, responseSuggestions, userScrolledUp]);

  // Track user scroll position for scroll-to-bottom button
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const threshold = 100; // px from bottom
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      setUserScrolledUp(!isAtBottom);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Reset scroll state when streaming completes
  useEffect(() => {
    if (!isLoading) setUserScrolledUp(false);
  }, [isLoading]);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    setUserScrolledUp(false);
  }, []);

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
    ? planSteps.map(s => s.description ?? s.text ?? '').join('|')
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
    const wasAlreadyPinned = pinnedMessageIds.has(id);
    setPinnedMessageIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Phase 6a: Save to memory when pinning (not unpinning)
    if (!wasAlreadyPinned && onPinAsPreference) {
      const msg = messages.find(m => m.id === id);
      if (msg) {
        // Extract a concise rule from the message content
        const content = msg.content.replace(/```[\s\S]*?```/g, '').trim();
        const rule = content.length > 200 ? content.slice(0, 200) + '...' : content;
        onPinAsPreference(rule);
      }
    }
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
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    // Phase 3b: Handle file drops from file tree
    const synapseFile = e.dataTransfer.getData('application/synapse-file');
    if (synapseFile) {
      try {
        const fileData = JSON.parse(synapseFile) as { id: string; name: string; path: string };
        setAttachedFiles((prev) => {
          if (prev.some((f) => f.id === fileData.id)) return prev;
          return [...prev, fileData];
        });
        return;
      } catch { /* ignore parse errors */ }
    }

    // Existing: Handle image drops
    if (!onImageUpload) return;
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('image/')) {
        handleImageAttach(files[i]);
        return;
      }
    }
  }, [onImageUpload, handleImageAttach]);

  const handleRemoveAttachedFile = useCallback((fileId: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

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

    // If image is attached, upload first and include analysis
    if (attachedImage && onImageUpload) {
      setIsUploadingImage(true);
      try {
        const analysis = await onImageUpload(attachedImage.file);
        messageText = raw ? `${raw}\n\n[Image analysis]: ${analysis}` : `[Image analysis]: ${analysis}`;
      } catch {
        messageText = raw || '[Image attached but analysis failed]';
      } finally {
        setIsUploadingImage(false);
        handleRemoveImage();
      }
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
    setAttachedFiles([]);
    onDismissElement?.();
  };

  const handleSuggestionSelect = (prompt: string) => {
    onSend(prompt);
  };

  // Return focus to input when loading completes so user can respond immediately
  useEffect(() => {
    if (!isLoading && inputRef.current) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  // Determine which suggestions to show
  const showPreSuggestions = !inputHasText && messages.length === 0 && !isLoading && contextSuggestions.length > 0;
  const showPostSuggestions = !isLoading && responseSuggestions.length > 0 && messages.length > 0;
  const showPostAfterAssistant = showPostSuggestions && lastMessage?.role === 'assistant';

  // Compute rail steps from the active streaming message
  const activeRailSteps = useMemo(() => {
    if (!isLoading) return [];
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const steps = lastAssistant?.thinkingSteps;
    if (!steps || steps.length === 0) return [];
    // Determine execution mode from intent + agent mode
    let execMode: ExecutionMode = 'orchestrated';
    if (intentMode === 'ask') return []; // No rail for ask mode
    if (intentMode === 'plan') execMode = 'plan';
    else if (agentMode === 'solo') execMode = 'solo';
    return deriveRailSteps(steps, execMode);
  }, [isLoading, messages, intentMode, agentMode]);

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${className}`}>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 p-2"
        role="log"
        aria-label="Conversation"
        aria-busy={isLoading || false}
      >
        {/* Progress rail (sticky at top during streaming) */}
        <ProgressRail
          steps={activeRailSteps}
          isStreaming={!!isLoading}
          onStop={onStop}
        />

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
                className="rounded px-2.5 py-1.5 text-xs leading-relaxed flex items-start justify-between gap-1 ide-surface-inset ide-text-2"
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
          <div className="py-6 space-y-4">
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-xl ide-surface-inset border ide-border flex items-center justify-center">
                <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a9 9 0 0 1 9 9c0 3.9-3.2 7.2-6.4 9.8a2.1 2.1 0 0 1-2.6 0h0A23.3 23.3 0 0 1 3 11a9 9 0 0 1 9-9Z" />
                  <circle cx="12" cy="11" r="3" />
                </svg>
              </div>
              <p className="text-sm ide-text-2 font-medium">Synapse AI</p>
              <p className="text-xs ide-text-3 text-center">What would you like to build?</p>
            </div>
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

        {/* Sticky last-prompt banner */}
        <AnimatePresence>
          {showStickyPrompt && lastUserMessage && (
            <motion.div
              key="sticky-prompt"
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={safeTransition(0.15)}
              className="sticky top-0 z-10 ide-surface-pop backdrop-blur-sm border-b ide-border-subtle px-3 py-1.5 flex items-start justify-between gap-2"
            >
              <p className="text-xs ide-text-2 line-clamp-2 border-l-2 border-sky-500/30 pl-2 flex-1 min-w-0">
                {sanitizeForStickyPrompt(lastUserMessage.content)}
              </p>
              <button
                type="button"
                onClick={() => setStickyPromptDismissedId(lastUserMessage.id)}
                className="flex-shrink-0 mt-0.5 ide-text-muted hover:ide-text-2 transition-colors"
                title="Dismiss"
                aria-label="Dismiss sticky prompt"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages */}
        {messages.map((m, idx) => (
          <div key={m.id} className={`group/msg relative transition-colors ${m.role === 'assistant' ? 'rounded-md group-hover/msg:bg-stone-50/50 dark:group-hover/msg:bg-white/[0.02]' : ''}`}>
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
                    <span className="text-[10px] text-accent font-medium px-0.5">Copied!</span>
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
                    <span className="text-[10px] text-accent font-medium px-0.5">Copied!</span>
                  ) : (
                    <ClipboardCopy className="h-3 w-3" />
                  )}
                </button>
              )}
              {/* Phase 5a: Fork conversation */}
              {onForkAtMessage && m.role === 'assistant' && (
                <button
                  type="button"
                  onClick={() => onForkAtMessage(idx)}
                  className="rounded p-1 ide-text-muted hover:ide-text-2 ide-hover transition-colors"
                  title="Fork conversation from here"
                >
                  <GitBranch className="h-3 w-3" />
                </button>
              )}
            </div>

            <div
              className={`text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'rounded-md px-3 py-2 ide-surface-inset ide-text'
                  : 'px-3 py-1 ide-text'
              } ${pinnedMessageIds.has(m.id) ? 'ring-1 ring-amber-500/30' : ''}`}
            >
              {m.role === 'assistant' ? (
                <>
                  {/* Thinking block (inline, above response content) with progress bar */}
                  {m.thinkingSteps && m.thinkingSteps.length > 0 && (
                    <ThinkingBlock
                      steps={m.thinkingSteps}
                      isComplete={m.thinkingComplete ?? false}
                      defaultExpanded={!m.thinkingComplete}
                      isStreaming={isLoading && idx === messages.length - 1}
                      progress={isLoading && idx === messages.length - 1 ? promptProgress.progress : undefined}
                      secondsRemaining={isLoading && idx === messages.length - 1 ? promptProgress.secondsRemaining : undefined}
                      onOpenFile={onOpenFile}
                      verbose={verbose}
                      onToggleVerbose={onToggleVerbose}
                      workers={m.workers}
                    />
                  )}
                  {/* Markdown-rendered content */}
                  <MarkdownRenderer
                    content={m.content}
                    onOpenFile={onOpenFile}
                    onApplyCode={onApplyCode}
                    onSaveCode={onSaveCode}
                    resolveFileId={resolveFileIdProp}
                  />

                  {/* Tool cards (Phase 3) */}
                  <div aria-live="polite">
                    {/* Loading skeleton for active tool call */}
                    {m.activeToolCall && (
                      <div
                        className="my-2 rounded-lg border ide-border ide-surface-inset p-3 animate-pulse"
                        role="status"
                        aria-live="polite"
                        aria-label={`Loading tool: ${m.activeToolCall.name}`}
                      >
                        <div className="h-2.5 w-24 rounded ide-surface-input mb-2" />
                        <div className="h-2 w-40 rounded ide-surface-input" />
                      </div>
                    )}
                    {m.planData && (
                      <PlanCard
                        planData={m.planData}
                        onOpenPlanFile={onOpenPlanFile}
                        onBuildPlan={onBuildPlan}
                      />
                    )}
                    {m.codeEdits && m.codeEdits.length > 0 && (() => {
                      // Phase 8c: Detect file conflicts (multiple edits to same file)
                      const fileMap = new Map<string, number[]>();
                      m.codeEdits!.forEach((edit, i) => {
                        const existing = fileMap.get(edit.filePath) || [];
                        existing.push(i);
                        fileMap.set(edit.filePath, existing);
                      });
                      const conflicts = Array.from(fileMap.entries())
                        .filter(([, indices]) => indices.length > 1)
                        .map(([filePath, indices]) => ({
                          filePath,
                          edits: indices.map(i => ({
                            agentId: String(i),
                            agentLabel: 'Edit ' + (i + 1),
                            newContent: m.codeEdits![i].newContent,
                            reasoning: m.codeEdits![i].reasoning,
                          })),
                        }));

                      return (
                        <>
                          {conflicts.length > 0 && (
                            <ConflictResolver
                              conflicts={conflicts}
                              onResolve={(filePath, selectedAgentId) => {
                                // Reject all non-selected edits for this file
                                const indices = fileMap.get(filePath) || [];
                                for (const i of indices) {
                                  if (String(i) !== selectedAgentId) {
                                    onEditStatusChange?.(m.id, i, 'rejected');
                                  }
                                }
                              }}
                              onResolveAll={() => {
                                // Auto-resolve: keep first edit, reject rest
                                for (const [, indices] of fileMap.entries()) {
                                  if (indices.length > 1) {
                                    for (let k = 1; k < indices.length; k++) {
                                      onEditStatusChange?.(m.id, indices[k], 'rejected');
                                    }
                                  }
                                }
                              }}
                            />
                          )}
                          <ReviewBlock
                            edits={m.codeEdits!}
                            onApplyCode={onApplyCode}
                            resolveFileId={resolveFileIdProp}
                            onOpenFile={onOpenFile}
                            onEditStatusChange={(editIdx, status) => onEditStatusChange?.(m.id, editIdx, status)}
                          />
                        </>
                      );
                    })()}
                    {m.clarification && (
                      <ClarificationCard
                        question={m.clarification.question}
                        options={m.clarification.options}
                        allowMultiple={m.clarification.allowMultiple}
                        onSend={onSend}
                      />
                    )}
                    {m.previewNav && (
                      <PreviewNavToast
                        path={m.previewNav.path}
                        description={m.previewNav.description}
                      />
                    )}
                    {m.fileCreates?.map((fc, fcIdx) => (
                      <FileCreateCard
                        key={`${m.id}-file-${fcIdx}`}
                        fileName={fc.fileName}
                        content={fc.content}
                        reasoning={fc.reasoning}
                        status={fc.status}
                        onConfirm={onConfirmFileCreate}
                      />
                    ))}
                    {/* Agent Power Tools cards (Phase 7) */}
                    {m.fileOps && m.fileOps.length > 0 && (
                      <FileOperationToast operations={m.fileOps} />
                    )}
                    {m.shopifyOps && m.shopifyOps.length > 0 && (
                      <ShopifyOperationCard operations={m.shopifyOps} />
                    )}
                    {(m.screenshots || m.screenshotComparison) && (
                      <ScreenshotCard
                        screenshots={m.screenshots}
                        comparison={m.screenshotComparison}
                      />
                    )}
                  </div>

                  {/* Citations (Phase 6) */}
                  {m.citations && m.citations.length > 0 && (
                    <CitationsBlock citations={m.citations} onOpenFile={onOpenFile} />
                  )}

                  {/* Blinking caret while streaming */}
                  {isLoading && idx === messages.length - 1 && (
                    <span
                      className="inline-block w-[2px] h-[1.1em] bg-sky-400 ml-0.5 align-middle rounded-sm ai-streaming-caret"
                      style={{ animation: 'ai-caret-blink 0.8s ease-in-out infinite' }}
                      aria-hidden="true"
                    />
                  )}
                </>
              ) : (
                <UserMessageContent content={m.content} />
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

        {/* Loading indicator — only shown when no thinking steps yet (before first SSE event) */}
        {isLoading && !(lastMessage?.role === 'assistant' && lastMessage?.thinkingSteps?.length) && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg ide-surface-input border ide-border-subtle animate-pulse">
            <svg className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-xs ide-text-2 font-medium italic">
              {getThinkingLabel(currentAction, reviewFileCount)}
              <ThinkingDots />
            </span>
          </div>
        )}

        {/* Inline "Review Plan" button (when plan detected but not in Plan intent mode) */}
        {showInlinePlanButton && (
          <div className="pt-1 px-1">
            <button
              type="button"
              onClick={() => setManualPlanOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-sky-500/30 bg-sky-500/5 text-accent text-xs font-medium hover:bg-sky-500/10 transition-colors"
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

      {/* Scroll-to-bottom floating button */}
      {isLoading && userScrolledUp && (
        <div className="relative">
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-2 right-3 z-20 rounded-full ide-surface-panel border ide-border shadow-sm p-1.5 ide-text-muted hover:ide-text-2 transition-colors"
            aria-label="Scroll to bottom"
            title="Scroll to bottom"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="flex-shrink-0 border-t ide-border-subtle">
        {/* Consolidated context row: badges + element chip + image + attached files + inline suggestions */}
        {(fileCount > 0 || editorSelection || selectedElement || attachedImage || attachedFiles.length > 0 || (!showPreSuggestions && !inputHasText && !isLoading && contextSuggestions.length > 0 && messages.length > 0)) && (
          <div className="flex items-center gap-1.5 px-3 py-1 flex-wrap border-b ide-border-subtle">
            {fileCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full ide-surface-inset px-2 py-0.5 text-[10px] ide-text-3">
                <Paperclip className="h-2.5 w-2.5" />
                {fileCount}
              </span>
            )}
            {/* Phase 3b: Attached file chips from drag-and-drop */}
            {attachedFiles.map((af) => (
              <span key={af.id} className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 text-[10px] text-sky-600 dark:text-sky-400">
                <Paperclip className="h-2.5 w-2.5" />
                <span className="truncate max-w-[100px]">{af.name}</span>
                <button type="button" onClick={() => handleRemoveAttachedFile(af.id)} className="text-sky-400 hover:text-sky-300">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            {editorSelection && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 text-[10px] text-accent truncate max-w-[160px]">
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
              className="w-full rounded-lg border ide-border ide-surface-input px-3 py-2 text-sm ide-text placeholder-stone-400 dark:placeholder-white/40 focus:border-sky-500 dark:focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-500/20 dark:focus:ring-sky-400/20 disabled:opacity-50 resize-none"
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
                  Drop files or images here
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
                            currentModel === opt.value ? 'text-accent' : 'ide-text-2'
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

              {/* Agent count control (1-4 sub-agents) */}
              {onMaxAgentsChange && (
                <button
                  type="button"
                  onClick={() => {
                    const next = (maxAgents % 4) + 1;
                    onMaxAgentsChange(next as MaxAgents);
                  }}
                  className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] border transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none ${
                    maxAgents > 1
                      ? 'text-sky-500 dark:text-sky-400 bg-sky-500/10 border-sky-500/30'
                      : 'ide-text-3 ide-surface-inset ide-border hover:border-stone-300 dark:hover:border-white/20'
                  }`}
                  title={`Max sub-agents per specialist: ${maxAgents} (click to cycle 1-4)`}
                  aria-label={`Sub-agent count: ${maxAgents}`}
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M6 21V9a9 9 0 0 0 9 9" />
                  </svg>
                  <span className="tabular-nums font-medium">{maxAgents}</span>
                </button>
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
                            ? 'text-accent bg-sky-500/15 border-sky-500/40'
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

              {/* Phase 3c: Template library button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowTemplateLibrary((s) => !s)}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] ide-text-3 ide-surface-inset border ide-border hover:border-stone-300 dark:hover:border-white/20 hover:ide-text-2 transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
                  title="Prompt templates"
                  aria-label="Open prompt templates"
                >
                  <BookOpen className="h-3 w-3" />
                </button>
                <PromptTemplateLibrary
                  open={showTemplateLibrary}
                  onClose={() => setShowTemplateLibrary(false)}
                  onSelectTemplate={(prompt) => {
                    if (inputRef.current) {
                      inputRef.current.value = prompt;
                      setInputHasText(true);
                      inputRef.current.focus();
                    }
                    setShowTemplateLibrary(false);
                  }}
                />
              </div>

              {/* Context window meter */}
              <ContextMeter meter={contextMeter} modelLabel={currentModelOption?.label} onNewChat={onNewChat} />
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

              {/* Phase 5b: Share button */}
              {projectId && activeSessionId && messages.length > 0 && !isLoading && (
                <ShareButton projectId={projectId} sessionId={activeSessionId} />
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
