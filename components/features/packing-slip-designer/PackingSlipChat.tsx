'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Loader2, Sparkles, Check, ImagePlus } from 'lucide-react';
import { MarkdownRenderer } from '@/components/ai-sidebar/MarkdownRenderer';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  autoApplied?: boolean;
  activeToolCall?: { name: string };
}

interface PackingSlipChatProps {
  projectId: string;
  template: string;
  onApplyTemplate: (liquid: string) => void;
}

interface ChatImageAttachment {
  id: string;
  base64: string;
  mimeType: string;
  name: string;
}

function extractLiquidBlocks(content: string): string[] {
  const blocks: string[] = [];
  const regex = /```(?:liquid|html|)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const code = match[1].trim();
    if (code.length > 50 && (code.includes('<') || code.includes('{%') || code.includes('{{'))) {
      blocks.push(code);
    }
  }
  return blocks;
}

function extractTemplateCandidate(content: string): string | null {
  const fenced = extractLiquidBlocks(content);
  if (fenced.length > 0) return fenced[0];

  // Fallback: if the model returns raw template text without fences,
  // accept it as long as it looks like real Liquid/HTML template content.
  const raw = content.trim();
  if (raw.length < 120) return null;
  const looksLikeTemplate =
    /<style[\s>]/i.test(raw) ||
    /<div[\s>]/i.test(raw) ||
    raw.includes('{%') ||
    raw.includes('{{');
  if (!looksLikeTemplate) return null;

  // Strip accidental surrounding markdown markers if present.
  return raw
    .replace(/^```(?:liquid|html)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

export function PackingSlipChat({ projectId, template, onApplyTemplate }: PackingSlipChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ChatImageAttachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if ((!trimmed && attachments.length === 0) || isLoading) return;

    setInput('');
    setError(null);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed || '[Image-only request]',
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const history = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      const res = await fetch(`/api/projects/${projectId}/packing-slip-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template,
          request: trimmed || 'Use the attached image(s) as visual reference and improve the packing slip template.',
          images: attachments.map((img) => ({ base64: img.base64, mimeType: img.mimeType })),
          history: history.slice(-10),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Response body is not readable');

      const decoder = new TextDecoder();
      let accumulated = '';
      let carry = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        carry += decoder.decode(value, { stream: true });
        const lines = carry.split('\n');
        carry = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') continue;

          try {
            const evt = JSON.parse(payload);

            if (evt.type === 'content_chunk' && evt.chunk) {
              accumulated += evt.chunk;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated, activeToolCall: undefined } : m)),
              );
            }

            if (evt.type === 'tool_start' && evt.name) {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, activeToolCall: { name: evt.name } } : m)),
              );
            }

            if (evt.type === 'tool_result') {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, activeToolCall: undefined } : m)),
              );
            }
          } catch {
            // Skip malformed events
          }
        }
      }

      // Auto-apply generated template to editor (supports fenced and raw output).
      const candidate = extractTemplateCandidate(accumulated);
      if (candidate) {
        onApplyTemplate(candidate);
        setAttachments([]);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, autoApplied: true } : m)),
        );
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Failed to get response';
      setError(msg);
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, projectId, template, onApplyTemplate, attachments]);

  const handleImagePick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const selected = files.slice(0, Math.max(0, 3 - attachments.length));
    const converted = await Promise.all(
      selected.map(
        (file) =>
          new Promise<ChatImageAttachment | null>((resolve) => {
            if (!file.type.startsWith('image/')) return resolve(null);
            if (file.size > 4 * 1024 * 1024) return resolve(null);
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result;
              if (typeof result !== 'string') return resolve(null);
              const base64 = result.split(',')[1];
              if (!base64) return resolve(null);
              resolve({
                id: crypto.randomUUID(),
                base64,
                mimeType: file.type,
                name: file.name,
              });
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          }),
      ),
    );

    setAttachments((prev) => [...prev, ...converted.filter((c): c is ChatImageAttachment => c !== null)]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [attachments.length]);

  const handlePasteImage = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();

    const availableSlots = Math.max(0, 3 - attachments.length);
    if (availableSlots === 0) return;

    const selected = imageItems.slice(0, availableSlots);
    const converted = await Promise.all(
      selected.map(
        (item, idx) =>
          new Promise<ChatImageAttachment | null>((resolve) => {
            const file = item.getAsFile();
            if (!file) return resolve(null);
            if (file.size > 4 * 1024 * 1024) return resolve(null);
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result;
              if (typeof result !== 'string') return resolve(null);
              const base64 = result.split(',')[1];
              if (!base64) return resolve(null);
              resolve({
                id: crypto.randomUUID(),
                base64,
                mimeType: file.type || 'image/png',
                name: file.name || `pasted-image-${idx + 1}.png`,
              });
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          }),
      ),
    );

    setAttachments((prev) => [...prev, ...converted.filter((c): c is ChatImageAttachment => c !== null)]);
  }, [attachments.length]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleApply = useCallback(
    (code: string) => {
      onApplyTemplate(code);
    },
    [onApplyTemplate],
  );

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-accent hover:bg-accent-hover text-white shadow-lg transition-all hover:shadow-xl"
        aria-label="Open AI design assistant"
      >
        <Sparkles size={18} />
        <span className="text-sm font-medium">Design with AI</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 z-50 w-[420px] h-[600px] flex flex-col rounded-tl-xl border-l border-t border-stone-200 dark:border-white/10 bg-white dark:bg-[#141414] shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-accent" />
          <span className="text-sm font-semibold text-stone-900 dark:text-white">
            Packing Slip AI
          </span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 rounded hover:bg-stone-100 dark:hover:bg-white/10 transition-colors"
          aria-label="Close chat"
        >
          <X size={16} className="text-stone-400 dark:text-white/40" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
            <MessageSquare size={32} className="text-stone-300 dark:text-white/20" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-stone-600 dark:text-gray-400">
                Design your packing slip with AI
              </p>
              <p className="text-xs text-stone-400 dark:text-white/30 max-w-[280px]">
                Ask the agent to customize layout, add sections, change styling, or redesign the entire template.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {[
                'Add a company logo area',
                'Make the font more modern',
                'Add tracking info section',
                'Redesign for minimal style',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                    inputRef.current?.focus();
                  }}
                  className="px-3 py-1.5 text-xs rounded-full border border-stone-200 dark:border-white/10 text-stone-600 dark:text-gray-400 hover:border-accent hover:text-accent transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`${msg.role === 'user' ? 'flex justify-end' : ''}`}>
            {msg.role === 'user' ? (
              <div className="max-w-[85%] rounded-lg bg-accent/10 dark:bg-accent/20 px-3 py-2">
                <p className="text-sm text-stone-900 dark:text-white whitespace-pre-wrap">
                  {msg.content}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Tool progress indicator */}
                {msg.activeToolCall && (
                  <div className="flex items-center gap-2 text-xs text-stone-400 dark:text-white/30 py-1">
                    <Loader2 size={12} className="animate-spin" />
                    <span>{msg.activeToolCall.name.replace(/_/g, ' ')}</span>
                  </div>
                )}
                <div className="prose prose-sm dark:prose-invert max-w-none text-stone-800 dark:text-gray-300 [&_pre]:bg-stone-900 [&_pre]:dark:bg-[#0a0a0a] [&_code]:text-xs">
                  <MarkdownRenderer content={msg.content} isStreaming={isLoading && msg === messages[messages.length - 1]} />
                </div>
                {/* Auto-applied indicator or manual apply buttons */}
                {!isLoading && msg.autoApplied && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-accent/10 text-accent">
                    <Check size={14} />
                    Applied to editor
                  </div>
                )}
                {!isLoading && !msg.autoApplied &&
                  extractLiquidBlocks(msg.content).map((block, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleApply(block)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-accent hover:bg-accent-hover text-white transition-colors"
                    >
                      Apply to Editor
                    </button>
                  ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.content === '' && (
          <div className="flex items-center gap-2 text-xs text-stone-400 dark:text-white/30">
            <Loader2 size={14} className="animate-spin" />
            Designing...
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-stone-200 dark:border-white/10 p-3 shrink-0">
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((img) => (
              <div
                key={img.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 dark:border-white/10 bg-stone-50 dark:bg-white/5 px-2 py-1"
              >
                <span className="text-[11px] text-stone-600 dark:text-gray-300 max-w-[150px] truncate">
                  {img.name}
                </span>
                <button
                  onClick={() => removeAttachment(img.id)}
                  className="text-stone-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  aria-label={`Remove ${img.name}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || attachments.length >= 3}
            className="shrink-0 p-2 rounded-lg border border-stone-300 dark:border-white/10 text-stone-600 dark:text-white/70 hover:bg-stone-50 dark:hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Attach reference image"
            title={attachments.length >= 3 ? 'Maximum 3 images' : 'Attach reference image'}
          >
            <ImagePlus size={16} />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePasteImage}
            placeholder="Describe how to change the packing slip..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-stone-300 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-accent/40 max-h-24"
            style={{ minHeight: '38px' }}
          />
          <button
            onClick={handleSend}
            disabled={(!input.trim() && attachments.length === 0) || isLoading}
            className="shrink-0 p-2 rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
          multiple
          onChange={handleImagePick}
          className="hidden"
        />
      </div>
    </div>
  );
}
