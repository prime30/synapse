import { describe, expect, it } from 'vitest';
import { shouldRequirePlanModeFirst } from '@/lib/agents/orchestration-policy';

describe('orchestration-policy', () => {
  it('does not require plan mode for explicit direct code-change requests', () => {
    const blocked = shouldRequirePlanModeFirst({
      intentMode: 'code',
      tier: 'COMPLEX',
      userRequest: 'Implement the code changes you just suggested.',
      recentMessages: [],
    });
    expect(blocked).toBe(false);
  });

  it('does not require plan mode for COMPLEX tier requests (executes directly)', () => {
    const blocked = shouldRequirePlanModeFirst({
      intentMode: 'code',
      tier: 'COMPLEX',
      userRequest: 'Add a quick-add button to the product card with cart integration.',
      recentMessages: [],
    });
    expect(blocked).toBe(false);
  });

  it('requires plan mode for ARCHITECTURAL tier broad requests', () => {
    const blocked = shouldRequirePlanModeFirst({
      intentMode: 'code',
      tier: 'ARCHITECTURAL',
      userRequest: 'Restructure the entire theme architecture for scalability.',
      recentMessages: [],
    });
    expect(blocked).toBe(true);
  });

  it('still gates SIMPLE tier when NON_TRIVIAL_HINT_RE matches', () => {
    const blocked = shouldRequirePlanModeFirst({
      intentMode: 'code',
      tier: 'SIMPLE',
      userRequest: 'Change the header color across all files in the theme.',
      recentMessages: [],
    });
    expect(blocked).toBe(true);
  });

  it('does not gate plan or ask modes', () => {
    expect(shouldRequirePlanModeFirst({
      intentMode: 'plan',
      tier: 'ARCHITECTURAL',
      userRequest: 'Restructure the entire theme.',
      recentMessages: [],
    })).toBe(false);

    expect(shouldRequirePlanModeFirst({
      intentMode: 'ask',
      tier: 'ARCHITECTURAL',
      userRequest: 'Restructure the entire theme.',
      recentMessages: [],
    })).toBe(false);
  });
});
