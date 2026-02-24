'use client';

import React, { useState, useCallback } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';

export interface MessageFeedbackProps {
  messageId: string;
  projectId: string;
  initialRating?: 'thumbs_up' | 'thumbs_down' | null;
  initialComment?: string | null;
}

export function MessageFeedback({
  messageId,
  projectId,
  initialRating = null,
  initialComment = null,
}: MessageFeedbackProps) {
  const [rating, setRating] = useState<'thumbs_up' | 'thumbs_down' | null>(
    initialRating ?? null
  );
  const [comment, setComment] = useState(initialComment ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitFeedback = useCallback(
    async (r: 'thumbs_up' | 'thumbs_down', c?: string) => {
      setIsSubmitting(true);
      setError(null);
      const prevRating = rating;
      const prevComment = comment;

      // Optimistic update
      setRating(r);
      if (r === 'thumbs_down') {
        setComment(c ?? '');
      }

      try {
        const res = await fetch(
          `/api/projects/${projectId}/agent-chat/messages/${messageId}/feedback`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rating: r,
              comment: r === 'thumbs_down' ? (c ?? '').trim() || undefined : undefined,
            }),
          }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.message ?? `HTTP ${res.status}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit');
        setRating(prevRating);
        setComment(prevComment);
      } finally {
        setIsSubmitting(false);
      }
    },
    [messageId, projectId, rating, comment]
  );

  const handleThumbsUp = useCallback(() => {
    if (rating === 'thumbs_up') {
      setRating(null);
      return;
    }
    submitFeedback('thumbs_up');
  }, [rating, submitFeedback]);

  const handleThumbsDown = useCallback(() => {
    if (rating === 'thumbs_down') {
      setRating(null);
      setComment('');
      return;
    }
    setRating('thumbs_down');
  }, [rating]);

  const handleSubmitComment = useCallback(() => {
    submitFeedback('thumbs_down', comment);
  }, [submitFeedback, comment]);

  const baseButton =
    'w-7 h-7 flex items-center justify-center rounded-md transition-colors active:scale-95 transition-transform';
  const defaultStyle =
    'text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-white/10 hover:text-stone-600 dark:hover:text-stone-300';
  const activePositive = 'bg-[oklch(0.745_0.189_148)]/10 text-[oklch(0.745_0.189_148)]';
  const activeNegative = 'bg-red-500/10 text-red-400';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Thumbs up"
          disabled={isSubmitting}
          onClick={handleThumbsUp}
          className={`${baseButton} ${
            rating === 'thumbs_up' ? activePositive : defaultStyle
          }`}
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Thumbs down"
          disabled={isSubmitting}
          onClick={handleThumbsDown}
          className={`${baseButton} ${
            rating === 'thumbs_down' ? activeNegative : defaultStyle
          }`}
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {rating === 'thumbs_down' && (
        <div className="mt-1 flex flex-col gap-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What could be improved? (optional)"
            className="w-full min-h-[60px] resize-none rounded-md border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-500 outline-none focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-400"
            maxLength={2000}
            disabled={isSubmitting}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleSubmitComment}
              disabled={isSubmitting}
              className="bg-[oklch(0.745_0.189_148)] hover:bg-[oklch(0.684_0.178_149)] text-white px-3 py-1 rounded-md text-xs font-medium disabled:opacity-50"
            >
              Submit feedback
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
