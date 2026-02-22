import { describe, expect, it } from 'vitest';
import { classifyRequest } from '@/lib/agents/classifier';

describe('classifier conversation floors', () => {
  it('does not floor to COMPLEX for generic 2-message history', async () => {
    const result = await classifyRequest('Move the announcement bar below the header', 1, {
      recentMessages: ['What does this do?', 'It handles cart rendering.'],
      skipLLM: true,
    });
    expect(result.tier).toBe('SIMPLE');
  });

  it('floors to COMPLEX when history has code-gen and request is follow-up', async () => {
    const result = await classifyRequest('Now also add it to the mobile nav', 1, {
      recentMessages: [
        'Add a sticky header',
        'I created the sticky header section and updated layout/theme.liquid',
      ],
      skipLLM: true,
    });
    expect(result.tier).toBe('COMPLEX');
  });

  it('does not floor to COMPLEX when only code-gen signals (no follow-up)', async () => {
    const result = await classifyRequest('How does the header work?', 1, {
      recentMessages: [
        'Add a sticky header',
        'I created the sticky header section and updated layout/theme.liquid',
      ],
      skipLLM: true,
    });
    expect(result.tier).toBe('SIMPLE');
  });

  it('does not floor to COMPLEX when only follow-up signals (no code-gen)', async () => {
    const result = await classifyRequest('Now also change the font size', 1, {
      recentMessages: [
        'What does this do?',
        'It handles cart rendering.',
      ],
      skipLLM: true,
    });
    expect(result.tier).toBe('TRIVIAL');
  });

  it('classifies ARCHITECTURAL broad requests correctly', async () => {
    const result = await classifyRequest(
      'Restructure the entire theme for multi-region support',
      10,
      { skipLLM: true },
    );
    expect(result.tier).toBe('ARCHITECTURAL');
  });
});
