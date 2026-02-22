import type { SpecialistLifecycleRecord, SpecialistLifecycleState } from './specialist-lifecycle';

export type ReactionTrigger =
  | 'specialist.failed'
  | 'specialist.no_changes'
  | 'specialist.stalled';

export type ReactionAction =
  | 'retry_with_narrow_scope'
  | 'inject_instruction'
  | 'escalate_clarification';

export interface ReactionRule {
  id: string;
  enabled: boolean;
  trigger: ReactionTrigger;
  action: ReactionAction;
  maxRetries?: number;
  instruction?: string;
}

export interface ReactionDecision {
  ruleId: string;
  action: ReactionAction;
  message: string;
  escalate: boolean;
}

export function defaultSpecialistReactionRules(): ReactionRule[] {
  return [
    {
      id: 'specialist-no-changes-retry',
      enabled: true,
      trigger: 'specialist.no_changes',
      action: 'retry_with_narrow_scope',
      maxRetries: 1,
    },
    {
      id: 'specialist-no-changes-escalate',
      enabled: true,
      trigger: 'specialist.no_changes',
      action: 'escalate_clarification',
      maxRetries: 1,
      instruction:
        'Specialist returned no net change repeatedly. Ask clarification with exact file/path and expected delta.',
    },
    {
      id: 'specialist-failed-retry',
      enabled: true,
      trigger: 'specialist.failed',
      action: 'retry_with_narrow_scope',
      maxRetries: 1,
    },
    {
      id: 'specialist-failed-escalate',
      enabled: true,
      trigger: 'specialist.failed',
      action: 'escalate_clarification',
      maxRetries: 1,
      instruction:
        'Specialist failed repeatedly. Ask for clarification or narrower scope before retrying.',
    },
  ];
}

function stateToTrigger(state: SpecialistLifecycleState): ReactionTrigger | null {
  if (state === 'failed') return 'specialist.failed';
  if (state === 'completed_no_changes') return 'specialist.no_changes';
  return null;
}

export function evaluateSpecialistReactions(input: {
  record: SpecialistLifecycleRecord;
  rules: ReactionRule[];
}): ReactionDecision[] {
  const trigger = stateToTrigger(input.record.state);
  if (!trigger) return [];

  const decisions: ReactionDecision[] = [];
  for (const rule of input.rules) {
    if (!rule.enabled || rule.trigger !== trigger) continue;
    const retryLimit = rule.maxRetries ?? 0;
    const overLimit = input.record.retries > retryLimit;

    if (rule.action === 'retry_with_narrow_scope' && !overLimit) {
      decisions.push({
        ruleId: rule.id,
        action: rule.action,
        escalate: false,
        message:
          `Reaction ${rule.id}: retry ${input.record.agent} with narrower file-specific task. ` +
          `Retry ${input.record.retries}/${retryLimit}.`,
      });
      continue;
    }

    if (rule.action === 'escalate_clarification' && overLimit) {
      decisions.push({
        ruleId: rule.id,
        action: rule.action,
        escalate: true,
        message:
          rule.instruction ??
          `Reaction ${rule.id}: escalate to clarification after retry limit.`,
      });
      continue;
    }

    if (rule.action === 'inject_instruction') {
      decisions.push({
        ruleId: rule.id,
        action: rule.action,
        escalate: false,
        message: rule.instruction ?? `Reaction ${rule.id}: injected instruction.`,
      });
    }
  }
  return decisions;
}
