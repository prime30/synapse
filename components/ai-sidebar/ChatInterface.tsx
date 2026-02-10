'use client';

import { useRef, useEffect } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  onSend: (content: string) => void;
  placeholder?: string;
  className?: string;
}

export function ChatInterface({
  messages,
  isLoading,
  onSend,
  placeholder = 'Ask the agent...',
  className = '',
}: ChatInterfaceProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = inputRef.current?.value?.trim();
    if (!raw || isLoading) return;
    onSend(raw);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${className}`}>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 p-2"
        role="log"
        aria-label="Conversation"
      >
        {messages.length === 0 && !isLoading && (
          <p className="text-sm text-gray-500 py-4 text-center">
            Send a message to run the agent on this project.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-lg px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'bg-blue-600/20 text-gray-100 ml-4'
                : 'bg-gray-800/60 text-gray-300 mr-4'
            }`}
          >
            {m.content}
          </div>
        ))}
        {isLoading && (
          <div className="rounded-lg px-3 py-2 text-sm bg-gray-800/60 text-gray-500 italic">
            AI is thinking...
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="flex-shrink-0 p-2 border-t border-gray-800">
        <textarea
          ref={inputRef}
          name="message"
          rows={2}
          placeholder={placeholder}
          disabled={isLoading}
          className="w-full rounded border border-gray-700 bg-gray-800/80 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <button
          type="submit"
          disabled={isLoading}
          className="mt-2 w-full rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {isLoading ? 'Running...' : 'Run'}
        </button>
      </form>
    </div>
  );
}
