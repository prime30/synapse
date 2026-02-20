'use client';

import type { InteractionEventKind } from '@/lib/ai/interaction-logger';

interface ClientInteractionEvent {
  kind: InteractionEventKind;
  sessionId?: string | null;
  source?: string;
  label?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export function logInteractionEvent(
  projectId: string | undefined,
  event: ClientInteractionEvent,
): void {
  if (!projectId) return;
  fetch(`/api/projects/${projectId}/interaction-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
    keepalive: true,
  }).catch(() => {
    // non-blocking telemetry path
  });
}
