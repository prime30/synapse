/**
 * Action Stream — typed event stream capturing file operations for
 * intent detection and workflow pattern matching.
 *
 * Observable pattern with subscription support.
 * No React dependencies — consumed by useIntentCompletion hook.
 * @module lib/ai/action-stream
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Types of file operations the action stream tracks. */
export type FileActionType =
  | 'rename'
  | 'create'
  | 'delete'
  | 'edit';

/** Granular edit change types within a file edit. */
export type EditChangeType =
  | 'content'      // General content change
  | 'schema'       // Schema block change
  | 'style'        // CSS/style change
  | 'reference'    // render/include/asset reference change
  | 'locale'       // Translation key change
  | 'structure';   // HTML structure change

/** A single action event in the stream. */
export interface FileAction {
  /** Unique event ID. */
  id: string;
  /** What type of file operation occurred. */
  type: FileActionType;
  /** When this action occurred. */
  timestamp: number;
  /** The file affected. */
  fileId: string;
  fileName: string;
  filePath?: string;
  /** For edits: what kind of change was it? */
  changeType?: EditChangeType;
  /** For renames: the old file name. */
  oldFileName?: string;
  /** For renames: the old file path. */
  oldFilePath?: string;
  /** Additional metadata (e.g. what was changed, snippet names). */
  metadata?: Record<string, unknown>;
}

/** Listener for action stream events. */
export type ActionStreamListener = (action: FileAction) => void;

// ---------------------------------------------------------------------------
// ActionStream class
// ---------------------------------------------------------------------------

const MAX_HISTORY = 100;

export class ActionStream {
  private listeners: ActionStreamListener[] = [];
  private history: FileAction[] = [];

  // -----------------------------------------------------------------------
  // Emitting events
  // -----------------------------------------------------------------------

  /** Emit a new file action event. */
  emit(action: Omit<FileAction, 'id' | 'timestamp'>): FileAction {
    const fullAction: FileAction = {
      ...action,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    // Store in history
    this.history.push(fullAction);
    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(-MAX_HISTORY);
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(fullAction);
      } catch {
        // Listener errors should not break the stream
      }
    }

    return fullAction;
  }

  // -----------------------------------------------------------------------
  // Convenience emitters
  // -----------------------------------------------------------------------

  /** Emit a file rename event. */
  emitRename(
    fileId: string,
    oldFileName: string,
    newFileName: string,
    oldFilePath?: string,
    newFilePath?: string,
    metadata?: Record<string, unknown>,
  ): FileAction {
    return this.emit({
      type: 'rename',
      fileId,
      fileName: newFileName,
      filePath: newFilePath,
      oldFileName,
      oldFilePath,
      metadata,
    });
  }

  /** Emit a file create event. */
  emitCreate(
    fileId: string,
    fileName: string,
    filePath?: string,
    metadata?: Record<string, unknown>,
  ): FileAction {
    return this.emit({
      type: 'create',
      fileId,
      fileName,
      filePath,
      metadata,
    });
  }

  /** Emit a file delete event. */
  emitDelete(
    fileId: string,
    fileName: string,
    filePath?: string,
    metadata?: Record<string, unknown>,
  ): FileAction {
    return this.emit({
      type: 'delete',
      fileId,
      fileName,
      filePath,
      metadata,
    });
  }

  /** Emit a file edit event with change type classification. */
  emitEdit(
    fileId: string,
    fileName: string,
    changeType: EditChangeType = 'content',
    filePath?: string,
    metadata?: Record<string, unknown>,
  ): FileAction {
    return this.emit({
      type: 'edit',
      fileId,
      fileName,
      filePath,
      changeType,
      metadata,
    });
  }

  // -----------------------------------------------------------------------
  // Subscription
  // -----------------------------------------------------------------------

  /** Subscribe to action events. Returns an unsubscribe function. */
  subscribe(listener: ActionStreamListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  // -----------------------------------------------------------------------
  // History access
  // -----------------------------------------------------------------------

  /** Get the full action history (capped at MAX_HISTORY). */
  getHistory(): readonly FileAction[] {
    return this.history;
  }

  /** Get recent actions within a time window (ms). */
  getRecent(windowMs: number = 60_000): FileAction[] {
    const cutoff = Date.now() - windowMs;
    return this.history.filter((a) => a.timestamp >= cutoff);
  }

  /** Get the last N actions. */
  getLast(count: number): FileAction[] {
    return this.history.slice(-count);
  }

  /** Clear all history. */
  clear(): void {
    this.history = [];
  }
}

// ---------------------------------------------------------------------------
// Singleton for app-wide usage
// ---------------------------------------------------------------------------

let _stream: ActionStream | null = null;

/** Get the global action stream (creates on first call). */
export function getActionStream(): ActionStream {
  if (!_stream) {
    _stream = new ActionStream();
  }
  return _stream;
}

/** Reset the global action stream (useful for tests). */
export function resetActionStream(): void {
  _stream?.clear();
  _stream = null;
}
