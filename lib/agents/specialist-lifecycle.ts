export type SpecialistLifecycleState =
  | 'dispatched'
  | 'working'
  | 'produced_changes'
  | 'completed_no_changes'
  | 'failed'
  | 'reviewed'
  | 'merged'
  | 'escalated';

export type SpecialistLifecycleEventType =
  | 'dispatched'
  | 'started'
  | 'completed'
  | 'failed'
  | 'reviewed'
  | 'merged'
  | 'escalated';

export interface SpecialistLifecycleEvent {
  type: SpecialistLifecycleEventType;
  agent: string;
  timestampMs: number;
  details?: Record<string, unknown>;
}

export interface SpecialistLifecycleRecord {
  agent: string;
  state: SpecialistLifecycleState;
  retries: number;
  lastUpdateMs: number;
  details?: Record<string, unknown>;
}

const TRANSITIONS: Record<SpecialistLifecycleState, Set<SpecialistLifecycleState>> = {
  dispatched: new Set(['working', 'failed', 'escalated']),
  working: new Set(['produced_changes', 'completed_no_changes', 'failed', 'escalated']),
  produced_changes: new Set(['reviewed', 'merged', 'escalated']),
  completed_no_changes: new Set(['working', 'escalated', 'failed']),
  failed: new Set(['working', 'escalated']),
  reviewed: new Set(['merged', 'escalated', 'working']),
  merged: new Set(),
  escalated: new Set(),
};

function toState(
  event: SpecialistLifecycleEvent,
  current: SpecialistLifecycleState | null,
): SpecialistLifecycleState | null {
  switch (event.type) {
    case 'dispatched':
      return 'dispatched';
    case 'started':
      return 'working';
    case 'completed': {
      const changes = Number(event.details?.changesCount ?? 0);
      return changes > 0 ? 'produced_changes' : 'completed_no_changes';
    }
    case 'failed':
      return 'failed';
    case 'reviewed':
      return 'reviewed';
    case 'merged':
      return 'merged';
    case 'escalated':
      return 'escalated';
    default:
      return current;
  }
}

export class SpecialistLifecycleTracker {
  private readonly byAgent = new Map<string, SpecialistLifecycleRecord>();

  onEvent(event: SpecialistLifecycleEvent): SpecialistLifecycleRecord {
    const current = this.byAgent.get(event.agent);
    const nextState = toState(event, current?.state ?? null) ?? current?.state ?? 'dispatched';

    if (current && current.state !== nextState) {
      const allowed = TRANSITIONS[current.state];
      if (!allowed.has(nextState)) {
        return current;
      }
    }

    const retries = event.type === 'started' && current ? current.retries + 1 : current?.retries ?? 0;
    const next: SpecialistLifecycleRecord = {
      agent: event.agent,
      state: nextState,
      retries,
      lastUpdateMs: event.timestampMs,
      details: event.details ?? current?.details,
    };
    this.byAgent.set(event.agent, next);
    return next;
  }

  get(agent: string): SpecialistLifecycleRecord | undefined {
    return this.byAgent.get(agent);
  }

  list(): SpecialistLifecycleRecord[] {
    return [...this.byAgent.values()].sort((a, b) => a.agent.localeCompare(b.agent));
  }
}
