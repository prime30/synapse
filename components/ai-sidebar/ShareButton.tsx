'use client';
import React, { useState, useCallback } from 'react';
import { Share2, Check } from 'lucide-react';
import { LambdaDots } from '@/components/ui/LambdaDots';

interface ShareButtonProps {
  projectId: string;
  sessionId: string | null;
}

export function ShareButton({ projectId, sessionId }: ShareButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'shared'>('idle');

  const handleShare = useCallback(async () => {
    if (!sessionId || state === 'loading') return;

    setState('loading');

    try {
      const response = await fetch(
        '/api/projects/' + projectId + '/agent-chat/sessions/' + sessionId + '/share',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create share');
      }

      const data = await response.json();
      const shareUrl = window.location.origin + data.shareUrl;

      // Copy to clipboard
      await navigator.clipboard.writeText(shareUrl);

      setState('shared');

      // Reset to idle after 2 seconds
      setTimeout(() => {
        setState('idle');
      }, 2000);
    } catch (error) {
      console.error('Failed to share conversation:', error);
      setState('idle');
    }
  }, [projectId, sessionId, state]);

  if (!sessionId) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={state === 'loading'}
      className={
        'rounded ide-surface-inset ide-border text-xs px-2 py-1 flex items-center gap-1.5 transition-colors ' +
        (state === 'shared' ? 'text-accent' : 'ide-text-3 hover:ide-text-2 ide-hover') +
        (state === 'loading' ? ' opacity-50 cursor-not-allowed' : '')
      }
      title={state === 'shared' ? 'Link copied!' : 'Share conversation'}
    >
      {state === 'loading' ? (
        <LambdaDots size={12} />
      ) : state === 'shared' ? (
        <Check className="h-3 w-3" />
      ) : (
        <Share2 className="h-3 w-3" />
      )}
      <span>{state === 'shared' ? 'Copied!' : 'Share'}</span>
    </button>
  );
}
