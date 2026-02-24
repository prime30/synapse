'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { mapCoordinatorPhase, RAIL_PHASE_LABELS } from '@/lib/agents/phase-mapping';
import type { RailPhase } from '@/lib/agents/phase-mapping';
import { safeTransition } from '@/lib/accessibility';
import { getAgentColor, formatAgentLabel } from '@/lib/agents/agent-colors';
import { AgentCard } from './AgentCard';
import { OrchestrationTimeline, type TimelineEntry } from './OrchestrationTimeline';

// ── Strip IDE context and preview from displayed text ───────────────────

const IDE_CONTEXT_PATTERN = /\[IDE Context\][^\n]*(?:\n(?!\n)[^\n]*)*/g;
const PREVIEW_LINE_PATTERN = /\n?Preview:\s*https?:\/\/[^\n]+/gi;

function stripIDEAndPreview(s: string | undefined): string {
  if (!s?.trim()) return s ?? '';
  return s
    .replace(IDE_CONTEXT_PATTERN, '')
    .replace(PREVIEW_LINE_PATTERN, '')
    .trim()
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// ── Types ─────────────────────────────────────────────────────────────

export interface ThinkingStep {
  phase: 'analyzing' | 'planning' | 'executing' | 'reviewing' | 'validating' | 'fixing' | 'change_ready' | 'clarification' | 'budget_warning' | 'reasoning' | 'complete';
  label: string;
  detail?: string;
  agent?: string;
  analysis?: string;
  summary?: string;
  /** Set automatically when the next step arrives or stream completes. */
  done?: boolean;
  /** Timestamp when this step was created (ms since epoch). */
  startedAt?: number;
  /** Diagnostics attached from an SSE diagnostics event. */
  diagnostics?: { file: string; errorCount: number; warningCount: number };
  /** Routing tier assigned by the smart classifier. */
  routingTier?: 'TRIVIAL' | 'SIMPLE' | 'COMPLEX' | 'ARCHITECTURAL';
  /** Model used for this step (e.g. Haiku, Sonnet, Opus). */
  model?: string;
  /** High-level rail phase (computed from phase via mapCoordinatorPhase). */
  railPhase?: import('@/lib/agents/phase-mapping').RailPhase;
  /** Granular sub-phase within the rail phase. */
  subPhase?: import('@/lib/agents/phase-mapping').SubPhase;
  /** Structured metadata for deep-link rendering (files, diagnostics, etc). */
  metadata?: {
    filesRead?: Array<{ fileId: string; fileName: string; path?: string; reason?: string }>;
    filesExcluded?: string[];
    delegations?: Array<{ agentType: string; task: string; affectedFiles: string[] }>;
    affectedFiles?: Array<{ fileId: string; fileName: string; path?: string }>;
    changes?: Array<{ fileName: string; confidence?: number; reasoning?: string }>;
    diagnosticDetails?: Array<{ fileName: string; line: number; column?: number; message: string; severity: 'error' | 'warning'; suggestion?: string }>;
    cost?: { inputTokens: number; outputTokens: number; perAgent?: Array<{ agentType: string; inputTokens: number; outputTokens: number }> };
    designTokenCount?: number;
    styleProfileRules?: number;
    referenceFiles?: Array<{ fileName: string; path?: string }>;
    [key: string]: unknown;
  };
  /** Live LLM reasoning text accumulated from streaming 'reasoning' SSE events. */
  reasoning?: string;
  /** Which agent is producing the current reasoning stream. */
  reasoningAgent?: string;
}

interface ThinkingBlockProps {
  steps: ThinkingStep[];
  isComplete: boolean;
  defaultExpanded?: boolean;
  /** When true, auto-collapse immediately on completion instead of 4s timer. */
  isStreaming?: boolean;
  /** Current progress percentage (0-100). Shown as thin bar when not complete. */
  progress?: number;
  /** Estimated seconds remaining. Shown inline in header. */
  secondsRemaining?: number | null;
  /** Parallel worker progress (from worker_progress SSE events). */
  workers?: Array<{ workerId: string; label: string; status: 'running' | 'complete' }>;
  /** Callback to open a file in the editor. Enables deep-link rendering. */
  onOpenFile?: (path: string, line?: number) => void;
  /** Phase 4b: Show full inner monologue (analysis, metadata, cost) */
  verbose?: boolean;
  /** Phase 4b: Toggle verbose mode */
  onToggleVerbose?: () => void;
}

// -- Phase group type for grouped view --
interface PhaseGroup {
  railPhase: RailPhase;
  label: string;
  steps: ThinkingStep[];
  allDone: boolean;
  hasActive: boolean;
  summary?: string;
}

function groupStepsByPhase(steps: ThinkingStep[]): PhaseGroup[] {
  const grouped = new Map<RailPhase, ThinkingStep[]>();
  const order: RailPhase[] = [];

  for (const step of steps) {
    const rail = step.railPhase ?? mapCoordinatorPhase(step.phase);
    if (!grouped.has(rail)) {
      grouped.set(rail, []);
      order.push(rail);
    }
    grouped.get(rail)!.push(step);
  }

  return order.map((railPhase) => {
    const phaseSteps = grouped.get(railPhase) ?? [];
    const allDone = phaseSteps.every((s) => s.done || s.phase === 'complete');
    const hasActive = phaseSteps.some((s) => !s.done && s.phase !== 'complete');
    const summary = phaseSteps.map((s) => s.summary).filter(Boolean).pop();
    return {
      railPhase,
      label: RAIL_PHASE_LABELS[railPhase],
      steps: phaseSteps,
      allDone,
      hasActive,
      summary,
    };
  });
}

// ── Phase Icons ─────────────────────────────────────────────────────────

function PhaseIcon({ phase, done }: { phase: ThinkingStep['phase']; done?: boolean }) {
  if (done) {
    return (
      <svg className="h-3.5 w-3.5 text-accent shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    );
  }

  // No circle loader: active step uses text shimmer in parent
  if (phase !== 'complete') {
    return (
      <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-sky-500/50 dark:border-sky-400/50 bg-sky-500/10 dark:bg-sky-400/10 inline-block" aria-hidden />
    );
  }

  // Phase-specific icon for 'complete'
  return (
    <svg className="h-3.5 w-3.5 text-accent shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  );
}

const phaseSvg: Record<ThinkingStep['phase'], React.ReactNode> = {
  analyzing: (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  planning: (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  ),
  executing: (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  reviewing: (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  validating: (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" />
    </svg>
  ),
  fixing: (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  change_ready: (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M9 15l2 2 4-4" />
    </svg>
  ),
  clarification: (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  budget_warning: (
    <svg className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  reasoning: (
    <svg className="w-2.5 h-2.5 text-purple-400 dark:text-purple-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  ),
  complete: (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
};

function PhaseLabel({ phase }: { phase: ThinkingStep['phase'] }) {
  return <span className="opacity-60 mr-0.5 inline-flex">{phaseSvg[phase]}</span>;
}

// ── Elapsed time display ────────────────────────────────────────────────

function ElapsedBadge({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState('0.0');

  useEffect(() => {
    // Compute once on mount
    setElapsed(((Date.now() - startedAt) / 1000).toFixed(1));
  }, [startedAt]);

  return (
    <span className="text-[10px] tabular-nums ide-text-quiet font-mono ml-auto shrink-0">
      {elapsed}s
    </span>
  );
}

// ── Agent badges (from shared agent-colors.ts) ─────────────────────────

function getAgentBadgeClasses(agent: string): string {
  const c = getAgentColor(agent);
  return `${c.text} ${c.border} ${c.bg}`;
}

// ── Routing tier badge classes ──────────────────────────────────────────

const TIER_BADGE_CLASSES: Record<string, string> = {
  TRIVIAL: 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  SIMPLE: 'bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 border-sky-500/20',
  COMPLEX: 'bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/20',
  ARCHITECTURAL: 'bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/20',
};

function RoutingTierBadge({ tier, model }: { tier: string; model?: string }) {
  const tierClasses = TIER_BADGE_CLASSES[tier] ?? TIER_BADGE_CLASSES.SIMPLE;
  return (
    <span className="ml-1.5 inline-flex items-center gap-1">
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${tierClasses}`}>
        {tier}
      </span>
      {model && (
        <span className="text-[10px] text-stone-500 dark:text-stone-500">
          {model}
        </span>
      )}
    </span>
  );
}

// ── Deep-link rendering helpers ──────────────────────────────────────────

function FileChip({ fileName, path, reason, onOpenFile }: {
  fileName: string; path?: string; reason?: string;
  onOpenFile?: (path: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenFile?.(path ?? fileName)}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono ide-text-2 ide-surface-input border ide-border-subtle hover:border-sky-500/40 hover:text-sky-500 dark:hover:text-sky-400 transition-colors cursor-pointer"
      title={path ?? fileName}
    >
      <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
      </svg>
      {fileName}
      {reason && <span className="ide-text-muted">({reason})</span>}
    </button>
  );
}

function DiagnosticLink({ diag, onOpenFile }: {
  diag: { fileName: string; line: number; message: string; severity: 'error' | 'warning' };
  onOpenFile?: (path: string, line?: number) => void;
}) {
  const isError = diag.severity === 'error';
  return (
    <button
      type="button"
      onClick={() => onOpenFile?.(diag.fileName, diag.line)}
      className="flex items-start gap-1.5 text-[10px] py-0.5 rounded hover:bg-red-500/5 dark:hover:bg-red-500/10 transition-colors cursor-pointer text-left w-full"
    >
      <span className={`font-mono shrink-0 ${isError ? 'text-red-500 dark:text-red-400' : 'text-amber-500 dark:text-amber-400'}`}>
        {diag.fileName}:{diag.line}
      </span>
      <span className="ide-text-3 truncate">{diag.message}</span>
    </button>
  );
}

function StepMetadata({ step, onOpenFile }: { step: ThinkingStep; onOpenFile?: (path: string, line?: number) => void }) {
  const meta = step.metadata;
  if (!meta || !onOpenFile) return null;

  return (
    <div className="mt-1 space-y-1">
      {/* Files read */}
      {meta.filesRead && meta.filesRead.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {meta.filesRead.slice(0, 8).map((f) => (
            <FileChip key={f.fileId} fileName={f.fileName} path={f.path} reason={f.reason} onOpenFile={onOpenFile} />
          ))}
          {meta.filesRead.length > 8 && (
            <span className="text-[10px] ide-text-muted self-center">+{meta.filesRead.length - 8} more</span>
          )}
        </div>
      )}
      {/* Affected files */}
      {meta.affectedFiles && meta.affectedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {meta.affectedFiles.map((f) => (
            <FileChip key={f.fileId} fileName={f.fileName} path={f.path} onOpenFile={onOpenFile} />
          ))}
        </div>
      )}
      {/* Changes with confidence */}
      {meta.changes && meta.changes.length > 0 && (
        <div className="space-y-0.5">
          {meta.changes.map((c, i) => (
            <button
              key={`${c.fileName}-${i}`}
              type="button"
              onClick={() => onOpenFile(c.fileName)}
              className="flex items-center gap-1.5 text-[10px] py-0.5 rounded hover:bg-sky-500/5 dark:hover:bg-sky-500/10 transition-colors cursor-pointer text-left w-full"
            >
              <span className="font-mono ide-text-2">{c.fileName}</span>
              {c.confidence != null && (
                <span className={`rounded-full px-1 py-0 text-[9px] font-medium border ${c.confidence >= 0.8 ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/10' : 'text-amber-600 dark:text-amber-400 border-amber-500/20 bg-amber-500/10'}`}>
                  {Math.round(c.confidence * 100)}%
                </span>
              )}
              {c.reasoning && <span className="ide-text-3 truncate">{c.reasoning.slice(0, 60)}</span>}
            </button>
          ))}
        </div>
      )}
      {/* Diagnostic details */}
      {meta.diagnosticDetails && meta.diagnosticDetails.length > 0 && (
        <div className="space-y-0.5">
          {meta.diagnosticDetails.slice(0, 5).map((d, i) => (
            <DiagnosticLink key={`${d.fileName}-${d.line}-${i}`} diag={d} onOpenFile={onOpenFile} />
          ))}
          {meta.diagnosticDetails.length > 5 && (
            <span className="text-[10px] ide-text-muted">+{meta.diagnosticDetails.length - 5} more</span>
          )}
        </div>
      )}
      {/* Reference sections */}
      {meta.referenceFiles && meta.referenceFiles.length > 0 && (
        <div role="group" aria-label="Reference sections" className="space-y-1">
          <span className="text-[10px] ide-text-muted uppercase tracking-wider">Reference sections</span>
          <div className="flex flex-wrap gap-1">
            {meta.referenceFiles.map((f) => (
              <FileChip key={f.path ?? f.fileName} fileName={f.fileName} path={f.path} onOpenFile={onOpenFile} />
            ))}
          </div>
        </div>
      )}
      {/* Delegations */}
      {meta.delegations && meta.delegations.length > 0 && (
        <div className="space-y-1">
          {meta.delegations.map((d, i) => (
            <div key={`${d.agentType}-${i}`} className="flex items-start gap-1.5">
              <span className={`shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${getAgentBadgeClasses(d.agentType)}`}>
                {formatAgentLabel(d.agentType)}
              </span>
              <div className="flex flex-wrap gap-1 min-w-0">
                {d.affectedFiles.slice(0, 4).map((f) => (
                  <FileChip key={f} fileName={f.split('/').pop() ?? f} path={f} onOpenFile={onOpenFile} />
                ))}
                {d.affectedFiles.length > 4 && (
                  <span className="text-[10px] ide-text-muted self-center">+{d.affectedFiles.length - 4}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Phase checkbox icon ──────────────────────────────────────────────────

function PhaseCheckbox({ checked, active }: { checked: boolean; active: boolean }) {
  if (checked) {
    return (
      <div className="w-4 h-4 rounded border-2 border-[oklch(0.745_0.189_148)] bg-[oklch(0.745_0.189_148)] flex items-center justify-center shrink-0" role="checkbox" aria-checked="true">
        <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </div>
    );
  }
  if (active) {
    return (
      <div className="w-4 h-4 rounded border-2 border-sky-500 dark:border-sky-400 flex items-center justify-center shrink-0 bg-sky-500/10 dark:bg-sky-400/10" role="checkbox" aria-checked="mixed" />
    );
  }
  return (
    <div className="w-4 h-4 rounded border-2 border-stone-300 dark:border-white/10 bg-white dark:bg-white/5 shrink-0" role="checkbox" aria-checked="false" />
  );
}

// ── Component ───────────────────────────────────────────────────────────

export function ThinkingBlock({
  steps,
  isComplete,
  defaultExpanded = true,
  isStreaming = false,
  progress,
  secondsRemaining,
  workers,
  onOpenFile,
  verbose = false,
  onToggleVerbose,
}: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const wasCompleteRef = useRef(isComplete);
  const userInteractedRef = useRef(false);

  // Auto-collapse when thinking completes
  // isStreaming=true → collapse with minimal delay when first content arrives
  // isStreaming=false → 4s delay (historical messages)
  useEffect(() => {
    if (isComplete && !wasCompleteRef.current) {
      if (!userInteractedRef.current) {
        const delay = isStreaming ? 50 : 4000;
        const timer = setTimeout(() => setExpanded(false), delay);
        return () => clearTimeout(timer);
      }
    }
    wasCompleteRef.current = isComplete;
  }, [isComplete, isStreaming]);

  const handleToggle = () => {
    userInteractedRef.current = true;
    setExpanded((e) => !e);
  };

  // Phase grouping
  const phaseGroups = useMemo(() => groupStepsByPhase(steps), [steps]);
  // Track which phase sections are expanded (active ones auto-expand)
  const [expandedPhases, setExpandedPhases] = useState<Set<RailPhase>>(new Set());

  // Auto-expand the active phase, auto-collapse completed phases
  useEffect(() => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      for (const group of phaseGroups) {
        if (group.hasActive) next.add(group.railPhase);
        else if (group.allDone && !userInteractedRef.current) next.delete(group.railPhase);
      }
      return next;
    });
  }, [phaseGroups]);

  const togglePhase = (phase: RailPhase) => {
    userInteractedRef.current = true;
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  };

  if (steps.length === 0) return null;

  const completedCount = steps.filter((s) => s.done || s.phase === 'complete').length;
  const latestActiveStep = [...steps].reverse().find((s) => !s.done && s.phase !== 'complete');

  return (
    <div className="mb-2">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={expanded}
        aria-controls="thinking-content"
        className="flex w-full items-center gap-1.5 rounded-lg ide-surface-inset border ide-border-subtle px-3 py-1.5 text-left transition-colors ide-hover"
      >
        {!isComplete && (
          <span className="h-3 w-3 shrink-0 rounded-full border-2 border-sky-500/50 dark:border-sky-400/50 bg-sky-500/10 dark:bg-sky-400/10 inline-block" aria-hidden />
        )}
        {isComplete && (
          <svg className="h-3 w-3 text-accent shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
        <span className={`text-xs ide-text-2 font-medium flex-1 min-w-0 truncate ${!isComplete ? 'animate-pulse' : ''}`}>
          {isComplete
            ? `Thinking (${steps.length} steps)`
            : `Thinking... (${completedCount}/${steps.length})`}
          {!isComplete && latestActiveStep?.label && (
            <span className="ide-text-muted font-normal ml-1">
              {'· '}
              {stripIDEAndPreview(latestActiveStep.label)}
            </span>
          )}
          {!isComplete && latestActiveStep?.agent && (
            <span className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${getAgentBadgeClasses(latestActiveStep.agent)}`}>
              {latestActiveStep.agent}
            </span>
          )}
        </span>
        {/* Seconds remaining estimate (inline in header) */}
        {!isComplete && secondsRemaining != null && (
          <span className="text-[10px] tabular-nums ide-text-quiet font-mono shrink-0 mr-1" aria-live="polite">
            ~{secondsRemaining}s
          </span>
        )}
        {/* Phase 4b: Verbose toggle */}
        {onToggleVerbose && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleVerbose(); }}
            className={'shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ' + (verbose ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20' : 'ide-text-muted hover:ide-text-3')}
            title={verbose ? 'Switch to summary mode' : 'Show full inner monologue'}
            aria-label={verbose ? 'Verbose mode on' : 'Verbose mode off'}
          >
            {verbose ? 'Verbose' : 'Summary'}
          </button>
        )}
        <svg
          className={'h-3 w-3 ide-text-3 transition-transform shrink-0 ' + (expanded ? 'rotate-180' : '')}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Inline progress bar (thin, below header, only when running) */}
      {!isComplete && progress != null && (
        <div className="h-0.5 rounded-full bg-stone-200 dark:bg-white/10 overflow-hidden mx-1 mt-0.5" aria-live="polite">
          <div
            className="h-full rounded-full bg-accent/70 transition-all duration-150 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Expanded content — phase-grouped view */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            id="thinking-content"
            role="region"
            aria-label="Agent thinking details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={safeTransition(0.2)}
            className="overflow-hidden"
          >
            <div className="mt-1 space-y-1">
              {phaseGroups.map((group) => {
                const isPhaseExpanded = expandedPhases.has(group.railPhase);
                return (
                  <div key={group.railPhase} className="rounded-lg ide-surface-inset border ide-border-subtle" role="group" aria-label={`Phase: ${group.label}`}>
                    {/* Phase group header */}
                    <button
                      type="button"
                      onClick={() => togglePhase(group.railPhase)}
                      aria-expanded={isPhaseExpanded}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ide-hover rounded-lg"
                    >
                      <PhaseCheckbox checked={group.allDone} active={group.hasActive} />
                      <span className={`text-xs font-medium flex-1 ${group.allDone ? 'ide-text-muted line-through' : group.hasActive ? 'ide-text animate-pulse' : 'ide-text-3'}`}>
                        {stripIDEAndPreview(group.label)}
                      </span>
                      {group.allDone && group.summary && (
                        <span className="text-[10px] ide-text-3 truncate max-w-[140px]">{stripIDEAndPreview(group.summary)}</span>
                      )}
                      {/* Elapsed time for completed groups */}
                      {group.allDone && group.steps[0]?.startedAt && (
                        <ElapsedBadge startedAt={group.steps[0].startedAt} />
                      )}
                      <svg
                        className={`h-3 w-3 ide-text-3 transition-transform shrink-0 ${isPhaseExpanded ? 'rotate-180' : ''}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>

                    {/* Phase group steps */}
                    <AnimatePresence>
                      {isPhaseExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={safeTransition(0.15)}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-2 space-y-0.5 border-t border-stone-200/50 dark:border-white/5">
                            {group.steps.map((step, i) => (
                              <div key={`${step.phase}-${i}`} className="flex items-start gap-2 py-0.5 pl-6">
                                <div className="mt-0.5">
                                  <PhaseIcon phase={step.phase} done={step.done} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <PhaseLabel phase={step.phase} />
                                    <span className={`text-xs font-medium ${step.done ? 'ide-text-muted' : 'ide-text animate-pulse'}`}>
                                      {stripIDEAndPreview(step.label)}
                                    </span>
                                    {step.agent && (
                                      <span className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${getAgentBadgeClasses(step.agent)}`}>
                                        {step.agent}
                                      </span>
                                    )}
                                    {step.routingTier && (
                                      <RoutingTierBadge tier={step.routingTier} model={step.model} />
                                    )}
                                    {(step.metadata?.styleProfileRules ?? step.metadata?.designTokenCount) != null && (
                                      <span
                                        className="text-[10px] ide-text-quiet font-mono shrink-0"
                                        aria-label="Style profile rule count"
                                        aria-live="polite"
                                      >
                                        Style profile: {step.metadata?.styleProfileRules ?? step.metadata?.designTokenCount} rules
                                      </span>
                                    )}
                                    {step.diagnostics && (
                                      <span className="ml-1.5 inline-flex items-center gap-1">
                                        {step.diagnostics.errorCount > 0 && (
                                          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-red-500/10 dark:bg-red-500/20 text-red-500 dark:text-red-400 border border-red-500/20">
                                            {step.diagnostics.errorCount} error{step.diagnostics.errorCount !== 1 ? 's' : ''}
                                          </span>
                                        )}
                                        {step.diagnostics.warningCount > 0 && (
                                          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/10 dark:bg-amber-500/20 text-amber-500 dark:text-amber-400 border border-amber-500/20">
                                            {step.diagnostics.warningCount} warning{step.diagnostics.warningCount !== 1 ? 's' : ''}
                                          </span>
                                        )}
                                      </span>
                                    )}
                                    {step.done && step.startedAt && (
                                      <ElapsedBadge startedAt={step.startedAt} />
                                    )}
                                  </div>
                                  {step.detail && step.phase !== 'clarification' && (
                                    <p className="text-[11px] ide-text-3 mt-0.5 leading-relaxed">{stripIDEAndPreview(step.detail)}</p>
                                  )}
                                  {/* Live LLM reasoning stream */}
                                  {step.reasoning && (
                                    <details className="mt-1 group/reasoning" open={!step.done}>
                                      <summary className="text-[10px] ide-text-muted cursor-pointer select-none hover:ide-text-2 transition-colors flex items-center gap-1">
                                        <svg className="w-3 h-3 transition-transform group-open/reasoning:rotate-90" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                                          <path d="M4.5 2.5l4 3.5-4 3.5" />
                                        </svg>
                                        {step.reasoningAgent ?? 'agent'} reasoning
                                        {!step.done && <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse ml-1" />}
                                      </summary>
                                      <pre className="mt-1 text-[11px] ide-text-3 leading-relaxed whitespace-pre-wrap break-words font-mono bg-black/5 dark:bg-white/5 rounded-md p-2 max-h-48 overflow-y-auto border border-stone-200/50 dark:border-white/5">
                                        {step.reasoning}
                                      </pre>
                                    </details>
                                  )}
                                  {/* Phase 4b: Analysis only in verbose mode */}
                                  {verbose && step.analysis && (
                                    <p className="text-[11px] ide-text-3 mt-0.5 leading-relaxed italic border-l-2 border-purple-500/30 pl-2">{stripIDEAndPreview(step.analysis)}</p>
                                  )}
                                  {step.summary && (
                                    <p className="text-[11px] ide-text-2 mt-0.5 leading-relaxed">{stripIDEAndPreview(step.summary)}</p>
                                  )}
                                  {/* Deep-link metadata rendering — full in verbose, minimal in summary */}
                                  <StepMetadata step={step} onOpenFile={onOpenFile} />
                                  {/* Phase 4b: Cost info in verbose mode */}
                                  {verbose && step.metadata?.cost && (
                                    <div className="mt-1 flex items-center gap-2 text-[10px] ide-text-muted font-mono">
                                      <span>{'in: ' + (step.metadata.cost.inputTokens ?? 0).toLocaleString() + ' tok'}</span>
                                      <span>{'out: ' + (step.metadata.cost.outputTokens ?? 0).toLocaleString() + ' tok'}</span>
                                    </div>
                                  )}
                                  {!step.done && step.phase !== 'complete' && (() => {
                                    const nextPhase: Record<string, string> = {
                                      analyzing: 'Planning changes',
                                      planning: 'Executing changes',
                                      executing: 'Reviewing result',
                                      reviewing: 'Finishing up',
                                      clarification: 'Awaiting your response',
                                    };
                                    const hint = nextPhase[step.phase];
                                    return hint ? (
                                      <p className="text-[10px] ide-text-muted italic mt-0.5">Next: {hint}</p>
                                    ) : null;
                                  })()}
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase 8b: Per-agent progress cards */}
      {workers && workers.length > 0 && (
        <div className="mt-2 pt-2 border-t border-stone-200 dark:border-white/5 space-y-1" aria-label="Parallel agent workers" role="region">
          <p className="text-[10px] text-stone-500 dark:text-stone-500 uppercase tracking-wider mb-1" aria-live="polite">
            {'Parallel Agents (' + workers.filter(w => w.status === 'running').length + ' active, ' + workers.filter(w => w.status === 'complete').length + ' done)'}
          </p>
          {workers.map(worker => (
            <AgentCard
              key={worker.workerId}
              workerId={worker.workerId}
              label={worker.label}
              status={worker.status}
            />
          ))}
        </div>
      )}

      {/* Phase 8d: Orchestration timeline (derived from thinking steps) */}
      {isComplete && steps.length > 2 && (() => {
        const timelineEntries: TimelineEntry[] = [];
        const agentStarts = new Map<string, number>();
        const agentPhases = new Map<string, TimelineEntry['phase']>();
        for (const step of steps) {
          if (!step.agent || !step.startedAt) continue;
          if (!agentStarts.has(step.agent)) {
            agentStarts.set(step.agent, step.startedAt);
          }
          const p = step.phase;
          if (p === 'analyzing' || p === 'executing' || p === 'reviewing' || p === 'complete') {
            agentPhases.set(step.agent, p);
          }
        }
        for (const [agent, start] of agentStarts.entries()) {
          let end: number | undefined;
          for (let i = steps.length - 1; i >= 0; i--) {
            if (steps[i].agent === agent && steps[i].startedAt) {
              end = steps[i].startedAt! + 1000;
              break;
            }
          }
          timelineEntries.push({
            agentId: agent,
            label: agent,
            startMs: start,
            endMs: end,
            phase: agentPhases.get(agent) ?? 'complete',
          });
        }
        if (timelineEntries.length < 2) return null;
        return <OrchestrationTimeline entries={timelineEntries} className="mt-2" />;
      })()}
    </div>
  );
}
