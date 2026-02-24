export interface MentionResult {
  id: string;
  type: 'file' | 'plan' | 'memory';
  label: string;
  detail?: string;
}

export async function resolveMentions(
  projectId: string,
  type: 'file' | 'plan' | 'memory',
  query: string
): Promise<MentionResult[]> {
  const params = new URLSearchParams({ type, q: query });
  const res = await fetch(`/api/projects/${projectId}/mentions?${params}`);
  if (!res.ok) return [];
  const json = await res.json();
  const data = json.data ?? json;
  return data.results ?? [];
}

export function insertMention(
  text: string,
  cursorPos: number,
  mention: MentionResult
): { newText: string; newCursorPos: number } {
  // Find the @ trigger position before cursor
  const before = text.slice(0, cursorPos);
  const atIdx = before.lastIndexOf('@');
  if (atIdx === -1) return { newText: text, newCursorPos: cursorPos };

  const after = text.slice(cursorPos);
  const mentionText = `@${mention.label} `;
  const newText = text.slice(0, atIdx) + mentionText + after;
  const newCursorPos = atIdx + mentionText.length;
  return { newText, newCursorPos };
}
