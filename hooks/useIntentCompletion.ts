'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getActionStream } from '@/lib/ai/action-stream';
import type { FileAction } from '@/lib/ai/action-stream';
import {
  matchIntent,
  updateMatchProgress,
  isWorkflowComplete,
  getProgressSummary,
} from '@/lib/ai/intent-matcher';
import type { WorkflowMatch, WorkflowContext } from '@/lib/ai/workflow-patterns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** File context for the intent completion system. */
export interface IntentFileContext {
  fileId: string;
  fileName: string;
  filePath?: string;
  content?: string;
}

/** Options for the useIntentCompletion hook. */
export interface UseIntentCompletionOptions {
  /** All project files for workflow context. */
  projectFiles?: IntentFileContext[];
  /** Minimum confidence to show the panel. Default: 0.6. */
  confidenceThreshold?: number;
  /** Whether the system is enabled. Default: true. */
  enabled?: boolean;
  /** Called when user clicks "Apply All". Receives the pending steps. */
  onApplyAll?: (match: WorkflowMatch) => void | Promise<void>;
  /** Called when user applies a single step. */
  onApplyStep?: (match: WorkflowMatch, stepId: string) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useIntentCompletion(options: UseIntentCompletionOptions = {}) {
  const {
    projectFiles = [],
    confidenceThreshold = 0.6,
    enabled = true,
    onApplyAll,
    onApplyStep,
  } = options;

  const [activeMatch, setActiveMatch] = useState<WorkflowMatch | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Build workflow context from project files
  const workflowContext = useMemo((): WorkflowContext => {
    const allFiles = projectFiles.map((f) => f.filePath ?? f.fileName);

    const searchContent = (pattern: string): string[] => {
      const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      return projectFiles
        .filter((f) => f.content && regex.test(f.content))
        .map((f) => f.filePath ?? f.fileName);
    };

    const getContent = (filePath: string): string | null => {
      const file = projectFiles.find(
        (f) => (f.filePath ?? f.fileName) === filePath,
      );
      return file?.content ?? null;
    };

    return { allFiles, searchContent, getContent };
  }, [projectFiles]);

  // Subscribe to the action stream and run intent matching
  useEffect(() => {
    if (!enabled) return;

    const stream = getActionStream();

    const handleAction = (action: FileAction) => {
      // If we have an active match, check if this action progresses it
      if (activeMatch && !dismissed) {
        const updated = updateMatchProgress(activeMatch, action);
        if (updated !== activeMatch) {
          // Step was completed
          if (isWorkflowComplete(updated)) {
            // All done — clear the panel
            setActiveMatch(null);
            return;
          }
          setActiveMatch(updated);
          return;
        }
      }

      // Try to match a new pattern
      const recentActions = stream.getRecent(120_000);
      const result = matchIntent(action, recentActions, workflowContext, {
        minConfidence: confidenceThreshold,
      });

      if (result.topMatch && result.topMatch.confidence >= confidenceThreshold) {
        setActiveMatch(result.topMatch);
        setDismissed(false);
      }
    };

    const unsubscribe = stream.subscribe(handleAction);
    return unsubscribe;
  }, [enabled, activeMatch, dismissed, workflowContext, confidenceThreshold]);

  // ----- Actions -----

  /** Dismiss the current intent completion panel. */
  const dismiss = useCallback(() => {
    setDismissed(true);
    setActiveMatch(null);
  }, []);

  /** Toggle a step's completed status (for manual checking). */
  const toggleStep = useCallback(
    (stepId: string) => {
      if (!activeMatch) return;

      setActiveMatch((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: prev.steps.map((s) =>
            s.id === stepId ? { ...s, completed: !s.completed } : s,
          ),
        };
      });
    },
    [activeMatch],
  );

  /** Apply a single step's resolution. */
  const applyStep = useCallback(
    (stepId: string) => {
      if (!activeMatch) return;

      // Mark step as completed
      setActiveMatch((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: prev.steps.map((s) =>
            s.id === stepId ? { ...s, completed: true } : s,
          ),
        };
      });

      onApplyStep?.(activeMatch, stepId);
    },
    [activeMatch, onApplyStep],
  );

  /** Apply all pending steps at once. */
  const applyAll = useCallback(() => {
    if (!activeMatch) return;
    onApplyAll?.(activeMatch);

    // Mark all steps as completed
    setActiveMatch((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        steps: prev.steps.map((s) => ({ ...s, completed: true })),
      };
    });
  }, [activeMatch, onApplyAll]);

  /** Progress summary for the current match. */
  const progress = useMemo(() => {
    if (!activeMatch) return null;
    return getProgressSummary(activeMatch);
  }, [activeMatch]);

  /** Whether the panel should be visible. */
  const isVisible = activeMatch !== null && !dismissed;

  return {
    /** The current active workflow match. */
    activeMatch,
    /** Whether the intent completion panel should be shown. */
    isVisible,
    /** Progress summary { total, completed, pending, percentage }. */
    progress,
    /** Dismiss the panel. */
    dismiss,
    /** Toggle a step's completion (manual). */
    toggleStep,
    /** Apply a single step. */
    applyStep,
    /** Apply all pending steps. */
    applyAll,
    /** Whether the system is enabled. */
    enabled,
  } as const;
}
