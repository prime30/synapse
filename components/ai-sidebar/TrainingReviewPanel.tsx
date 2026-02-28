'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { LambdaDots } from '@/components/ui/LambdaDots';

type InteractionKind = 'user_input' | 'assistant_output' | 'button_click' | 'mode_change' | 'system';

interface InteractionEvent {
  id: string;
  timestamp: string;
  projectId: string;
  sessionId?: string | null;
  kind: InteractionKind;
  source?: string;
  label?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

interface TrainingReviewPanelProps {
  projectId: string;
  activeSessionId?: string | null;
  open: boolean;
  onClose: () => void;
  onReplayPrompt?: (prompt: string) => void;
}

export function TrainingReviewPanel({
  projectId,
  activeSessionId,
  open,
  onClose,
  onReplayPrompt,
}: TrainingReviewPanelProps) {
  const [events, setEvents] = useState<InteractionEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionOnly, setSessionOnly] = useState(true);
  const [filter, setFilter] = useState<'all' | InteractionKind>('all');
  const [note, setNote] = useState('');

  const loadEvents = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const query = new URLSearchParams();
      query.set('limit', '300');
      if (sessionOnly && activeSessionId) query.set('sessionId', activeSessionId);
      const res = await fetch(`/api/projects/${projectId}/interaction-events?${query.toString()}`);
      if (!res.ok) return;
      const json = await res.json();
      setEvents(json?.data?.events ?? []);
    } finally {
      setLoading(false);
    }
  }, [open, projectId, sessionOnly, activeSessionId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const visibleEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => e.kind === filter);
  }, [events, filter]);

  const sendFeedback = useCallback(
    async (event: InteractionEvent, verdict: 'good' | 'bad' | 'plan_loop') => {
      const payload = {
        kind: 'system',
        sessionId: activeSessionId ?? null,
        source: 'training.review',
        label: 'feedback',
        content: '',
        metadata: {
          verdict,
          targetEventId: event.id,
          targetKind: event.kind,
          targetLabel: event.label,
          note: note.trim() || undefined,
        },
      };
      await fetch(`/api/projects/${projectId}/interaction-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    },
    [activeSessionId, note, projectId],
  );

  if (!open) return null;

  return (
    <div className="mx-2 mb-2 rounded-lg border ide-border ide-surface-panel">
      <div className="flex items-center justify-between px-3 py-2 border-b ide-border-subtle">
        <div className="text-xs font-semibold ide-text-2">Training Review</div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={loadEvents}
            className="p-1 rounded ide-hover ide-text-muted hover:ide-text"
            title="Refresh events"
          >
            {loading ? <LambdaDots size={14} /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded ide-hover ide-text-muted hover:ide-text"
            title="Close training panel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="px-3 py-2 flex items-center gap-2 text-[11px]">
        <label className="inline-flex items-center gap-1.5 ide-text-muted">
          <input
            type="checkbox"
            checked={sessionOnly}
            onChange={(e) => setSessionOnly(e.target.checked)}
          />
          This session only
        </label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'all' | InteractionKind)}
          className="ide-input text-[11px] px-2 py-1"
        >
          <option value="all">All</option>
          <option value="user_input">User inputs</option>
          <option value="assistant_output">Assistant outputs</option>
          <option value="button_click">Button clicks</option>
          <option value="mode_change">Mode changes</option>
        </select>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Feedback note (optional)"
          className="ide-input text-[11px] px-2 py-1 flex-1 min-w-[120px]"
        />
      </div>

      <div className="max-h-64 overflow-y-auto border-t ide-border-subtle">
        {visibleEvents.length === 0 ? (
          <div className="px-3 py-6 text-[11px] ide-text-muted text-center">
            No events captured yet.
          </div>
        ) : (
          visibleEvents.map((e) => (
            <div key={e.id} className="px-3 py-2 border-b ide-border-subtle">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] ide-text-muted">
                  {new Date(e.timestamp).toLocaleTimeString()} · {e.kind}
                  {e.label ? ` · ${e.label}` : ''}
                </div>
                <div className="flex items-center gap-1">
                  {e.kind === 'user_input' && e.content && onReplayPrompt && (
                    <button
                      type="button"
                      onClick={() => onReplayPrompt(e.content!)}
                      className="px-1.5 py-0.5 text-[10px] rounded ide-hover ide-text-muted hover:ide-text"
                      title="Replay this prompt"
                    >
                      Replay
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => sendFeedback(e, 'good')}
                    className="p-1 rounded ide-hover ide-text-muted hover:text-green-500"
                    title="Mark as good training example"
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => sendFeedback(e, 'bad')}
                    className="p-1 rounded ide-hover ide-text-muted hover:text-red-500"
                    title="Mark as bad training example"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => sendFeedback(e, 'plan_loop')}
                    className="px-1.5 py-0.5 text-[10px] rounded border border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                    title="Flag as planning loop"
                  >
                    Loop
                  </button>
                </div>
              </div>
              {(e.content || e.metadata) && (
                <div className="mt-1 text-[11px] ide-text-2 whitespace-pre-wrap break-words line-clamp-3">
                  {e.content ?? JSON.stringify(e.metadata)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
