/**
 * Session Intent — tracks user behavior events in a rolling time window
 * to detect patterns and infer editing intent for proactive nudges.
 *
 * Pure functions + lightweight class, no React dependencies.
 * @module lib/ai/session-intent
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Categories of user behavior events the system tracks. */
export type BehaviorEventType =
  | 'file-open'
  | 'file-edit'
  | 'file-save'
  | 'file-close'
  | 'file-create'
  | 'file-rename'
  | 'file-delete'
  | 'preview-interact'
  | 'preview-navigate'
  | 'suggestion-accept'
  | 'suggestion-dismiss'
  | 'agent-send'
  | 'agent-apply'
  | 'schema-edit'
  | 'error-encounter';

/** A single tracked behavior event. */
export interface BehaviorEvent {
  type: BehaviorEventType;
  timestamp: number;
  /** The file involved, if any. */
  fileId?: string;
  fileName?: string;
  /** Additional metadata (e.g. error type, edit region, preview element). */
  metadata?: Record<string, unknown>;
}

/** High-level session intent inferred from the event stream. */
export type SessionIntentType =
  | 'exploring'       // Opening many files without editing
  | 'focused-editing' // Repeated edits in one file
  | 'multi-file-edit' // Editing across related files
  | 'schema-authoring'// Editing schema blocks
  | 'debugging'       // Error encounters + quick file switches
  | 'reviewing'       // Preview interactions + file opens
  | 'idle';           // No recent activity

/** The current session intent with confidence score. */
export interface SessionIntent {
  type: SessionIntentType;
  /** 0–1 confidence that this is the correct intent. */
  confidence: number;
  /** Files most relevant to the current intent. */
  activeFiles: string[];
  /** When this intent was last computed. */
  computedAt: number;
}

// ---------------------------------------------------------------------------
// SessionIntentTracker
// ---------------------------------------------------------------------------

const DEFAULT_WINDOW_MS = 60_000; // 60 seconds
const MAX_EVENTS = 200;

export class SessionIntentTracker {
  private events: BehaviorEvent[] = [];
  private windowMs: number;
  private listeners: Array<(intent: SessionIntent) => void> = [];

  constructor(windowMs: number = DEFAULT_WINDOW_MS) {
    this.windowMs = windowMs;
  }

  // -----------------------------------------------------------------------
  // Event recording
  // -----------------------------------------------------------------------

  /** Record a new behavior event and recompute intent. */
  push(event: BehaviorEvent): SessionIntent {
    this.events.push(event);

    // Prune old events outside the rolling window
    this.prune();

    const intent = this.computeIntent();
    this.notify(intent);
    return intent;
  }

  /** Get all events in the current rolling window. */
  getEvents(): readonly BehaviorEvent[] {
    this.prune();
    return this.events;
  }

  /** Clear all events. */
  clear(): void {
    this.events = [];
  }

  // -----------------------------------------------------------------------
  // Subscription
  // -----------------------------------------------------------------------

  /** Subscribe to intent changes. Returns an unsubscribe function. */
  subscribe(listener: (intent: SessionIntent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  // -----------------------------------------------------------------------
  // Intent computation
  // -----------------------------------------------------------------------

  /** Compute the current session intent from the rolling window of events. */
  computeIntent(): SessionIntent {
    this.prune();
    const events = this.events;
    const now = Date.now();

    if (events.length === 0) {
      return { type: 'idle', confidence: 1, activeFiles: [], computedAt: now };
    }

    // Collect signals
    const fileOpens = events.filter((e) => e.type === 'file-open');
    const fileEdits = events.filter((e) => e.type === 'file-edit' || e.type === 'file-save');
    const schemaEdits = events.filter((e) => e.type === 'schema-edit');
    const errors = events.filter((e) => e.type === 'error-encounter');
    const previewEvents = events.filter(
      (e) => e.type === 'preview-interact' || e.type === 'preview-navigate',
    );

    // Unique files edited
    const editedFiles = new Set(
      fileEdits.map((e) => e.fileId ?? e.fileName).filter(Boolean) as string[],
    );
    const openedFiles = new Set(
      fileOpens.map((e) => e.fileId ?? e.fileName).filter(Boolean) as string[],
    );

    // Score each intent type
    const scores: Array<{ type: SessionIntentType; score: number; files: string[] }> = [];

    // Exploring: many opens, few edits
    if (fileOpens.length >= 3 && fileEdits.length <= 1) {
      scores.push({
        type: 'exploring',
        score: Math.min(1, fileOpens.length / 5) * 0.8 + (fileEdits.length === 0 ? 0.2 : 0),
        files: [...openedFiles],
      });
    }

    // Focused editing: repeated edits in same file
    if (editedFiles.size === 1 && fileEdits.length >= 3) {
      scores.push({
        type: 'focused-editing',
        score: Math.min(1, fileEdits.length / 6),
        files: [...editedFiles],
      });
    }

    // Multi-file edit: edits across multiple files
    if (editedFiles.size >= 2) {
      scores.push({
        type: 'multi-file-edit',
        score: Math.min(1, editedFiles.size / 4) * 0.7 + Math.min(1, fileEdits.length / 5) * 0.3,
        files: [...editedFiles],
      });
    }

    // Schema authoring
    if (schemaEdits.length >= 1) {
      scores.push({
        type: 'schema-authoring',
        score: Math.min(1, schemaEdits.length / 3),
        files: [...new Set(schemaEdits.map((e) => e.fileId ?? e.fileName).filter(Boolean) as string[])],
      });
    }

    // Debugging: errors + quick file switching
    if (errors.length >= 1) {
      const switchFreq = fileOpens.length / Math.max(1, (now - events[0].timestamp) / 10000);
      scores.push({
        type: 'debugging',
        score: Math.min(1, errors.length / 3) * 0.6 + Math.min(1, switchFreq) * 0.4,
        files: [...new Set(errors.map((e) => e.fileId ?? e.fileName).filter(Boolean) as string[])],
      });
    }

    // Reviewing: preview interactions + opens
    if (previewEvents.length >= 2) {
      scores.push({
        type: 'reviewing',
        score: Math.min(1, previewEvents.length / 4) * 0.7 + Math.min(1, fileOpens.length / 3) * 0.3,
        files: [...openedFiles],
      });
    }

    // Pick the highest-scoring intent
    if (scores.length === 0) {
      return { type: 'idle', confidence: 0.5, activeFiles: [], computedAt: now };
    }

    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];

    return {
      type: best.type,
      confidence: Math.round(best.score * 100) / 100,
      activeFiles: best.files.slice(0, 5),
      computedAt: now,
    };
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private prune(): void {
    const cutoff = Date.now() - this.windowMs;
    this.events = this.events.filter((e) => e.timestamp >= cutoff);

    // Also cap total events to prevent unbounded growth
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS);
    }
  }

  private notify(intent: SessionIntent): void {
    for (const listener of this.listeners) {
      try {
        listener(intent);
      } catch {
        // Listener errors should not break the tracker
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton for app-wide usage
// ---------------------------------------------------------------------------

let _tracker: SessionIntentTracker | null = null;

/** Get the global session intent tracker (creates on first call). */
export function getSessionTracker(windowMs?: number): SessionIntentTracker {
  if (!_tracker) {
    _tracker = new SessionIntentTracker(windowMs);
  }
  return _tracker;
}

/** Reset the global tracker (useful for tests). */
export function resetSessionTracker(): void {
  _tracker?.clear();
  _tracker = null;
}
