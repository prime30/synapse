'use client';

import { useState, useCallback } from 'react';
import type { ChatMessage } from '@/components/ai-sidebar/ChatInterface';
import { ChatInterface } from '@/components/ai-sidebar/ChatInterface';
import { ContextPanel } from '@/components/ai-sidebar/ContextPanel';
import type { AISidebarContextValue } from '@/hooks/useAISidebar';

interface AgentPromptPanelProps {
  projectId: string;
  context?: AISidebarContextValue;
  className?: string;
}

export function AgentPromptPanel({
  projectId,
  context = { filePath: null, fileLanguage: null, selection: null },
  className = '',
}: AgentPromptPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSend = useCallback(
    async (content: string) => {
      setError(null);
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const res = await fetch('/api/agents/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, request: content }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(data?.error ?? `Request failed (${res.status})`);
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `Error: ${data?.error ?? res.statusText}`,
              timestamp: new Date(),
            },
          ]);
          return;
        }

        const result = data?.data;
        const summary =
          result?.success === false
            ? result?.error ?? 'Agent run did not succeed.'
            : typeof result?.summary === 'string'
              ? result.summary
              : result?.changes?.length
                ? `Proposed ${result.changes.length} change(s).`
                : 'Done.';

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: summary,
            timestamp: new Date(),
          },
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Request failed';
        setError(msg);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Error: ${msg}`,
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [projectId]
  );

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${className}`}>
      <ContextPanel context={context} className="mb-2 flex-shrink-0" />
      {error && (
        <div
          className="mb-2 rounded border border-red-800/60 bg-red-900/20 px-2 py-1.5 text-xs text-red-300 flex-shrink-0"
          role="alert"
        >
          {error}
        </div>
      )}
      <ChatInterface
        messages={messages}
        isLoading={isLoading}
        onSend={onSend}
        placeholder="Describe the change you want (e.g. add a product gallery section)"
        className="flex-1 min-h-0"
      />
    </div>
  );
}
