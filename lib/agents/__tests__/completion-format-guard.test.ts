import { describe, it, expect } from 'vitest';
import { ensureCompletionResponseSections } from '../completion-format-guard';

describe('ensureCompletionResponseSections', () => {
  it('appends all three sections in code mode with no changes', () => {
    const result = ensureCompletionResponseSections({
      analysis: 'I investigated the issue.',
      intentMode: 'code',
      needsClarification: false,
      changes: [],
    });
    expect(result).toContain("### What I've changed");
    expect(result).toContain('### Why this helps');
    expect(result).toContain('### Validation confirmation');
  });

  it('ALWAYS appends sections in code mode even with needsClarification=true', () => {
    const result = ensureCompletionResponseSections({
      analysis: 'I need more info.',
      intentMode: 'code',
      needsClarification: true,
      changes: [],
    });
    // This was the bug: previously returned early without sections
    expect(result).toContain("### What I've changed");
    expect(result).toContain('### Why this helps');
  });

  it('appends sections in debug mode with needsClarification=true', () => {
    const result = ensureCompletionResponseSections({
      analysis: 'Debugging...',
      intentMode: 'debug',
      needsClarification: true,
      changes: [],
    });
    expect(result).toContain("### What I've changed");
  });

  it('lists changed files when changes exist', () => {
    const result = ensureCompletionResponseSections({
      analysis: 'Fixed it.',
      intentMode: 'code',
      changes: [
        { fileId: '1', fileName: 'assets/mini-cart.css', originalContent: '', proposedContent: 'new', reasoning: '', agentType: 'project_manager' },
      ],
    });
    expect(result).toContain('mini-cart.css');
  });

  it('skips sections for ask mode with no changes', () => {
    const result = ensureCompletionResponseSections({
      analysis: 'Here is the explanation.',
      intentMode: 'ask',
      changes: [],
    });
    expect(result).not.toContain("### What I've changed");
  });

  it('preserves existing sections', () => {
    const withSections = "Done.\n\n### What I've changed\n- Updated X\n\n### Why this helps\n- Better\n\n### Validation confirmation\n- Lint passed";
    const result = ensureCompletionResponseSections({
      analysis: withSections,
      intentMode: 'code',
      changes: [],
    });
    expect(result).toBe(withSections);
  });
});
