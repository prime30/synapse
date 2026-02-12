'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  SessionIntent,
  BehaviorEvent,
} from '@/lib/ai/session-intent';
import { getSessionTracker } from '@/lib/ai/session-intent';
import {
  type AmbientSignalType,
  shouldShowNudge,
  recordNudgeFeedback,
} from '@/lib/ai/nudge-feedback';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A detected ambient signal with resolution action. */
export interface AmbientNudge {
  id: string;
  signalType: AmbientSignalType;
  /** Human-readable message shown in the ambient bar. */
  message: string;
  /** Confidence score 0–1. */
  confidence: number;
  /** Short label for the one-click action button. */
  actionLabel: string;
  /** Identifier for the resolution action to trigger on "Yes". */
  actionId: string;
  /** Contextual data passed to the resolution handler. */
  actionPayload?: Record<string, unknown>;
  /** When this nudge was created. */
  createdAt: number;
  /** Auto-expire after this many ms (0 = never). */
  expiresAfterMs: number;
}

/** File context provided to the ambient intelligence system. */
export interface AmbientFileContext {
  fileId: string;
  fileName: string;
  content: string;
  path?: string;
}

/** Resolution handler invoked when user clicks "Yes" on a nudge. */
export type NudgeResolutionHandler = (
  nudge: AmbientNudge,
) => void | Promise<void>;

/** Options for the useAmbientIntelligence hook. */
export interface UseAmbientIntelligenceOptions {
  /** Currently active file context. */
  activeFile?: AmbientFileContext | null;
  /** All project files for cross-file analysis. */
  projectFiles?: AmbientFileContext[];
  /** How often to re-scan for signals (ms). Default: 5000. */
  scanIntervalMs?: number;
  /** Auto-expiry time for nudges (ms). Default: 30000. */
  nudgeExpiryMs?: number;
  /** Whether ambient intelligence is enabled. Default: true. */
  enabled?: boolean;
  /** Handler called when a nudge resolution is triggered. */
  onResolve?: NudgeResolutionHandler;
}

// ---------------------------------------------------------------------------
// Signal detectors
// ---------------------------------------------------------------------------

/**
 * Detect missing {% schema %} in section files.
 */
function detectMissingSchema(
  activeFile: AmbientFileContext | null | undefined,
): AmbientNudge | null {
  const file = activeFile;
  if (!file) return null;

  const filePath = file.path ?? file.fileName;
  const isSectionFile =
    filePath.startsWith('sections/') || filePath.includes('/sections/');
  if (!isSectionFile || !filePath.endsWith('.liquid')) return null;

  const hasSchema = /\{%-?\s*schema\s*-?%\}/.test(file.content);
  if (hasSchema) return null;

  return {
    id: `missing-schema:${file.fileId}`,
    signalType: 'missing-schema',
    message: 'This section has no schema — generate one?',
    confidence: 0.85,
    actionLabel: 'Generate schema',
    actionId: 'generate-schema',
    actionPayload: { fileId: file.fileId, fileName: file.fileName },
    createdAt: Date.now(),
    expiresAfterMs: 0,
  };
}

/**
 * Detect unused {% assign %} variables in the active file.
 */
function detectUnusedVariables(
  activeFile: AmbientFileContext | null | undefined,
): AmbientNudge | null {
  const file = activeFile;
  if (!file || !file.fileName.endsWith('.liquid')) return null;

  const assignRegex = /\{%-?\s*assign\s+(\w+)\s*=/g;
  const unusedVars: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = assignRegex.exec(file.content)) !== null) {
    const varName = match[1];
    // Check if variable is used anywhere else in the file
    const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const usageRegex = new RegExp(`\\b${escaped}\\b`, 'g');
    const allMatches = file.content.match(usageRegex);
    // If the variable only appears once (the assign itself), it's unused
    if (allMatches && allMatches.length <= 1) {
      unusedVars.push(varName);
    }
  }

  if (unusedVars.length === 0) return null;

  const varList = unusedVars.slice(0, 3).join(', ');
  const suffix = unusedVars.length > 3 ? ` (+${unusedVars.length - 3} more)` : '';

  return {
    id: `unused-variable:${file.fileId}:${unusedVars[0]}`,
    signalType: 'unused-variable',
    message: `Unused variable${unusedVars.length > 1 ? 's' : ''}: ${varList}${suffix} — remove?`,
    confidence: 0.7 + Math.min(0.2, unusedVars.length * 0.05),
    actionLabel: 'Remove unused',
    actionId: 'remove-unused-variables',
    actionPayload: { fileId: file.fileId, fileName: file.fileName, variables: unusedVars },
    createdAt: Date.now(),
    expiresAfterMs: 0,
  };
}

/**
 * Detect broken {% render %} references.
 */
function detectBrokenReferences(
  activeFile: AmbientFileContext | null | undefined,
  projectFiles: AmbientFileContext[],
): AmbientNudge | null {
  const file = activeFile;
  if (!file || !file.fileName.endsWith('.liquid')) return null;

  const renderRegex = /\{%-?\s*render\s+['"]([^'"]+)['"]/g;
  const fileSet = new Set(
    projectFiles.map((f) => (f.path ?? f.fileName).replace(/\\/g, '/').replace(/^\.?\//, '')),
  );

  const brokenRefs: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = renderRegex.exec(file.content)) !== null) {
    const name = match[1];
    const snippetPath = name.endsWith('.liquid')
      ? `snippets/${name}`
      : `snippets/${name}.liquid`;

    if (!fileSet.has(snippetPath)) {
      brokenRefs.push(name);
    }
  }

  if (brokenRefs.length === 0) return null;

  return {
    id: `broken-reference:${file.fileId}:${brokenRefs[0]}`,
    signalType: 'broken-reference',
    message: `Broken reference: snippet "${brokenRefs[0]}" not found — fix?`,
    confidence: 0.9,
    actionLabel: 'Fix reference',
    actionId: 'fix-broken-reference',
    actionPayload: { fileId: file.fileId, fileName: file.fileName, references: brokenRefs },
    createdAt: Date.now(),
    expiresAfterMs: 0,
  };
}

/**
 * Detect style inconsistencies (e.g. mixed color formats, inconsistent spacing).
 */
function detectStyleInconsistency(
  activeFile: AmbientFileContext | null | undefined,
): AmbientNudge | null {
  const file = activeFile;
  if (!file) return null;

  const filePath = file.path ?? file.fileName;
  const isCSS = filePath.endsWith('.css') || filePath.endsWith('.scss');
  const isLiquid = filePath.endsWith('.liquid');
  if (!isCSS && !isLiquid) return null;

  // Check for mixed color formats: hex, rgb, hsl
  const hexColors = (file.content.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
  const rgbColors = (file.content.match(/\brgba?\s*\(/gi) ?? []).length;
  const hslColors = (file.content.match(/\bhsla?\s*\(/gi) ?? []).length;

  const formats = [hexColors > 0, rgbColors > 0, hslColors > 0].filter(Boolean).length;

  if (formats < 2) return null;

  return {
    id: `style-inconsistency:${file.fileId}:color-format`,
    signalType: 'style-inconsistency',
    message: 'Mixed color formats (hex, rgb, hsl) — standardize?',
    confidence: 0.55 + Math.min(0.3, formats * 0.15),
    actionLabel: 'Standardize colors',
    actionId: 'standardize-colors',
    actionPayload: { fileId: file.fileId, fileName: file.fileName, hexColors, rgbColors, hslColors },
    createdAt: Date.now(),
    expiresAfterMs: 0,
  };
}

/**
 * Detect performance issues (large inline scripts, render-blocking, deep nesting).
 */
function detectPerformanceIssue(
  activeFile: AmbientFileContext | null | undefined,
): AmbientNudge | null {
  const file = activeFile;
  if (!file) return null;

  const filePath = file.path ?? file.fileName;

  // Check for deeply nested Liquid blocks
  if (filePath.endsWith('.liquid')) {
    const blockOpen = /\{%-?\s*(if|for|unless|case)\b/g;
    const blockClose = /\{%-?\s*end(if|for|unless|case)\b/g;
    const lines = file.content.split('\n');
    let depth = 0;
    let maxDepth = 0;

    for (const line of lines) {
      const opens = (line.match(blockOpen) ?? []).length;
      blockOpen.lastIndex = 0;
      const closes = (line.match(blockClose) ?? []).length;
      blockClose.lastIndex = 0;
      depth += opens - closes;
      if (depth > maxDepth) maxDepth = depth;
    }

    if (maxDepth > 5) {
      return {
        id: `performance-issue:${file.fileId}:nesting`,
        signalType: 'performance-issue',
        message: `Deep nesting (${maxDepth} levels) — extract to snippet?`,
        confidence: 0.6 + Math.min(0.3, (maxDepth - 5) * 0.1),
        actionLabel: 'Refactor nesting',
        actionId: 'refactor-deep-nesting',
        actionPayload: { fileId: file.fileId, fileName: file.fileName, depth: maxDepth },
        createdAt: Date.now(),
        expiresAfterMs: 0,
      };
    }
  }

  // Check for large inline scripts
  const inlineScriptMatch = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch: RegExpExecArray | null;
  while ((scriptMatch = inlineScriptMatch.exec(file.content)) !== null) {
    const body = scriptMatch[1];
    if (body && body.length > 500) {
      return {
        id: `performance-issue:${file.fileId}:inline-script`,
        signalType: 'performance-issue',
        message: `Large inline script (${body.length} chars) — externalize?`,
        confidence: 0.65,
        actionLabel: 'Externalize script',
        actionId: 'externalize-script',
        actionPayload: { fileId: file.fileId, fileName: file.fileName, scriptSize: body.length },
        createdAt: Date.now(),
        expiresAfterMs: 0,
      };
    }
  }

  return null;
}

/**
 * Detect accessibility gaps (missing alt, missing labels).
 */
function detectAccessibilityGap(
  activeFile: AmbientFileContext | null | undefined,
): AmbientNudge | null {
  const file = activeFile;
  if (!file) return null;

  const issues: string[] = [];

  // Missing alt on images
  const imgRegex = /<img\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  let missingAlt = 0;

  while ((match = imgRegex.exec(file.content)) !== null) {
    if (!/\balt\s*=/i.test(match[0])) {
      missingAlt++;
    }
  }

  if (missingAlt > 0) {
    issues.push(`${missingAlt} image${missingAlt > 1 ? 's' : ''} missing alt`);
  }

  // Missing form labels
  const inputRegex = /<input\b[^>]*>/gi;
  let missingLabel = 0;

  while ((match = inputRegex.exec(file.content)) !== null) {
    const tag = match[0];
    if (/type\s*=\s*["']hidden["']/i.test(tag)) continue;
    if (!/\baria-label/i.test(tag)) {
      missingLabel++;
    }
  }

  if (missingLabel > 0) {
    issues.push(`${missingLabel} input${missingLabel > 1 ? 's' : ''} missing label`);
  }

  if (issues.length === 0) return null;

  return {
    id: `accessibility-gap:${file.fileId}:${issues[0]}`,
    signalType: 'accessibility-gap',
    message: `Accessibility: ${issues.join(', ')} — fix?`,
    confidence: 0.6 + Math.min(0.3, (missingAlt + missingLabel) * 0.05),
    actionLabel: 'Fix accessibility',
    actionId: 'fix-accessibility',
    actionPayload: {
      fileId: file.fileId,
      fileName: file.fileName,
      missingAlt,
      missingLabel,
    },
    createdAt: Date.now(),
    expiresAfterMs: 0,
  };
}

// ---------------------------------------------------------------------------
// All detectors
// ---------------------------------------------------------------------------

type SignalDetector = (
  activeFile: AmbientFileContext | null | undefined,
  projectFiles: AmbientFileContext[],
) => AmbientNudge | null;

// Wrap single-arg detectors to match the uniform SignalDetector signature
const DETECTORS: SignalDetector[] = [
  (f) => detectMissingSchema(f),
  (f) => detectUnusedVariables(f),
  detectBrokenReferences,
  (f) => detectStyleInconsistency(f),
  (f) => detectPerformanceIssue(f),
  (f) => detectAccessibilityGap(f),
];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAmbientIntelligence(options: UseAmbientIntelligenceOptions = {}) {
  const {
    activeFile = null,
    projectFiles = [],
    scanIntervalMs = 5000,
    nudgeExpiryMs = 30000,
    enabled = true,
    onResolve,
  } = options;

  const [nudges, setNudges] = useState<AmbientNudge[]>([]);
  const [sessionIntent, setSessionIntent] = useState<SessionIntent | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Subscribe to session intent changes
  useEffect(() => {
    if (!enabled) return;
    const tracker = getSessionTracker();
    const unsubscribe = tracker.subscribe(setSessionIntent);
    return unsubscribe;
  }, [enabled]);

  // Periodic signal scanning
  useEffect(() => {
    if (!enabled) return;

    const scan = () => {
      const detected: AmbientNudge[] = [];

      for (const detector of DETECTORS) {
        try {
          const nudge = detector(activeFile, projectFiles);
          if (nudge && !dismissedIds.has(nudge.id) && shouldShowNudge(nudge.signalType, nudge.confidence)) {
            detected.push({
              ...nudge,
              expiresAfterMs: nudge.expiresAfterMs || nudgeExpiryMs,
            });
          }
        } catch {
          // Individual detector failures should not break the system
        }
      }

      // Sort by confidence (highest first), deduplicate by signal type
      detected.sort((a, b) => b.confidence - a.confidence);
      const seen = new Set<AmbientSignalType>();
      const deduped = detected.filter((n) => {
        if (seen.has(n.signalType)) return false;
        seen.add(n.signalType);
        return true;
      });

      setNudges(deduped);
    };

    // Initial scan
    scan();

    // Periodic re-scan
    const interval = setInterval(scan, scanIntervalMs);
    return () => clearInterval(interval);
  }, [activeFile, projectFiles, scanIntervalMs, nudgeExpiryMs, enabled, dismissedIds]);

  // Auto-expire nudges via timeouts (never synchronous setState in effect body)
  useEffect(() => {
    if (nudges.length === 0) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    for (const nudge of nudges) {
      if (nudge.expiresAfterMs > 0) {
        const elapsed = Date.now() - nudge.createdAt;
        const remaining = Math.max(0, nudge.expiresAfterMs - elapsed);

        // Always use setTimeout — even for already-expired nudges (remaining = 0)
        const timer = setTimeout(() => {
          recordNudgeFeedback(nudge.signalType, 'expired', nudge.actionPayload?.fileName as string);
          setNudges((prev) => prev.filter((n) => n.id !== nudge.id));
        }, remaining);
        timers.push(timer);
      }
    }

    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [nudges]);

  // ----- Actions -----

  /** Accept a nudge — triggers its resolution action. */
  const acceptNudge = useCallback(
    (nudgeId: string) => {
      // Find the target nudge from the current state snapshot
      const target = nudges.find((n) => n.id === nudgeId);
      if (target) {
        recordNudgeFeedback(target.signalType, 'accepted', target.actionPayload?.fileName as string);
        onResolve?.(target);
      }
      setNudges((prev) => prev.filter((n) => n.id !== nudgeId));
    },
    [nudges, onResolve],
  );

  /** Dismiss a nudge — records negative feedback. */
  const dismissNudge = useCallback(
    (nudgeId: string) => {
      setNudges((prev) => {
        const target = prev.find((n) => n.id === nudgeId);
        if (target) {
          recordNudgeFeedback(target.signalType, 'dismissed', target.actionPayload?.fileName as string);
        }
        return prev.filter((n) => n.id !== nudgeId);
      });
      setDismissedIds((prev) => new Set([...prev, nudgeId]));
    },
    [],
  );

  /** Record a behavior event (delegates to the global tracker). */
  const recordEvent = useCallback((event: Omit<BehaviorEvent, 'timestamp'>) => {
    const tracker = getSessionTracker();
    tracker.push({ ...event, timestamp: Date.now() });
  }, []);

  /** The highest-confidence nudge to display. */
  const topNudge = useMemo(() => nudges[0] ?? null, [nudges]);

  return {
    /** All currently active nudges, sorted by confidence. */
    nudges,
    /** The highest-confidence nudge (shown in the ambient bar). */
    topNudge,
    /** Current session intent. */
    sessionIntent,
    /** Accept (resolve) a nudge by ID. */
    acceptNudge,
    /** Dismiss a nudge by ID. */
    dismissNudge,
    /** Record a user behavior event. */
    recordEvent,
    /** Whether the system is enabled. */
    enabled,
  } as const;
}
