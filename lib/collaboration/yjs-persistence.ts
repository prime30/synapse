import * as Y from 'yjs';

export interface PersistenceOptions {
  fileId: string;
  projectId?: string;
  autoSaveMs?: number;
  onSave?: (content: string) => void;
  onSaveError?: (error: Error) => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export class YjsPersistence {
  readonly doc: Y.Doc;
  readonly ytext: Y.Text;

  private fileId: string;
  private autoSaveMs: number;
  private onSave?: (content: string) => void;
  private onSaveError?: (error: Error) => void;
  private onDirtyChange?: (isDirty: boolean) => void;

  private savedContent = '';
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private _isDirty = false;
  private _isSaving = false;
  private destroyed = false;

  constructor(doc: Y.Doc, options: PersistenceOptions) {
    this.doc = doc;
    this.fileId = options.fileId;
    this.autoSaveMs = options.autoSaveMs ?? 3000;
    this.onSave = options.onSave;
    this.onSaveError = options.onSaveError;
    this.onDirtyChange = options.onDirtyChange;

    this.ytext = doc.getText('monaco');
    this.ytext.observe(this.handleTextChange);
  }

  get isDirty(): boolean {
    return this._isDirty;
  }

  get isSaving(): boolean {
    return this._isSaving;
  }

  get currentContent(): string {
    return this.ytext.toString();
  }

  initFromContent(content: string): void {
    this.savedContent = content;
    const currentText = this.ytext.toString();

    if (currentText.length === 0 && content.length > 0) {
      this.doc.transact(() => {
        this.ytext.insert(0, content);
      }, 'init');
    }

    this.setDirty(false);
  }

  async save(): Promise<string> {
    if (this.destroyed) return this.savedContent;

    const content = this.ytext.toString();

    if (content === this.savedContent) {
      this.setDirty(false);
      return content;
    }

    this._isSaving = true;
    try {
      const res = await fetch('/api/files/' + this.fileId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.error || 'Save failed with status ' + res.status);
      }

      this.savedContent = content;
      this.setDirty(false);
      this.onSave?.(content);
      return content;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.onSaveError?.(error);
      throw error;
    } finally {
      this._isSaving = false;
    }
  }

  revert(): void {
    this.cancelAutoSave();

    if (this.savedContent !== this.ytext.toString()) {
      this.doc.transact(() => {
        this.ytext.delete(0, this.ytext.length);
        if (this.savedContent.length > 0) {
          this.ytext.insert(0, this.savedContent);
        }
      }, 'revert');
    }

    this.setDirty(false);
  }

  destroy(): void {
    this.destroyed = true;
    this.cancelAutoSave();
    this.ytext.unobserve(this.handleTextChange);
  }

  private handleTextChange = (): void => {
    if (this.destroyed) return;
    const content = this.ytext.toString();
    const isDirty = content !== this.savedContent;
    this.setDirty(isDirty);

    if (isDirty && this.autoSaveMs > 0) {
      this.scheduleAutoSave();
    }
  };

  private scheduleAutoSave(): void {
    this.cancelAutoSave();
    this.autoSaveTimer = setTimeout(() => {
      this.save().catch(() => {
        // Error handled via onSaveError callback
      });
    }, this.autoSaveMs);
  }

  private cancelAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  private setDirty(dirty: boolean): void {
    if (this._isDirty !== dirty) {
      this._isDirty = dirty;
      this.onDirtyChange?.(dirty);
    }
  }
}
