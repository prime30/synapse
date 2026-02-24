'use client';

import { Download } from 'lucide-react';
import { Dropdown } from '@/components/ui/Dropdown';
import {
  exportAsMarkdown,
  exportAsJSON,
  downloadFile,
  type Message,
} from '@/lib/export/conversation-exporter';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ConversationExportProps {
  messages: Array<{ role: string; content: string; created_at?: string }>;
  sessionTitle?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ConversationExport({ messages, sessionTitle }: ConversationExportProps) {
  const handleSelect = (id: string) => {
    const msgs: Message[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
      created_at: m.created_at,
    }));
    const baseName = sessionTitle
      ? sessionTitle.replace(/[^a-z0-9-]/gi, '_').slice(0, 50)
      : 'conversation';
    const timestamp = new Date().toISOString().slice(0, 10);

    if (id === 'markdown') {
      const content = exportAsMarkdown(msgs, sessionTitle);
      downloadFile(content, `${baseName}_${timestamp}.md`, 'text/markdown');
    } else if (id === 'json') {
      const content = exportAsJSON(msgs, sessionTitle);
      downloadFile(content, `${baseName}_${timestamp}.json`, 'application/json');
    }
  };

  return (
    <Dropdown
      trigger={
        <button
          type="button"
          className="w-7 h-7 flex items-center justify-center rounded-md text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-white/10 transition-colors"
          aria-label="Export conversation"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      }
      items={[
        { id: 'markdown', label: 'Export as Markdown' },
        { id: 'json', label: 'Export as JSON' },
      ]}
      onSelect={handleSelect}
      placement="bottom-end"
    />
  );
}
