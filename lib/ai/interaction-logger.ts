import fs from 'node:fs/promises';
import path from 'node:path';

export type InteractionEventKind =
  | 'user_input'
  | 'assistant_output'
  | 'button_click'
  | 'mode_change'
  | 'system';

export interface InteractionEvent {
  id: string;
  timestamp: string;
  projectId: string;
  sessionId?: string | null;
  kind: InteractionEventKind;
  source?: string;
  label?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

const ROOT_DIR = path.join(process.cwd(), '.cache', 'interaction-logs');

function safeProjectId(projectId: string): string {
  return projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function eventFilePath(projectId: string): string {
  return path.join(ROOT_DIR, `${safeProjectId(projectId)}.jsonl`);
}

export async function appendInteractionEvent(
  projectId: string,
  event: Omit<InteractionEvent, 'id' | 'timestamp' | 'projectId'>,
): Promise<InteractionEvent> {
  const full: InteractionEvent = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    projectId,
    ...event,
  };

  await fs.mkdir(ROOT_DIR, { recursive: true });
  await fs.appendFile(eventFilePath(projectId), JSON.stringify(full) + '\n', 'utf-8');
  return full;
}

export async function readInteractionEvents(
  projectId: string,
  options?: { limit?: number; sessionId?: string | null },
): Promise<InteractionEvent[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 200, 5000));
  const sessionId = options?.sessionId;
  const file = eventFilePath(projectId);

  let raw = '';
  try {
    raw = await fs.readFile(file, 'utf-8');
  } catch {
    return [];
  }

  const events: InteractionEvent[] = [];
  const lines = raw.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as InteractionEvent;
      if (sessionId && parsed.sessionId !== sessionId) continue;
      events.push(parsed);
      if (events.length >= limit) break;
    } catch {
      // Skip malformed lines; keep file append-only and resilient.
    }
  }

  return events.reverse();
}
