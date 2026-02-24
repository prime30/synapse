export interface Message {
  role: string;
  content: string;
  created_at?: string;
}

export function exportAsMarkdown(messages: Message[], title?: string): string {
  const lines: string[] = [];
  if (title) {
    lines.push(`# ${title}\n`);
  }
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : msg.role;
    lines.push(`## ${role}\n`);
    if (msg.created_at) {
      lines.push(`*${msg.created_at}*\n`);
    }
    lines.push(`${msg.content}\n\n---\n\n`);
  }
  return lines.join('');
}

export function exportAsJSON(messages: Message[], title?: string): string {
  const payload = title ? { title, messages } : { messages };
  return JSON.stringify(payload, null, 2);
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
