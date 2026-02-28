'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { LambdaDots } from '@/components/ui/LambdaDots';

interface CheckpointPanelProps {
  projectId: string;
  sessionId: string;
  onRevert?: (files: { fileId: string; path: string; content: string }[]) => void;
}

interface CheckpointSummary {
  id: string;
  label: string;
  createdAt: string;
  fileCount: number;
}

// -- Helpers ------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function Spinner({ className = '' }: { className?: string }) {
  return <LambdaDots size={14} className={className} />;
}

// -- Confirm dialog -----------------------------------------------------------

function RevertConfirm({
  label,
  isReverting,
  onConfirm,
  onCancel,
}: {
  label: string;
  isReverting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="px-3 py-2.5 ide-surface-inset rounded-md space-y-2">
      <p className="text-xs ide-text">
        Revert to <span className="font-medium">{label}</span>? This will
        restore files.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={isReverting}
          className="px-2.5 py-1 text-xs rounded bg-stone-600 text-white hover:bg-stone-500 disabled:opacity-50 transition-colors font-medium flex items-center gap-1.5"
        >
          {isReverting && <Spinner />}
          Confirm
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isReverting}
          className="px-2.5 py-1 text-xs rounded ide-text-muted hover:ide-text transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// -- Checkpoint row -----------------------------------------------------------

function CheckpointRow({
  checkpoint,
  confirmingId,
  isReverting,
  onRevertClick,
  onConfirm,
  onCancel,
}: {
  checkpoint: CheckpointSummary;
  confirmingId: string | null;
  isReverting: boolean;
  onRevertClick: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isConfirming = confirmingId === checkpoint.id;

  return (
    <div className="px-3 py-2.5 border-b ide-border-subtle last:border-b-0 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm ide-text font-medium truncate">
            {checkpoint.label}
          </div>
          <div className="text-[11px] ide-text-muted">
            {relativeTime(checkpoint.createdAt)}
            {checkpoint.fileCount > 0 && (
              <span className="ml-1.5">
                {checkpoint.fileCount} file{checkpoint.fileCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        {!isConfirming && (
          <button
            type="button"
            onClick={() => onRevertClick(checkpoint.id)}
            className="px-2.5 py-1 text-xs rounded ide-surface-inset ide-text-muted hover:ide-text transition-colors font-medium shrink-0"
          >
            Revert
          </button>
        )}
      </div>
      {isConfirming && (
        <div className="mt-2">
          <RevertConfirm
            label={checkpoint.label}
            isReverting={isReverting}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        </div>
      )}
    </div>
  );
}

// -- Main component -----------------------------------------------------------

export function CheckpointPanel({
  projectId,
  sessionId,
  onRevert,
}: CheckpointPanelProps) {
  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isReverting, setIsReverting] = useState(false);

  const [showInput, setShowInput] = useState(false);
  const [label, setLabel] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const fetchCheckpoints = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/checkpoints?sessionId=${encodeURIComponent(sessionId)}`,
      );
      if (!res.ok) throw new Error('Failed to load checkpoints');
      const data = await res.json();
      setCheckpoints(data.checkpoints ?? []);
    } catch {
      setError('Could not load checkpoints');
    } finally {
      setIsLoadingList(false);
    }
  }, [projectId, sessionId]);

  useEffect(() => {
    fetchCheckpoints();
  }, [fetchCheckpoints]);

  const handleCreate = useCallback(async () => {
    const trimmed = label.trim();
    if (!trimmed) return;

    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/checkpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, label: trimmed, files: [] }),
      });
      if (!res.ok) throw new Error('Failed to create checkpoint');
      const data = await res.json();
      if (data.checkpoint) {
        setCheckpoints((prev) => [data.checkpoint, ...prev]);
      }
      setLabel('');
      setShowInput(false);
    } catch {
      setError('Could not save checkpoint');
    } finally {
      setIsCreating(false);
    }
  }, [label, projectId, sessionId]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCreate();
      } else if (e.key === 'Escape') {
        setShowInput(false);
        setLabel('');
      }
    },
    [handleCreate],
  );

  const handleRevert = useCallback(async () => {
    if (!confirmingId) return;

    setIsReverting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/checkpoints/${confirmingId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'revert' }),
        },
      );
      if (!res.ok) throw new Error('Failed to revert');
      const data = await res.json();
      onRevert?.(data.files ?? []);
      setConfirmingId(null);
    } catch {
      setError('Could not revert to checkpoint');
    } finally {
      setIsReverting(false);
    }
  }, [confirmingId, projectId, onRevert]);

  useEffect(() => {
    if (showInput) inputRef.current?.focus();
  }, [showInput]);

  return (
    <div className="border ide-border rounded-lg ide-surface-panel flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b ide-border">
        <span className="text-sm font-medium ide-text">Checkpoints</span>
        <button
          type="button"
          onClick={() => {
            setShowInput(true);
            setError(null);
          }}
          disabled={showInput}
          className="px-2.5 py-1 text-xs rounded bg-[oklch(0.745_0.189_148)] text-white hover:bg-[oklch(0.745_0.189_148)]/90 disabled:opacity-50 transition-colors font-medium"
        >
          Save checkpoint
        </button>
      </div>

      {/* Inline create input */}
      {showInput && (
        <div className="px-3 py-2.5 border-b ide-border flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Checkpoint name..."
            disabled={isCreating}
            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded bg-white dark:bg-[#141414] border border-stone-300 dark:border-[#2a2a2a] ide-text placeholder:ide-text-muted focus:outline-none focus:ring-1 focus:ring-[oklch(0.745_0.189_148)]/50 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating || !label.trim()}
            className="px-2.5 py-1.5 text-xs rounded bg-[oklch(0.745_0.189_148)] text-white hover:bg-[oklch(0.745_0.189_148)]/90 disabled:opacity-50 transition-colors font-medium flex items-center gap-1.5 shrink-0"
          >
            {isCreating && <Spinner />}
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setShowInput(false);
              setLabel('');
            }}
            disabled={isCreating}
            className="p-1.5 rounded ide-text-muted hover:ide-text transition-colors shrink-0"
            title="Cancel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-3 py-2 text-xs text-red-400 border-b ide-border-subtle">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto max-h-[320px]">
        {isLoadingList ? (
          <div className="space-y-0">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
                <div className="flex-1 space-y-2">
                  <div className="h-4 ide-surface-inset rounded w-32" />
                  <div className="h-3 ide-surface-inset rounded w-20" />
                </div>
                <div className="w-14 h-6 ide-surface-inset rounded shrink-0" />
              </div>
            ))}
          </div>
        ) : checkpoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <div className="text-sm ide-text-muted font-medium mb-1">
              No checkpoints yet
            </div>
            <div className="text-[11px] ide-text-quiet max-w-[240px]">
              Save one before making changes.
            </div>
          </div>
        ) : (
          <div>
            {checkpoints.map((cp) => (
              <CheckpointRow
                key={cp.id}
                checkpoint={cp}
                confirmingId={confirmingId}
                isReverting={isReverting}
                onRevertClick={(id) => setConfirmingId(id)}
                onConfirm={handleRevert}
                onCancel={() => setConfirmingId(null)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
