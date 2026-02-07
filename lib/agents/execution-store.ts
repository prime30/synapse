import type { ExecutionState, AgentType, AgentMessage, CodeChange, ReviewResult } from '@/lib/types/agent';
import { createClient } from '@/lib/supabase/server';

/** In-memory store for active executions */
const activeExecutions = new Map<string, ExecutionState>();

export function createExecution(
  executionId: string,
  projectId: string,
  userId: string,
  userRequest: string
): ExecutionState {
  const state: ExecutionState = {
    executionId,
    projectId,
    userId,
    userRequest,
    status: 'pending',
    activeAgents: new Set<AgentType>(),
    completedAgents: new Set<AgentType>(),
    messages: [],
    proposedChanges: new Map<AgentType, CodeChange[]>(),
    startedAt: new Date(),
  };
  activeExecutions.set(executionId, state);
  return state;
}

export function getExecution(executionId: string): ExecutionState | undefined {
  return activeExecutions.get(executionId);
}

export function updateExecutionStatus(
  executionId: string,
  status: ExecutionState['status']
): void {
  const state = activeExecutions.get(executionId);
  if (state) {
    state.status = status;
    if (status === 'completed' || status === 'failed') {
      state.completedAt = new Date();
    }
  }
}

export function addMessage(executionId: string, message: AgentMessage): void {
  const state = activeExecutions.get(executionId);
  if (state) {
    state.messages.push(message);
  }
}

export function setAgentActive(executionId: string, agent: AgentType): void {
  const state = activeExecutions.get(executionId);
  if (state) {
    state.activeAgents.add(agent);
  }
}

export function setAgentCompleted(executionId: string, agent: AgentType): void {
  const state = activeExecutions.get(executionId);
  if (state) {
    state.activeAgents.delete(agent);
    state.completedAgents.add(agent);
  }
}

export function storeChanges(
  executionId: string,
  agent: AgentType,
  changes: CodeChange[]
): void {
  const state = activeExecutions.get(executionId);
  if (state) {
    state.proposedChanges.set(agent, changes);
  }
}

export function setReviewResult(
  executionId: string,
  result: ReviewResult
): void {
  const state = activeExecutions.get(executionId);
  if (state) {
    state.reviewResult = result;
  }
}

/** Persist completed execution to database and remove from memory */
export async function persistExecution(executionId: string): Promise<void> {
  const state = activeExecutions.get(executionId);
  if (!state) return;

  const allChanges: CodeChange[] = [];
  for (const changes of state.proposedChanges.values()) {
    allChanges.push(...changes);
  }

  const supabase = await createClient();
  await supabase.from('agent_executions').insert({
    id: state.executionId,
    project_id: state.projectId,
    user_id: state.userId,
    user_request: state.userRequest,
    status: state.status === 'completed' ? 'completed' : 'failed',
    execution_log: state.messages,
    proposed_changes: allChanges,
    review_result: state.reviewResult ?? null,
    started_at: state.startedAt.toISOString(),
    completed_at: state.completedAt?.toISOString() ?? null,
  });

  activeExecutions.delete(executionId);
}

/** Get all active execution IDs (for monitoring) */
export function getActiveExecutionIds(): string[] {
  return Array.from(activeExecutions.keys());
}
