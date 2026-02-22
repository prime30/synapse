'use client';

import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ElementRefChip } from '@/components/ui/ElementRefChip';
import { SuggestionChips } from './SuggestionChips';
import { SynapseIconAnim } from './SynapseIconAnim';
import type { SelectedElement } from '@/components/preview/PreviewPanel';
import type { Suggestion } from '@/lib/ai/prompt-suggestions';
import type { IntentMode, MaxAgents } from '@/hooks/useAgentSettings';
import type { OutputMode } from '@/lib/ai/signal-detector';
import { ThinkingBlock, type ThinkingStep } from './ThinkingBlock';
import { ThinkingBlockV2 } from './ThinkingBlockV2';
import { ToolActionItem } from './ToolActionItem';
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
import { Square, Search, Paperclip, ChevronDown, Pin, ClipboardCopy, X, Trash2, ImageIcon, Upload, Pencil, RotateCcw, BookOpen, GitBranch, Send, ArrowRightCircle, Code2, CircleHelp, ClipboardList, Brain } from 'lucide-react';
import { PromptTemplateLibrary } from './PromptTemplateLibrary';
import { ShareButton } from './ShareButton';
import { ConflictResolver } from './ConflictResolver';
import { AnimatePresence, motion } from 'framer-motion';
import { safeTransition } from '@/lib/accessibility';
import { usePromptProgress } from '@/hooks/usePromptProgress';
import { useContextMeter } from '@/hooks/useContextMeter';
import { ContextMeter } from './ContextMeter';
import type { ChatSession } from './SessionHistory';
import { logInteractionEvent } from '@/lib/ai/interaction-client';
import { PlanMentionPopover, type PlanMention } from './PlanMentionPopover';

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

/** Match [Selected code in editor — lines N-M]: or [Selected code in editor]: followed by fenced code block */
const SELECTED_CODE_BLOCK_RE =
  /\[Selected code in editor(?: — lines (\d+)-(\d+))?\]:\s*\n```(?:\w+)?\n([\s\S]*?)```/g;

function SelectedCodePill({
  startLine,
  endLine,
  code,
  defaultExpanded = false,
}: {
  startLine?: number;
  endLine?: number;
  code: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const label =
    typeof startLine === 'number' && typeof endLine === 'number'
      ? startLine === endLine
        ? `L${startLine}`
        : `L${startLine}–${endLine}`
      : `${code.split(/\n/).length} lines`;
  return (
    <span className="inline-flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="inline-flex items-center rounded-md border ide-border ide-surface-panel px-2 py-1 text-[11px] font-mono text-sky-500 dark:text-sky-400 hover:ide-hover self-start max-w-full"
        title={expanded ? 'Collapse' : 'Expand code'}
      >
        <span className="truncate">{label}</span>
        <span className="ml-1 opacity-70">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <pre className="mt-1 p-2 rounded border ide-border ide-surface-inset text-[11px] overflow-x-auto max-h-48 overflow-y-auto whitespace-pre">
          <code>{code}</code>
        </pre>
      )}
    </span>
  );
}

/**
 * Strips metadata prefixes from legacy stored messages and renders
 * element-selector references and selected-code blocks as compact token pills.
 * Selected code is shown as a line-number pill (collapsed by default), expandable to show code.
 */
function UserMessageContent({ content }: { content: string }) {
  // Strip any residual IDE context metadata (for backward compat with stored messages)
  let cleaned = content.replace(IDE_CONTEXT_PATTERN, '').trim();

  // Check for a leading selector reference
  const selectorMatch = cleaned.match(SELECTOR_REF_PATTERN);
  let selectorChip: React.ReactNode = null;
  if (selectorMatch) {
    const selector = selectorMatch[1];
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

  // Strip [Full file context] blocks (no pill)
  cleaned = cleaned.replace(/\[Full file context[^\]]*\]:[\s\S]*?```\n*/g, '').trim();

  // Parse [Selected code in editor ...]: ```...``` into pills (collapsed by default)
  const parts: Array<{ type: 'text'; text: string } | { type: 'code'; startLine?: number; endLine?: number; code: string }> = [];
  const re = new RegExp(SELECTED_CODE_BLOCK_RE.source, SELECTED_CODE_BLOCK_RE.flags);
  let lastEnd = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(cleaned)) !== null) {
    if (match.index > lastEnd) {
      parts.push({ type: 'text', text: cleaned.slice(lastEnd, match.index) });
    }
    const startLine = match[1] ? parseInt(match[1], 10) : undefined;
    const endLine = match[2] ? parseInt(match[2], 10) : undefined;
    parts.push({ type: 'code', startLine, endLine, code: match[3] ?? '' });
    lastEnd = re.lastIndex;
  }
  if (lastEnd < cleaned.length) {
    parts.push({ type: 'text', text: cleaned.slice(lastEnd) });
  }

  if (parts.length === 0 && !selectorChip) return null;

  return (
    <div className="flex flex-col gap-2">
      {selectorChip}
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {parts.map((part, i) =>
          part.type === 'text' ? (
            <span key={i}>{part.text}</span>
          ) : (
            <SelectedCodePill
              key={i}
              startLine={part.startLine}
              endLine={part.endLine}
              code={part.code}
              defaultExpanded={false}
            />
          )
        )}
      </span>
    </div>
  );
}

// PlanStep is now unified in PlanApprovalModal (supports both `text` and `description`)
export type { PlanStep } from './PlanApprovalModal';

// ── Cursor-style content blocks for interleaved rendering ───────────
export type ContentBlock =
  | { type: 'text'; id: string; text: string }
  | { type: 'tool_action'; id: string; toolId: string; toolName: string;
      label: string; subtitle?: string;
      status: 'loading' | 'done' | 'error';
      cardType?: 'plan' | 'code_edit' | 'clarification' | 'file_create' |
                 'preview_nav' | 'file_op' | 'shopify_op' | 'screenshot' |
                 'screenshot_comparison' | 'change_preview' | 'theme_artifact';
      cardData?: unknown; error?: string }
  | { type: 'thinking'; id: string; startedAt: number;
      reasoningText: string; done: boolean; elapsedMs: number };

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
  clarification?: {
    question: string;
    options: Array<{ id: string; label: string; recommended?: boolean }>;
    allowMultiple?: boolean;
    allowFreeform?: boolean;
    round?: number;
    maxRounds?: number;
  };
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

  // ── Model & rate-limit indicators ──────────────────────────────────
  /** The model actually used for this response (may differ from selection after fallback). */
  activeModel?: string;
  /** Whether a rate limit was hit during this response, triggering model fallback. */
  rateLimitHit?: boolean;
  /** Final execution outcome for this assistant run. */
  executionOutcome?: 'applied' | 'no-change' | 'blocked-policy' | 'needs-input';
  /** Structured failure metadata from coordinator (source-of-truth). */
  failureReason?: string;
  suggestedAction?: string;
  failedTool?: string;
  failedFilePath?: string;
  /** Which review section failed (spec, code_quality, or both). */
  reviewFailedSection?: 'spec' | 'code_quality' | 'both' | null;
  /** Verification evidence from post-loop checks. */
  verificationEvidence?: {
    syntaxCheck: { passed: boolean; errorCount: number; warningCount: number };
    themeCheck?: { passed: boolean; errorCount: number; warningCount: number; infoCount: number };
    checkedFiles: string[];
    totalCheckTimeMs: number;
  };

  // ── Cursor-style content blocks (ephemeral, not persisted) ─────────
  /** Ordered content blocks for interleaved rendering. If present, drives Cursor-style rendering. */
  blocks?: ContentBlock[];
}

function outcomeBadgeConfig(outcome: NonNullable<ChatMessage['executionOutcome']>): {
  label: string;
  className: string;
} {
  if (outcome === 'applied') {
    return {
      label: 'applied',
      className:
        'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    };
  }
  if (outcome === 'blocked-policy') {
    return {
      label: 'architectural change',
      className:
        'text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10',
    };
  }
  if (outcome === 'needs-input') {
    return {
      label: 'needs input',
      className:
        'text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10',
    };
  }
  return {
    label: 'no changes',
    className:
      'text-stone-600 dark:text-stone-300 border-stone-400/30 bg-stone-500/10',
  };
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
  /** Called when user clicks transcript review to analyze loop/CX issues in this session. */
  onReviewTranscript?: () => void;
  /** Loading state for transcript review action. */
  isReviewingTranscript?: boolean;
  /** Open Developer Memory panel. */
  onOpenMemory?: () => void;
  /** Whether Developer Memory panel is currently open. */
  isMemoryOpen?: boolean;
  /** Currently selected AI model */
  currentModel?: string;
  /** Called when model is changed */
  onModelChange?: (model: string) => void;
  /** Whether specialist mode is enabled (domain-specific agents). */
  specialistMode?: boolean;
  /** Called when specialist mode is toggled. */
  onSpecialistModeChange?: (enabled: boolean) => void;
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
  /** Switch mode AND auto-submit a message (mode-switch acceleration). */
  onModeSwitchAndSend?: (mode: IntentMode, autoMessage: string) => void;
  /** Max sub-agents per specialist (1-4) */
  maxAgents?: MaxAgents;
  /** Called when the user changes the max agent count */
  onMaxAgentsChange?: (count: MaxAgents) => void;
  /** Called when user edits a message — resends from that point (index, new content) */
  onEditMessage?: (index: number, content: string) => void;
  /** Truncate messages from a given index (used by edit-and-resend to remove before sending) */
  onTruncateMessages?: (index: number) => void;
  /** Called when user wants to regenerate the last assistant response */
  onRegenerateMessage?: () => void;
  /** Called when user clicks a file path in an AI response to open it */
  onOpenFile?: (filePath: string) => void;
  /** Called while user types, for warmup precomputation. */
  onDraftChange?: (draft: string) => void;
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
  /** Add a file chip to chat context from external UI triggers (e.g. breadcrumb). */
  pendingAttachedFile?: { id: string; name: string; path: string; nonce: number } | null;
  /** Phase 4b: Whether verbose/inner monologue is active */
  verbose?: boolean;
  /** Phase 4b: Toggle verbose mode */
  onToggleVerbose?: () => void;
  /** Phase 5a: Fork conversation at a message index */
  onForkAtMessage?: (messageIndex: number) => void;
  /** Phase 6a: Called when user pins/unpins a message as a preference */
  onPinAsPreference?: (content: string) => void;
  /** When set, prompt template library open state is controlled by parent (e.g. sidebar header). */
  templateLibraryOpen?: boolean;
  /** Called when template library should close (e.g. after selection). */
  onTemplateLibraryClose?: () => void;
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
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6', description: 'Fast, balanced + thinking' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6', description: 'Most capable' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Google AI' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Fast, efficient' },
];

const MODEL_LABELS: Record<string, string> = {
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-opus-4-6': 'Opus 4.6',
  'claude-haiku-4-5-20251001': 'Haiku 4.5',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
};

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

// ── Mode-switch detection ─────────────────────────────────────────────────────

/** Target modes that the assistant might suggest switching to. */
type SuggestedMode = Extract<IntentMode, 'code' | 'plan' | 'debug'>;

/** Detects if an assistant message suggests the user switch to a different mode. */
function detectModeSwitchSuggestion(content: string, currentMode: IntentMode): SuggestedMode | null {
  if (!content) return null;
  const plain = content.replace(/\*\*/g, '');
  // Match "switch to X mode" or "in X mode"
  const modeMap: [RegExp, SuggestedMode][] = [
    [/switch to code mode/i, 'code'],
    [/switch to plan mode/i, 'plan'],
    [/switch to debug mode/i, 'debug'],
    [/in code mode.*(?:I can|to (?:create|apply|implement|make|write))/i, 'code'],
    [/in plan mode.*(?:I can|to (?:create|design|plan))/i, 'plan'],
  ];
  for (const [regex, mode] of modeMap) {
    if (regex.test(plain) && mode !== currentMode) return mode;
  }
  return null;
}

/** Inline button shown when the agent suggests switching modes. */
function ModeSwitchButton({
  targetMode,
  onModeSwitchAndSend,
  onSwitch,
}: {
  targetMode: SuggestedMode;
  /** Combined switch + auto-send (preferred — avoids stale closure issues). */
  onModeSwitchAndSend?: (mode: IntentMode, autoMessage: string) => void;
  /** Fallback: just switch mode, no auto-send. */
  onSwitch: (mode: IntentMode) => void;
}) {
  const [clicked, setClicked] = React.useState(false);

  const handleClick = useCallback(() => {
    if (clicked) return;
    setClicked(true);

    const autoMsg = 'Implement the code changes you just suggested.';
    if (onModeSwitchAndSend) {
      onModeSwitchAndSend(targetMode, autoMsg);
    } else {
      onSwitch(targetMode);
    }
  }, [clicked, targetMode, onModeSwitchAndSend, onSwitch]);

  const label = `Switch to ${targetMode.charAt(0).toUpperCase() + targetMode.slice(1)} mode`;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={clicked}
      className={`mt-3 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
        clicked
          ? 'border-accent/30 bg-accent/10 text-accent cursor-default'
          : 'border-sky-400/40 bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 hover:border-sky-400/60 cursor-pointer'
      }`}
    >
      <ArrowRightCircle className="h-3.5 w-3.5" />
      {clicked ? `Switched — implementing...` : label}
    </button>
  );
}

// ── CollapsedToolGroup ────────────────────────────────────────────────────────
// Renders N repeated same-label tool_action blocks as a single collapsible row.

interface CollapsedToolGroupProps {
  label: string;
  count: number;
  status: 'loading' | 'done' | 'error';
  blocks: Extract<ContentBlock, { type: 'tool_action' }>[];
  onApplyCode?: (code: string, fileId: string, fileName: string) => void;
  onOpenFile?: (filePath: string) => void;
  resolveFileId?: (path: string) => string | null;
  onOpenPlanFile?: (filePath: string) => void;
  onBuildPlan?: (checkedSteps: Set<number>) => void;
  onSend?: (content: string) => void;
  onConfirmFileCreate?: (fileName: string, content: string) => void;
}

function CollapsedToolGroup({
  label,
  count,
  status,
  blocks,
  onApplyCode,
  onOpenFile,
  resolveFileId,
  onOpenPlanFile,
  onBuildPlan,
  onSend,
  onConfirmFileCreate,
}: CollapsedToolGroupProps) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="my-1 rounded-md border ide-border-subtle overflow-hidden">
      {/* Summary row */}
      <button
        type="button"
        onClick={() => setExpanded(p => !p)}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left ide-hover transition-colors"
      >
        {/* Status icon */}
        <div className="shrink-0 h-4 w-4 flex items-center justify-center">
          {status === 'loading' ? (
            <svg className="h-4 w-4 animate-spin text-sky-500 dark:text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg className="h-4 w-4 text-[#28CD56]" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
          )}
        </div>

        {/* Label + count badge */}
        <span className="flex-1 min-w-0 text-xs ide-text-2 font-medium truncate">
          {label}
        </span>
        <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium ide-surface-inset ide-text-muted border ide-border-subtle">
          ×{count}
        </span>

        {/* Chevron */}
        <svg
          className={`shrink-0 h-3 w-3 ide-text-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd"/>
        </svg>
      </button>

      {/* Expanded individual rows */}
      {expanded && (
        <div className="border-t ide-border-subtle divide-y ide-border-subtle">
          {blocks.map(block => (
            <ToolActionItem
              key={block.id}
              block={block}
              onApplyCode={onApplyCode}
              onOpenFile={onOpenFile}
              resolveFileId={resolveFileId}
              onOpenPlanFile={onOpenPlanFile}
              onBuildPlan={onBuildPlan}
              onSend={onSend}
              onConfirmFileCreate={onConfirmFileCreate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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
  onReviewTranscript,
  isReviewingTranscript = false,
  onOpenMemory,
  isMemoryOpen = false,
  currentModel,
  onModelChange,
  specialistMode = false,
  onSpecialistModeChange,
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
  onModeSwitchAndSend,
  maxAgents = 1,
  onMaxAgentsChange,
  onEditMessage,
  onTruncateMessages,
  onRegenerateMessage,
  onOpenFile,
  onDraftChange,
  errorCode,
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
  pendingAttachedFile,
  verbose,
  onToggleVerbose,
  onForkAtMessage,
  projectId,
  activeSessionId,
  onPinAsPreference,
  templateLibraryOpen = false,
  onTemplateLibraryClose,
}: ChatInterfaceProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** When set, the next submit should edit-and-resend at this message index instead of appending. */
  const editPendingRef = useRef<number | null>(null);
  const [editAnimatingId, setEditAnimatingId] = useState<string | null>(null);
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

  // @plan typeahead state
  const [mentionState, setMentionState] = useState<{
    visible: boolean;
    query: string;
    selectedIndex: number;
    anchorRect: { top: number; left: number } | null;
    triggerIndex: number;
  } | null>(null);
  const [projectPlans, setProjectPlans] = useState<PlanMention[]>([]);

  // Phase 3b: Attached files (dragged from file tree)
  const [attachedFiles, setAttachedFiles] = useState<Array<{ id: string; name: string; path: string }>>([]);

  const [showIntentDropdown, setShowIntentDropdown] = useState(false);
  const [intentDropdownRect, setIntentDropdownRect] = useState<{ bottom: number; left: number } | null>(null);
  const intentDropdownAnchorRef = useRef<HTMLDivElement>(null);
  const intentDropdownOpenTimeRef = useRef<number>(0);
  const [modelPickerRect, setModelPickerRect] = useState<{ bottom: number; left: number } | null>(null);
  const modelPickerAnchorRef = useRef<HTMLButtonElement>(null);
  const emitInteraction = useCallback(
    (
      kind: 'button_click' | 'mode_change' | 'system',
      label: string,
      metadata?: Record<string, unknown>,
    ) => {
      logInteractionEvent(projectId, {
        kind,
        sessionId: activeSessionId ?? null,
        source: 'chat.ui',
        label,
        metadata,
      });
    },
    [projectId, activeSessionId],
  );

  // Fetch project plans for @plan typeahead
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/plans`)
      .then(r => r.json())
      .then(data => {
        setProjectPlans((data.data?.plans ?? []).map((p: any) => ({
          id: p.id,
          name: p.name,
          todoProgress: p.todoProgress ?? { completed: 0, total: 0 },
        })));
      })
      .catch(() => {});
  }, [projectId]);

  useLayoutEffect(() => {
    if (!showIntentDropdown || !intentDropdownAnchorRef.current) {
      if (!showIntentDropdown) setIntentDropdownRect(null);
      return;
    }
    const el = intentDropdownAnchorRef.current;
    const rect = el.getBoundingClientRect();
    // Position above the button so dropdown opens upward and isn't clipped by overflow
    setIntentDropdownRect({ bottom: window.innerHeight - rect.top + 8, left: rect.left });
    return () => setIntentDropdownRect(null);
  }, [showIntentDropdown]);

  useEffect(() => {
    if (!showModelPicker || !modelPickerAnchorRef.current) return;
    const el = modelPickerAnchorRef.current;
    const rect = el.getBoundingClientRect();
    setModelPickerRect({ bottom: window.innerHeight - rect.top + 8, left: rect.left });
    return () => setModelPickerRect(null);
  }, [showModelPicker]);

  useEffect(() => { onAttachedFilesChange?.(attachedFiles); }, [attachedFiles, onAttachedFilesChange]);

  useEffect(() => {
    if (!pendingAttachedFile) return;
    const nextFile = {
      id: pendingAttachedFile.id,
      name: pendingAttachedFile.name,
      path: pendingAttachedFile.path,
    };
    setAttachedFiles((prev) => {
      if (prev.some((f) => f.id === nextFile.id || f.path === nextFile.path)) return prev;
      return [...prev, nextFile];
    });
  }, [pendingAttachedFile]);

  // Prompt progress / countdown
  const promptProgress = usePromptProgress(!!isLoading, currentAction, intentMode);

  // Use actual context stats from the latest assistant message when present (bounded context from backend)
  const lastContextStats = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === 'assistant' && m.contextStats);
    return (last as { contextStats?: { loadedFiles: number; loadedTokens: number; totalFiles: number } } | undefined)?.contextStats;
  }, [messages]);

  const effectiveFileCount = lastContextStats?.loadedFiles ?? 0;
  const effectiveTotalFiles = lastContextStats?.totalFiles ?? totalFiles ?? 0;
  const loadedFileTokens = lastContextStats?.loadedTokens;

  // Context window meter: use bounded context (effectiveFileCount, loadedFileTokens) when we have stats
  const contextMeter = useContextMeter(
    messages,
    currentModel,
    effectiveFileCount,
    editorSelection,
    summarizedCount,
    effectiveTotalFiles,
    budgetTruncated,
    undefined,
    loadedFileTokens,
  );
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
    if (outputMode === 'plan' && lastMessage?.role === 'assistant' && intentMode === 'plan') {
      const steps = parsePlanSteps(lastMessage.content);
      return steps.length >= 2 ? steps : [];
    }
    return [];
  }, [outputMode, lastMessage, intentMode]);

  const planKey = planSteps.length > 0
    ? planSteps.map(s => s.description ?? s.text ?? '').join('|')
    : '';
  // Only auto-open the plan modal when the user explicitly chose Plan intent mode.
  // Otherwise, show an inline "Review Plan" button so it's not intrusive.
  const planModalOpen = planSteps.length > 0 && planDismissedKey !== planKey && intentMode === 'plan';
  const showInlinePlanButton = false;
  const [manualPlanOpen, setManualPlanOpen] = useState(false);

  // ── EPIC 5: Plan modal handlers ──────────────────────────────────────────
  const handlePlanApprove = (steps: PlanStep[]) => {
    setPlanDismissedKey(planKey);
    emitInteraction('button_click', 'plan.approve', { stepCount: steps.length });
    onSend(`Approved plan. Execute these ${steps.length} steps.`);
  };

  const handlePlanModify = (feedback: string) => {
    setPlanDismissedKey(planKey);
    emitInteraction('button_click', 'plan.modify', { feedbackLength: feedback.length });
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
    emitInteraction('button_click', 'chat.clear');
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

  const handlePlanSelect = useCallback((plan: PlanMention) => {
    const textarea = inputRef.current;
    if (!textarea || !mentionState) return;
    const val = textarea.value;
    const before = val.slice(0, mentionState.triggerIndex);
    const after = val.slice(textarea.selectionStart ?? val.length);
    const mention = `@plan:${plan.name} `;
    textarea.value = before + mention + after;
    setInputHasText(true);
    onDraftChange?.(textarea.value);
    setMentionState(null);
    textarea.focus();
    const newPos = before.length + mention.length;
    textarea.setSelectionRange(newPos, newPos);
  }, [mentionState, onDraftChange]);

  const filteredPlans = useMemo(() => {
    if (!mentionState) return [];
    return projectPlans.filter(p => p.name.toLowerCase().includes(mentionState.query.toLowerCase()));
  }, [projectPlans, mentionState]);

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

    // Resolve @plan: references to inline context
    const planRefs = messageText.match(/@plan:([^\s]+(?:\s[^\s@]+)*)/g);
    if (planRefs && projectId) {
      let contextPrefix = '';
      for (const ref of planRefs) {
        const planName = ref.replace('@plan:', '').trim();
        const plan = projectPlans.find(p => p.name === planName);
        if (plan) {
          try {
            const res = await fetch(`/api/projects/${projectId}/plans/${plan.id}`);
            const data = await res.json();
            if (data.data) {
              const todos = data.data.todos?.map((t: any) => `${t.status === 'completed' ? '☑' : '☐'} ${t.content}`).join(', ') ?? '';
              contextPrefix += `[Referenced Plan: "${data.data.name}"]\n${data.data.content}\nTodos: ${todos}\n[End Plan]\n\n`;
            }
          } catch { /* skip unresolvable plans */ }
        }
      }
      if (contextPrefix) {
        messageText = contextPrefix + messageText;
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
    setMentionState(null);
    setAttachedFiles([]);
    onDismissElement?.();
  };

  const handleSuggestionSelect = (prompt: string) => {
    emitInteraction('button_click', 'suggestion.select', { prompt });

    // "Verify in preview" should be a direct UI action, not another agent turn.
    // Sending it back to the model can re-trigger discovery/planning loops.
    const normalized = prompt.trim().toLowerCase();
    const isVerifyPreviewPrompt =
      normalized === 'check the preview to verify the changes render correctly.' ||
      normalized.startsWith('check the preview to verify');

    if (isVerifyPreviewPrompt && onNavigatePreview) {
      onNavigatePreview('/');
      return;
    }

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
    if (intentMode === 'plan') execMode = 'plan';
    else if (intentMode === 'ask') execMode = 'solo'; // Ask mode uses solo pipeline
    else if (maxAgents === 1) execMode = 'solo';
    else execMode = specialistMode ? 'orchestrated' : 'general';
    // Pass error code to deriveRailSteps so the active phase shows error state
    return deriveRailSteps(steps, execMode, errorCode ?? undefined);
  }, [isLoading, messages, intentMode, maxAgents, specialistMode, errorCode]);

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${className}`}>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 p-2"
        role="log"
        aria-label="Conversation"
        aria-busy={isLoading || false}
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
          <div className="py-8 flex flex-col items-center">
            <div className="flex flex-col items-center gap-3">
              <SynapseIconAnim size={56} />
              <p className="text-base ide-text-2 font-semibold">Synapse AI</p>
              <p className="text-sm ide-text-3 text-center">What would you like to build?</p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-[320px] mt-5">
              {[
                { key: 'code', icon: Code2, label: 'Code', desc: 'Change theme files' },
                { key: 'ask', icon: CircleHelp, label: 'Ask', desc: 'Questions about your project' },
                { key: 'plan', icon: ClipboardList, label: 'Plan', desc: 'Step-by-step plans' },
                { key: 'debug', icon: Search, label: 'Debug', desc: 'Find and fix issues' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    emitInteraction('mode_change', 'intent.change', { mode: item.key, source: 'empty_state' });
                    onIntentModeChange?.(item.key as IntentMode);
                  }}
                  className={`rounded-lg px-3 py-2.5 text-center text-sm transition-colors border ${
                    intentMode === item.key
                      ? 'border-sky-400/40 bg-sky-500/10 ide-text'
                      : 'ide-border-subtle ide-surface hover:ide-hover ide-text-muted'
                  }`}
                  aria-label={`Switch to ${item.label} mode: ${item.desc}`}
                >
                  <span className="font-medium inline-flex items-center gap-1">
                    <item.icon className="h-3.5 w-3.5" aria-hidden />
                    {item.label}
                  </span>
                  <span className="block ide-text-muted text-xs mt-0.5">{item.desc}</span>
                </button>
              ))}
            </div>
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
          <div
            key={m.id}
            className={`group/msg relative transition-all duration-250 ${m.role === 'assistant' ? 'rounded-md group-hover/msg:bg-stone-50/50 dark:group-hover/msg:bg-white/[0.02]' : ''}`}
            style={
              editAnimatingId === m.id || (editAnimatingId && idx > messages.findIndex((msg) => msg.id === editAnimatingId))
                ? { opacity: 0, transform: 'translateY(40px) scale(0.95)', pointerEvents: 'none' as const }
                : undefined
            }
          >
            {/* Hover action buttons */}
            <div className="absolute -top-1 right-1 hidden group-hover/msg:flex items-center gap-0.5 z-10 ide-surface-pop rounded-md px-0.5 py-0.5 border ide-border-subtle">
              {/* Edit & resend (user messages only) */}
              {m.role === 'user' && onEditMessage && !isLoading && (
                <button
                  type="button"
                  onClick={() => {
                    const content = m.content;
                    setEditAnimatingId(m.id);
                    setTimeout(() => {
                      onTruncateMessages?.(idx);
                      setEditAnimatingId(null);
                      const el = inputRef.current;
                      if (el) {
                        el.value = content;
                        setInputHasText(true);
                        el.focus();
                      }
                    }, 250);
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
                  {/* ── NEW: Cursor-style block rendering ── */}
                  {m.blocks && m.blocks.length > 0 ? (
                    <>
                      {(() => {
                        // Group consecutive tool_action blocks with identical labels
                        // into a single collapsible row. Blocks with cards or errors
                        // are never grouped so their expandable content stays reachable.
                        type BlockGroup =
                          | { kind: 'single'; block: ContentBlock }
                          | { kind: 'group'; label: string; blocks: Extract<ContentBlock, { type: 'tool_action' }>[] };

                        const groups: BlockGroup[] = [];
                        for (const block of m.blocks) {
                          const isCollapsible =
                            block.type === 'tool_action' &&
                            !block.cardType &&
                            block.status !== 'error';

                          if (isCollapsible) {
                            const last = groups[groups.length - 1];
                            if (last?.kind === 'group' && last.label === block.label) {
                              last.blocks.push(block as Extract<ContentBlock, { type: 'tool_action' }>);
                            } else {
                              groups.push({
                                kind: 'group',
                                label: block.label,
                                blocks: [block as Extract<ContentBlock, { type: 'tool_action' }>],
                              });
                            }
                          } else {
                            groups.push({ kind: 'single', block });
                          }
                        }

                        return groups.map((g, gi) => {
                          if (g.kind === 'single') {
                            const block = g.block;
                            switch (block.type) {
                              case 'thinking':
                                return (
                                  <ThinkingBlockV2
                                    key={block.id}
                                    reasoningText={block.reasoningText}
                                    isComplete={block.done}
                                    startedAt={block.startedAt}
                                    elapsedMs={block.elapsedMs}
                                  />
                                );
                              case 'text':
                                return (
                                  <MarkdownRenderer
                                    key={block.id}
                                    content={block.text}
                                    isStreaming={isLoading && idx === messages.length - 1}
                                    onOpenFile={onOpenFile}
                                    onApplyCode={onApplyCode}
                                    onSaveCode={onSaveCode}
                                    resolveFileId={resolveFileIdProp}
                                  />
                                );
                              case 'tool_action':
                                return (
                                  <ToolActionItem
                                    key={block.id}
                                    block={block}
                                    onApplyCode={onApplyCode}
                                    onOpenFile={onOpenFile}
                                    resolveFileId={resolveFileIdProp}
                                    onOpenPlanFile={onOpenPlanFile}
                                    onBuildPlan={onBuildPlan}
                                    onSend={onSend}
                                    onConfirmFileCreate={onConfirmFileCreate}
                                  />
                                );
                              default:
                                return null;
                            }
                          }

                          // Grouped repeated tool_action rows
                          const { label, blocks: groupBlocks } = g;
                          if (groupBlocks.length === 1) {
                            return (
                              <ToolActionItem
                                key={groupBlocks[0].id}
                                block={groupBlocks[0]}
                                onApplyCode={onApplyCode}
                                onOpenFile={onOpenFile}
                                resolveFileId={resolveFileIdProp}
                                onOpenPlanFile={onOpenPlanFile}
                                onBuildPlan={onBuildPlan}
                                onSend={onSend}
                                onConfirmFileCreate={onConfirmFileCreate}
                              />
                            );
                          }
                          const lastBlock = groupBlocks[groupBlocks.length - 1];
                          return (
                            <CollapsedToolGroup
                              key={`group-${gi}-${groupBlocks[0].id}`}
                              label={label}
                              count={groupBlocks.length}
                              status={lastBlock.status}
                              blocks={groupBlocks}
                              onApplyCode={onApplyCode}
                              onOpenFile={onOpenFile}
                              resolveFileId={resolveFileIdProp}
                              onOpenPlanFile={onOpenPlanFile}
                              onBuildPlan={onBuildPlan}
                              onSend={onSend}
                              onConfirmFileCreate={onConfirmFileCreate}
                            />
                          );
                        });
                      })()}
                      {/* Citations (Phase 6) */}
                      {m.citations && m.citations.length > 0 && (
                        <CitationsBlock citations={m.citations} onOpenFile={onOpenFile} />
                      )}
                      {/* Mode-switch inline button */}
                      {(() => {
                        const suggested = detectModeSwitchSuggestion(m.content, intentMode);
                        return suggested && onIntentModeChange && !isLoading ? (
                          <ModeSwitchButton
                            targetMode={suggested}
                            onModeSwitchAndSend={onModeSwitchAndSend}
                            onSwitch={onIntentModeChange}
                          />
                        ) : null;
                      })()}
                    </>
                  ) : (
                    <>
                      {/* ── LEGACY: Existing ThinkingBlock + content + cards rendering ── */}
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
                      <MarkdownRenderer
                        content={m.content}
                        isStreaming={isLoading && idx === messages.length - 1}
                        onOpenFile={onOpenFile}
                        onApplyCode={onApplyCode}
                        onSaveCode={onSaveCode}
                        resolveFileId={resolveFileIdProp}
                      />

                      <div aria-live="polite">
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
                                    const indices = fileMap.get(filePath) || [];
                                    for (const i of indices) {
                                      if (String(i) !== selectedAgentId) {
                                        onEditStatusChange?.(m.id, i, 'rejected');
                                      }
                                    }
                                  }}
                                  onResolveAll={() => {
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
                            allowFreeform={m.clarification.allowFreeform}
                            round={m.clarification.round}
                            maxRounds={m.clarification.maxRounds}
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
                      {m.citations && m.citations.length > 0 && (
                        <CitationsBlock citations={m.citations} onOpenFile={onOpenFile} />
                      )}
                      {/* Mode-switch inline button (legacy path) */}
                      {(() => {
                        const suggested = detectModeSwitchSuggestion(m.content, intentMode);
                        return suggested && onIntentModeChange && !isLoading ? (
                          <ModeSwitchButton
                            targetMode={suggested}
                            onModeSwitchAndSend={onModeSwitchAndSend}
                            onSwitch={onIntentModeChange}
                          />
                        ) : null;
                      })()}
                      {isLoading && idx === messages.length - 1 && (m.content?.trim().length ?? 0) > 0 && (
                        <span
                          className="inline-block w-[2px] h-[1.1em] bg-sky-400 ml-0.5 align-middle rounded-sm ai-streaming-caret"
                          style={{ animation: 'ai-caret-blink 0.8s ease-in-out infinite' }}
                          aria-hidden="true"
                        />
                      )}
                    </>
                  )}
                </>
              ) : (
                <UserMessageContent content={m.content} />
              )}
            </div>

            {/* Model/outcome/rate-limit badges on assistant messages */}
            {m.role === 'assistant' && (m.activeModel || m.executionOutcome || m.rateLimitHit) && (
              <div className="mt-1 flex items-center gap-1.5 px-3">
                {m.activeModel && (
                  <span className="inline-flex items-center gap-1 text-[10px] ide-text-muted">
                    {MODEL_LABELS[m.activeModel] || m.activeModel}
                  </span>
                )}
                {m.executionOutcome && (
                  <span
                    className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${outcomeBadgeConfig(m.executionOutcome).className}`}
                    title={`Execution outcome: ${outcomeBadgeConfig(m.executionOutcome).label}`}
                  >
                    {outcomeBadgeConfig(m.executionOutcome).label}
                  </span>
                )}
                {m.rateLimitHit && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-500 dark:text-amber-400">
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    rate limited
                  </span>
                )}
              </div>
            )}

            {/* Review section failure badges */}
            {m.role === 'assistant' && m.reviewFailedSection && (
              <div className="mt-0.5 flex flex-wrap items-center gap-1 px-3">
                {(m.reviewFailedSection === 'spec' || m.reviewFailedSection === 'both') && (
                  <span className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10">
                    spec compliance failed
                  </span>
                )}
                {(m.reviewFailedSection === 'code_quality' || m.reviewFailedSection === 'both') && (
                  <span className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10">
                    code quality issues
                  </span>
                )}
              </div>
            )}

            {/* Failure metadata: reason + suggested action */}
            {m.role === 'assistant' && m.failureReason && (
              <div className="mt-0.5 flex flex-col gap-0.5 px-3">
                <span className="text-[10px] text-stone-500 dark:text-stone-400">
                  {m.failureReason === 'search_replace_failed' ? 'Edit failed: text mismatch in ' + (m.failedFilePath ?? 'file')
                    : m.failureReason === 'file_not_found' ? 'File not found: ' + (m.failedFilePath ?? 'unknown')
                    : m.failureReason === 'validation_failed' ? 'Validation error' + (m.failedFilePath ? ' in ' + m.failedFilePath : '')
                    : m.failureReason}
                </span>
                {m.suggestedAction && (
                  <button
                    type="button"
                    className="text-left text-[10px] text-sky-600 dark:text-sky-400 cursor-pointer hover:underline"
                    onClick={() => {
                      const el = inputRef.current;
                      if (el) {
                        el.value = el.value ? el.value + ' ' + m.suggestedAction : m.suggestedAction!;
                        el.focus();
                        setInputHasText(true);
                      }
                      emitInteraction('button_click', 'suggested_action_clicked', {
                        failureReason: m.failureReason,
                        failedTool: m.failedTool,
                      });
                    }}
                  >
                    {m.suggestedAction}
                  </button>
                )}
              </div>
            )}

            {/* Verification evidence card */}
            {m.role === 'assistant' && m.verificationEvidence && (
              <div className="mt-1 mx-3 rounded-md border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-2">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[10px] font-medium text-stone-600 dark:text-gray-400">Verification</span>
                  <span className="text-[9px] text-stone-400 dark:text-stone-500">({m.verificationEvidence.totalCheckTimeMs}ms)</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${m.verificationEvidence.syntaxCheck.passed ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-[10px] text-stone-700 dark:text-stone-300">
                      Syntax {m.verificationEvidence.syntaxCheck.errorCount > 0 ? `${m.verificationEvidence.syntaxCheck.errorCount}E` : ''}{m.verificationEvidence.syntaxCheck.warningCount > 0 ? ` ${m.verificationEvidence.syntaxCheck.warningCount}W` : ''}{m.verificationEvidence.syntaxCheck.passed && m.verificationEvidence.syntaxCheck.warningCount === 0 ? 'pass' : ''}
                    </span>
                  </div>
                  {m.verificationEvidence.themeCheck && (
                    <div className="flex items-center gap-1">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${m.verificationEvidence.themeCheck.passed ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="text-[10px] text-stone-700 dark:text-stone-300">
                        Theme {m.verificationEvidence.themeCheck.errorCount > 0 ? `${m.verificationEvidence.themeCheck.errorCount}E` : ''}{m.verificationEvidence.themeCheck.warningCount > 0 ? ` ${m.verificationEvidence.themeCheck.warningCount}W` : ''}{m.verificationEvidence.themeCheck.passed && m.verificationEvidence.themeCheck.warningCount === 0 ? 'pass' : ''}
                      </span>
                    </div>
                  )}
                </div>
                {m.verificationEvidence.checkedFiles.length > 0 && (
                  <div className="mt-1 text-[9px] text-stone-400 dark:text-stone-500 truncate">
                    {m.verificationEvidence.checkedFiles.length} file{m.verificationEvidence.checkedFiles.length !== 1 ? 's' : ''} checked
                  </div>
                )}
              </div>
            )}

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

        {/* Loading indicator — only shown when no thinking/blocks yet (before first SSE event); shimmer on text, no circle loader */}
        {isLoading && !(lastMessage?.role === 'assistant' && (lastMessage?.thinkingSteps?.length || lastMessage?.blocks?.length)) && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg ide-surface-input border ide-border-subtle">
            <span className="text-xs ide-text-2 font-medium italic animate-pulse">
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
              onClick={() => {
                emitInteraction('button_click', 'plan.review_open', { stepCount: planSteps.length });
                setManualPlanOpen(true);
              }}
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

        {/* Post-response suggestions (context-driven next steps after last assistant message) */}
        {showPostAfterAssistant && responseSuggestions.length > 0 && (
          <div className="pt-0.5 px-1">
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
      <div className="flex-shrink-0">
        {/* Consolidated context row: element chip + image + attached files + inline suggestions (file count pill removed) */}
        {(editorSelection || selectedElement || attachedImage || attachedFiles.length > 0 || (!showPreSuggestions && !inputHasText && !isLoading && contextSuggestions.length > 0 && messages.length > 0)) && (
          <div className="flex items-center gap-1.5 px-3 py-1 flex-wrap border-b ide-border-subtle">
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
            {/* Inline suggestion chips: only context-driven response suggestions,
                shown when the main suggestion strip above is not visible. */}
            {!inputHasText &&
              !isLoading &&
              messages.length > 0 &&
              !showPostAfterAssistant &&
              responseSuggestions.length > 0 && (
              <SuggestionChips
                suggestions={responseSuggestions.slice(0, 3)}
                onSelect={handleSuggestionSelect}
                variant="post"
              />
            )}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="px-2.5 py-1.5"
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

          {/* Input bento: one bordered box containing textarea + footer row */}
          <div className={`rounded-lg border ide-border ide-surface-input overflow-hidden ${isDraggingOver ? 'ring-2 ring-sky-500/50 dark:ring-sky-400/50' : ''}`}>
            <div className="relative">
              <textarea
                ref={inputRef}
                name="message"
                rows={3}
                placeholder={attachedImage ? 'Describe what you want to do with this image...' : placeholder}
                disabled={isLoading || isUploadingImage}
                className="w-full border-0 bg-transparent px-2.5 pt-2.5 pb-1 text-sm ide-text placeholder-stone-400 dark:placeholder-white/40 focus:outline-none focus:ring-0 disabled:opacity-50 resize-none"
                onChange={(e) => {
                  const draft = e.target.value;
                  setInputHasText(draft.trim().length > 0);
                  onDraftChange?.(draft);

                  const cursorPos = e.target.selectionStart ?? draft.length;
                  const lastAt = draft.lastIndexOf('@', cursorPos - 1);
                  if (lastAt >= 0 && (lastAt === 0 || draft[lastAt - 1] === ' ' || draft[lastAt - 1] === '\n')) {
                    const query = draft.slice(lastAt + 1, cursorPos);
                    if (!query.includes(' ') && !query.includes('\n')) {
                      const rect = (e.target as HTMLTextAreaElement).getBoundingClientRect();
                      setMentionState({
                        visible: true,
                        query,
                        selectedIndex: 0,
                        anchorRect: { top: rect.top - 8, left: rect.left + 16 },
                        triggerIndex: lastAt,
                      });
                    } else {
                      setMentionState(null);
                    }
                  } else {
                    setMentionState(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (mentionState?.visible) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setMentionState(prev => prev ? { ...prev, selectedIndex: Math.min(prev.selectedIndex + 1, filteredPlans.length - 1) } : null);
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setMentionState(prev => prev ? { ...prev, selectedIndex: Math.max(prev.selectedIndex - 1, 0) } : null);
                      return;
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (filteredPlans[mentionState.selectedIndex]) {
                        handlePlanSelect(filteredPlans[mentionState.selectedIndex]);
                      }
                      return;
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setMentionState(null);
                      return;
                    }
                  }

                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                  if (e.key === 'Escape' && isLoading && onStop) {
                    e.preventDefault();
                    onStop();
                  }
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

              {mentionState?.visible && (
                <PlanMentionPopover
                  plans={projectPlans}
                  query={mentionState.query}
                  selectedIndex={mentionState.selectedIndex}
                  onSelect={handlePlanSelect}
                  anchorRect={mentionState.anchorRect ?? undefined}
                  onDismiss={() => setMentionState(null)}
                />
              )}

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

            {/* Compact progress rail (docked above input footer) */}
            {!messages[messages.length - 1]?.blocks?.length && (
              <ProgressRail
                steps={activeRailSteps}
                isStreaming={!!isLoading}
              />
            )}

            {/* Compact bento controls above footer (right-aligned) */}
            <div className="flex justify-end px-2 pt-1">
              <div className="inline-flex items-center gap-1 rounded-lg border ide-border-subtle ide-surface-inset px-1.5 py-1">
                {onOpenMemory && (
                  <button
                    type="button"
                    onClick={onOpenMemory}
                    className={`inline-flex items-center justify-center h-7 w-7 shrink-0 rounded-md border transition-colors ${
                      isMemoryOpen
                        ? 'text-purple-500 dark:text-purple-300 bg-purple-500/10 border-purple-500/30'
                        : 'ide-text-3 ide-surface-input ide-border hover:border-stone-300 dark:hover:border-white/20'
                    }`}
                    title="Open Developer Memory"
                    aria-label="Open Developer Memory"
                  >
                    <Brain className="h-[11px] w-[11px]" />
                  </button>
                )}
                {onReviewTranscript && (
                  <button
                    type="button"
                    onClick={onReviewTranscript}
                    disabled={isLoading || isReviewingTranscript}
                    className="inline-flex items-center justify-center h-7 w-7 shrink-0 rounded-md ide-text-3 ide-surface-input border ide-border hover:border-stone-300 dark:hover:border-white/20 disabled:opacity-50 transition-colors"
                    title={isReviewingTranscript ? 'Reviewing transcript…' : 'Review this chat transcript'}
                    aria-label={isReviewingTranscript ? 'Reviewing transcript' : 'Review this chat transcript'}
                  >
                    <BookOpen className={`h-[11px] w-[11px] ${isReviewingTranscript ? 'animate-pulse' : ''}`} />
                  </button>
                )}
                <div className="h-4 w-px ide-border-subtle" />
                <ContextMeter meter={contextMeter} modelLabel={currentModelOption?.label} onNewChat={onNewChat} />
              </div>
            </div>

            {/* Footer row: controls + context % + send — all items h-9, single/team leftmost */}
            <div className="flex items-center justify-between gap-1.5 px-2 py-1 mb-1.5 h-8">
              <div className="flex items-center gap-1.5 min-w-0 h-8">
              {/* Solo/Team toggle removed — replaced by maxAgents cycle + specialist switch */}

              {/* Intent mode dropdown — Ask / Plan / Code / Debug (always visible) */}
              {onIntentModeChange && (
                <div className="relative h-8 flex items-center shrink-0 min-w-[4.25rem]" ref={intentDropdownAnchorRef}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      intentDropdownOpenTimeRef.current = Date.now();
                      setShowIntentDropdown((p) => !p);
                    }}
                    className="inline-flex items-center gap-1 h-8 rounded-lg px-2 text-[11px] font-medium border transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none ide-surface-input ide-border-subtle hover:ide-hover ide-text-2 whitespace-nowrap"
                    aria-expanded={showIntentDropdown}
                    aria-haspopup="listbox"
                    aria-label="Intent mode"
                  >
                    <span className="capitalize">{intentMode}</span>
                    <ChevronDown className={`h-3 w-3 transition-transform ${showIntentDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showIntentDropdown && typeof document !== 'undefined' && intentDropdownRect &&
                    createPortal(
                      <>
                        <div
                          className="fixed inset-0 z-[9998]"
                          aria-hidden
                          onClick={() => {
                            if (Date.now() - intentDropdownOpenTimeRef.current > 150) setShowIntentDropdown(false);
                          }}
                        />
                        <ul
                          role="listbox"
                          className="fixed z-[9999] min-w-[140px] rounded-lg border ide-border ide-surface-pop shadow-lg py-1"
                          style={{ bottom: intentDropdownRect.bottom, left: intentDropdownRect.left }}
                          aria-label="Intent mode"
                        >
                          {([
                            { mode: 'ask' as IntentMode, label: 'Ask', tip: 'Ask questions about your code' },
                            { mode: 'plan' as IntentMode, label: 'Plan', tip: 'Get a plan before making changes' },
                            { mode: 'code' as IntentMode, label: 'Code', tip: 'Generate code changes' },
                            { mode: 'debug' as IntentMode, label: 'Debug', tip: 'Diagnose and fix issues' },
                          ] as const).map(({ mode, label, tip }) => (
                            <li key={mode} role="option" aria-selected={intentMode === mode}>
                              <button
                                type="button"
                                onClick={() => {
                                  emitInteraction('mode_change', 'intent.change', { mode, source: 'dropdown' });
                                  onIntentModeChange(mode);
                                  setShowIntentDropdown(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                                  intentMode === mode ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400' : 'ide-text-2 hover:ide-surface-inset'
                                }`}
                                title={tip}
                              >
                                {label}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>,
                      document.body
                    )}
                </div>
              )}

              {/* Model picker — ghost (no fill/border), portaled */}
              {onModelChange && (
                <div className="relative h-8 flex items-center">
                  <button
                    ref={modelPickerAnchorRef}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowModelPicker(p => !p); }}
                    className="inline-flex items-center gap-1 h-8 rounded-lg px-2 text-[11px] ide-text-muted hover:ide-text-2 bg-transparent border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
                  >
                    <span className="truncate max-w-[82px]">{currentModel?.split('-').slice(0, 2).join(' ') || 'Model'}</span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {showModelPicker && typeof document !== 'undefined' && modelPickerRect &&
                    createPortal(
                      <>
                        <div className="fixed inset-0 z-[99]" aria-hidden onClick={() => setShowModelPicker(false)} />
                        <div
                          className="fixed z-[100] w-56 rounded-lg border ide-border ide-surface-pop shadow-xl py-1"
                          style={{ bottom: modelPickerRect.bottom, left: modelPickerRect.left }}
                        >
                          {MODEL_OPTIONS.map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => { onModelChange(opt.value); setShowModelPicker(false); }}
                              className={`w-full text-left px-3 py-2 text-sm ide-hover transition-colors ${
                                currentModel === opt.value ? 'text-accent' : 'ide-text-2'
                              }`}
                            >
                              <div className="font-medium">{opt.label}</div>
                              <div className="text-xs ide-text-muted">{opt.description}</div>
                            </button>
                          ))}
                        </div>
                      </>,
                      document.body
                    )}
                </div>
              )}

              {/* Subagent count control (1x-4x) — primary mode selector */}
              {onMaxAgentsChange && (
                <button
                  type="button"
                  onClick={() => {
                    const next = (maxAgents % 4) + 1;
                    onMaxAgentsChange(next as MaxAgents);
                  }}
                  className={`inline-flex items-center gap-1 h-8 rounded-lg px-2 text-[11px] border transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none ${
                    maxAgents > 1
                      ? 'text-sky-500 dark:text-sky-400 bg-sky-500/10 border-sky-500/30'
                      : 'ide-text-3 ide-surface-inset ide-border hover:border-stone-300 dark:hover:border-white/20'
                  }`}
                  title={`Subagents: ${maxAgents}x (click to cycle 1x-4x)`}
                  aria-label={`Subagent count: ${maxAgents}x`}
                >
                  <svg className="h-[11px] w-[11px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M6 21V9a9 9 0 0 0 9 9" />
                  </svg>
                  <span className="tabular-nums font-medium">{maxAgents}x</span>
                </button>
              )}

              {/* Specialist mode is now auto-derived from maxAgents > 1 — no toggle needed */}

              {/* File/image upload — icon only */}
              {onImageUpload && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  className={`inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-lg border transition-colors ${
                    attachedImage
                      ? 'text-sky-500 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/30'
                      : 'ide-text-3 ide-surface-inset ide-border hover:border-stone-300 dark:hover:border-white/20'
                  }`}
                  title={isUploadingImage ? 'Uploading…' : attachedImage ? '1 image attached' : 'Attach image or file'}
                  aria-label={attachedImage ? 'Image attached' : 'Attach image'}
                >
                  {isUploadingImage ? (
                    <Upload className="h-[11px] w-[11px] animate-pulse" />
                  ) : (
                    <ImageIcon className="h-[11px] w-[11px]" />
                  )}
                </button>
              )}

              </div>

              {/* Send / Stop (right side, same h-9 as left controls) */}
              <div className="flex items-center gap-1.5 shrink-0 h-8 items-center">
                {isLoading && onStop ? (
                  <button
                    type="button"
                    onClick={onStop}
                    className="inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-lg text-red-400 bg-red-500/15 hover:bg-red-500/25 hover:text-red-300 transition-colors focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:outline-none"
                    title="Stop"
                    aria-label="Stop generation"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isUploadingImage}
                    className="inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
                    title={isUploadingImage ? 'Uploading…' : 'Send'}
                    aria-label={isUploadingImage ? 'Uploading' : 'Send'}
                  >
                    <Send className={`h-3.5 w-3.5 ${isUploadingImage ? 'animate-pulse' : ''}`} aria-hidden />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Resend button (only after a stopped response) */}
          {!isLoading && isStopped && onRegenerateMessage && (
            <div className="flex justify-end mt-1">
              <button type="button" onClick={onRegenerateMessage} className="rounded px-1.5 py-0.5 text-[10px] text-sky-600 dark:text-sky-400 hover:bg-sky-500/10">
                Resend
              </button>
            </div>
          )}
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
