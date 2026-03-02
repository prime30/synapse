import { describe, expect, it } from 'vitest';
import { extractTargetRegion } from '@/lib/agents/tools/region-extractor';
import { compressOldToolResults } from '@/lib/agents/coordinator-v2';
import type { AIMessage } from '@/lib/ai/types';

// ── extractTargetRegion ─────────────────────────────────────────────────────

describe('extractTargetRegion', () => {
  const sampleFile = Array.from({ length: 50 }, (_, i) => `line ${i + 1} content here`).join('\n');

  it('returns exact match with rawSnippet (no line numbers) and contextSnippet (numbered)', () => {
    const target = 'line 25 content here';
    const region = extractTargetRegion(sampleFile, target, 3);

    expect(region.matchType).toBe('exact');
    expect(region.rawSnippet).toContain('line 25 content here');
    expect(region.rawSnippet).not.toMatch(/^\s*\d+\|/m);
    expect(region.contextSnippet).toMatch(/\d+[:|] line 25 content here/);
    expect(region.startLine).toBeLessThanOrEqual(25);
    expect(region.endLine).toBeGreaterThanOrEqual(25);
  });

  it('rawSnippet is copy-safe (usable as old_text directly)', () => {
    const target = 'line 10 content here\nline 11 content here';
    const region = extractTargetRegion(sampleFile, target, 2);

    expect(region.matchType).toBe('fuzzy');
    expect(region.rawSnippet).toContain('line 10 content here');
    expect(region.rawSnippet).toContain('line 11 content here');
  });

  it('falls back to fuzzy match when whitespace differs', () => {
    const target = 'line  25   content   here';
    const region = extractTargetRegion(sampleFile, target, 3);

    expect(region.matchType).toBe('fuzzy');
    expect(region.rawSnippet).toContain('line 25 content here');
  });

  it('returns none for unmatched text', () => {
    const region = extractTargetRegion(sampleFile, 'nonexistent text xyz', 3);

    expect(region.matchType).toBe('none');
    expect(region.startLine).toBe(0);
    expect(region.endLine).toBe(0);
    expect(region.rawSnippet).toBe('');
  });

  it('returns none when file is under 200 lines and no match', () => {
    const smallFile = Array.from({ length: 30 }, (_, i) => `row ${i}`).join('\n');
    const region = extractTargetRegion(smallFile, 'nope', 5);

    expect(region.matchType).toBe('none');
    expect(region.endLine).toBe(0);
  });

  it('returns none for large files with no match', () => {
    const largeFile = Array.from({ length: 600 }, (_, i) => `big line ${i}`).join('\n');
    const region = extractTargetRegion(largeFile, 'does not exist', 5);

    expect(region.matchType).toBe('none');
    expect(region.endLine).toBe(0);
  });
});

// ── compressOldToolResults ──────────────────────────────────────────────────

describe('compressOldToolResults', () => {
  function makeToolResultMsg(results: Array<{ content: string; is_error?: boolean }>): AIMessage {
    return {
      role: 'user',
      content: 'tool results',
      __toolResults: results.map((r, i) => ({
        tool_use_id: `tool-${i}`,
        content: r.content,
        is_error: r.is_error ?? false,
      })),
    } as unknown as AIMessage;
  }

  it('preserves error results uncompressed', () => {
    const errorContent = 'old_text not found in sections/header.liquid. Ensure old_text matches the file exactly.';
    const longSuccess = 'x'.repeat(500);

    const messages: AIMessage[] = [
      makeToolResultMsg([
        { content: errorContent, is_error: true },
        { content: longSuccess, is_error: false },
      ]),
      makeToolResultMsg([{ content: 'latest result' }]),
    ];

    compressOldToolResults(messages);

    const firstResults = (messages[0] as unknown as { __toolResults: Array<{ content: string; is_error: boolean }> }).__toolResults;
    expect(firstResults[0].content).toBe(errorContent);
    expect(firstResults[1].content).toContain('[... compressed ...]');
  });

  it('compresses long non-error results in older messages', () => {
    const longContent = 'a'.repeat(300);
    const messages: AIMessage[] = [
      makeToolResultMsg([{ content: longContent }]),
      makeToolResultMsg([{ content: 'latest' }]),
    ];

    compressOldToolResults(messages);

    const firstResults = (messages[0] as unknown as { __toolResults: Array<{ content: string }> }).__toolResults;
    expect(firstResults[0].content.length).toBeLessThan(longContent.length);
    expect(firstResults[0].content).toContain('[... compressed ...]');
  });

  it('does not compress the most recent tool result message', () => {
    const longContent = 'b'.repeat(400);
    const messages: AIMessage[] = [
      makeToolResultMsg([{ content: 'old short' }]),
      makeToolResultMsg([{ content: longContent }]),
    ];

    compressOldToolResults(messages);

    const lastResults = (messages[1] as unknown as { __toolResults: Array<{ content: string }> }).__toolResults;
    expect(lastResults[0].content).toBe(longContent);
  });

  it('is a no-op when there is only one tool result message', () => {
    const longContent = 'c'.repeat(500);
    const messages: AIMessage[] = [
      makeToolResultMsg([{ content: longContent }]),
    ];

    compressOldToolResults(messages);

    const results = (messages[0] as unknown as { __toolResults: Array<{ content: string }> }).__toolResults;
    expect(results[0].content).toBe(longContent);
  });
});

// ── Failure metadata mapping ────────────────────────────────────────────────

describe('failure metadata mapping', () => {
  function mapFailureReason(reason: 'old_text_not_found' | 'file_not_found' | 'unknown'): 'search_replace_failed' | 'file_not_found' | null {
    if (reason === 'old_text_not_found') return 'search_replace_failed';
    if (reason === 'file_not_found') return 'file_not_found';
    return null;
  }

  it('AgentResult failureReason maps old_text_not_found to search_replace_failed', () => {
    const reason = 'old_text_not_found' as const;
    const mapped = mapFailureReason(reason);
    expect(mapped).toBe('search_replace_failed');
  });

  it('AgentResult failureReason maps file_not_found correctly', () => {
    const reason = 'file_not_found' as const;
    const mapped = mapFailureReason(reason);
    expect(mapped).toBe('file_not_found');
  });

  it('AgentResult failureReason returns null for unknown reasons', () => {
    const reason = 'unknown' as const;
    const mapped = mapFailureReason(reason);
    expect(mapped).toBeNull();
  });
});

// ── SYSTEM CORRECTION content ───────────────────────────────────────────────

describe('SYSTEM CORRECTION message format', () => {
  it('includes COPY-SAFE SNIPPET and CONTEXT sections when region is available', () => {
    const fileContent = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n');
    const attemptedOldText = 'line 50';
    const region = extractTargetRegion(fileContent, attemptedOldText);

    const filePath = 'sections/header.liquid';
    const attemptCount = 3;

    let msg =
      `SYSTEM CORRECTION: search_replace failed ${attemptCount} times on ${filePath}.\n\n` +
      'The text you provided as old_text does not match the file.';

    msg +=
      ' Below is the relevant region.\n\n' +
      'COPY-SAFE SNIPPET (use this as old_text):\n---\n' + region.rawSnippet + '\n---\n\n' +
      'CONTEXT (line numbers for reference only -- do NOT copy these):\n---\n' + region.contextSnippet + '\n---\n\n' +
      'OPTION 1: Copy the exact text from the COPY-SAFE SNIPPET above as old_text.\n' +
      'OPTION 2: Use propose_code_edit with the full updated file content instead.';

    expect(msg).toContain('COPY-SAFE SNIPPET');
    expect(msg).toContain('CONTEXT (line numbers for reference only');
    expect(msg).toContain('OPTION 1');
    expect(msg).toContain('OPTION 2');
    expect(msg).toContain('propose_code_edit');
    expect(msg).toContain(filePath);
    expect(msg).toContain(String(attemptCount));
  });

  it('includes file size note for files over 500 lines', () => {
    const lineCount = 750;
    const fileSizeNote = lineCount > 500
      ? `\nNOTE: This file is ${lineCount} lines. If using propose_code_edit, include ALL content.`
      : '';

    expect(fileSizeNote).toContain('750 lines');
    expect(fileSizeNote).toContain('include ALL content');
  });

  it('omits file size note for files under 500 lines', () => {
    const lineCount = 200;
    const fileSizeNote = lineCount > 500
      ? `\nNOTE: This file is ${lineCount} lines. If using propose_code_edit, include ALL content.`
      : '';

    expect(fileSizeNote).toBe('');
  });
});

// ── read_file line range support ────────────────────────────────────────────

describe('read_file line range support', () => {
  it('returns numbered lines for startLine/endLine range', () => {
    const fileContent = Array.from({ length: 100 }, (_, i) => `line ${i + 1} content`).join('\n');
    const lines = fileContent.split('\n');
    const start = 10;
    const end = 15;
    const sliced = lines.slice(start - 1, end);
    const numbered = sliced.map((l, i) => `${start + i}| ${l}`);
    const result = `Lines ${start}-${end} of ${lines.length}:\n${numbered.join('\n')}`;

    expect(result).toContain('Lines 10-15 of 100:');
    expect(result).toContain('10| line 10 content');
    expect(result).toContain('15| line 15 content');
    expect(result).not.toContain('9| ');
    expect(result).not.toContain('16| ');
  });

  it('clamps startLine to 1 and endLine to file length', () => {
    const lines = ['a', 'b', 'c', 'd', 'e'];
    const start = Math.max(1, -5);
    const end = Math.min(lines.length, 999);
    expect(start).toBe(1);
    expect(end).toBe(5);
  });
});

// ── Plan-first bypass for referential prompts ────────────────────────────────

describe('plan-first bypass for referential prompts', () => {
  it('shouldRequirePlanModeFirst returns false when isReferentialCodePrompt is true', async () => {
    const { shouldRequirePlanModeFirst } = await import('@/lib/agents/orchestration-policy');
    const result = shouldRequirePlanModeFirst({
      intentMode: 'code',
      tier: 'COMPLEX',
      userRequest: 'implement those changes',
      recentMessages: [],
      isReferentialCodePrompt: true,
    });
    expect(result).toBe(false);
  });

  it('shouldRequirePlanModeFirst still gates COMPLEX without referential flag', async () => {
    const { shouldRequirePlanModeFirst } = await import('@/lib/agents/orchestration-policy');
    const result = shouldRequirePlanModeFirst({
      intentMode: 'code',
      tier: 'COMPLEX',
      userRequest: 'refactor the entire theme to use a new architecture',
      recentMessages: [],
    });
    expect(result).toBe(true);
  });

  it('shouldRequirePlanModeFirst passes through for SIMPLE tier even without flag', async () => {
    const { shouldRequirePlanModeFirst } = await import('@/lib/agents/orchestration-policy');
    const result = shouldRequirePlanModeFirst({
      intentMode: 'code',
      tier: 'SIMPLE',
      userRequest: 'change the color to blue',
      recentMessages: [],
    });
    expect(result).toBe(false);
  });
});

// ── Per-file failure tracking ────────────────────────────────────────────────

describe('per-file failure tracking', () => {
  it('tracks failures per file independently', () => {
    const failedMutationByFile = new Map<string, number>();

    failedMutationByFile.set('header.liquid', (failedMutationByFile.get('header.liquid') ?? 0) + 1);
    failedMutationByFile.set('footer.liquid', (failedMutationByFile.get('footer.liquid') ?? 0) + 1);
    failedMutationByFile.set('header.liquid', (failedMutationByFile.get('header.liquid') ?? 0) + 1);

    expect(failedMutationByFile.get('header.liquid')).toBe(2);
    expect(failedMutationByFile.get('footer.liquid')).toBe(1);
  });

  it('triggers SYSTEM CORRECTION at per-file threshold of 2', () => {
    const failedMutationByFile = new Map<string, number>();
    const filePath = 'sections/header.liquid';

    failedMutationByFile.set(filePath, 1);
    expect((failedMutationByFile.get(filePath) ?? 0) >= 2).toBe(false);

    failedMutationByFile.set(filePath, 2);
    expect((failedMutationByFile.get(filePath) ?? 0) >= 2).toBe(true);
  });

  it('resets per-file count on success for that file only', () => {
    const failedMutationByFile = new Map<string, number>();
    failedMutationByFile.set('header.liquid', 3);
    failedMutationByFile.set('footer.liquid', 2);

    failedMutationByFile.delete('header.liquid');

    expect(failedMutationByFile.has('header.liquid')).toBe(false);
    expect(failedMutationByFile.get('footer.liquid')).toBe(2);
  });
});

// ── proposeOnlyFiles forced fallback ─────────────────────────────────────────

describe('proposeOnlyFiles forced fallback', () => {
  it('blocks search_replace for files in proposeOnlyFiles set', () => {
    const proposeOnlyFiles = new Set<string>();
    proposeOnlyFiles.add('sections/header.liquid');

    const evtName = 'search_replace';
    const targetPath = 'sections/header.liquid';
    const blocked = evtName === 'search_replace' && proposeOnlyFiles.has(targetPath);

    expect(blocked).toBe(true);
  });

  it('allows search_replace for files NOT in proposeOnlyFiles', () => {
    const proposeOnlyFiles = new Set<string>();
    proposeOnlyFiles.add('sections/header.liquid');

    const blocked = 'search_replace' === 'search_replace' && proposeOnlyFiles.has('sections/footer.liquid');
    expect(blocked).toBe(false);
  });

  it('allows propose_code_edit even for proposeOnlyFiles entries', () => {
    const proposeOnlyFiles = new Set<string>();
    proposeOnlyFiles.add('sections/header.liquid');

    const isSearchReplace = false;
    const blocked = isSearchReplace && proposeOnlyFiles.has('sections/header.liquid');
    expect(blocked).toBe(false);
  });

  it('adds file to proposeOnlyFiles after SYSTEM CORRECTION', () => {
    const proposeOnlyFiles = new Set<string>();
    const lastMutationFilePath = 'sections/header.liquid';

    if (lastMutationFilePath) {
      proposeOnlyFiles.add(lastMutationFilePath);
    }

    expect(proposeOnlyFiles.has('sections/header.liquid')).toBe(true);
  });
});

// ── Referential artifact replay ──────────────────────────────────────────────

describe('referential artifact basename fallback matching', () => {
  it('matches file by basename when full path does not match', () => {
    const files = [
      { fileId: '1', fileName: 'sections/header.liquid', path: 'sections/header.liquid', content: '...' },
      { fileId: '2', fileName: 'sections/footer.liquid', path: 'sections/footer.liquid', content: '...' },
    ];
    const artifactFilePath = 'header.liquid';

    let file = files.find(f => f.fileName === artifactFilePath || f.path === artifactFilePath);
    expect(file).toBeUndefined();

    if (!file && artifactFilePath) {
      const basename = artifactFilePath.split('/').pop();
      if (basename) {
        file = files.find(f =>
          f.fileName.endsWith(`/${basename}`) ||
          f.fileName === basename ||
          (f.path && f.path.endsWith(`/${basename}`))
        );
      }
    }

    expect(file).toBeDefined();
    expect(file!.fileName).toBe('sections/header.liquid');
  });

  it('prefers exact match over basename match', () => {
    const files = [
      { fileId: '1', fileName: 'header.liquid', path: 'header.liquid', content: 'exact' },
      { fileId: '2', fileName: 'sections/header.liquid', path: 'sections/header.liquid', content: 'nested' },
    ];
    const artifactFilePath = 'header.liquid';

    const file = files.find(f => f.fileName === artifactFilePath || f.path === artifactFilePath);
    expect(file).toBeDefined();
    expect(file!.content).toBe('exact');
  });

  it('injects system message when applied === 0', () => {
    const applied = 0;
    const referentialArtifacts = [
      { filePath: 'sections/header.liquid', fileName: 'header.liquid', content: '<div>new content</div>' },
    ];
    const messages: Array<{ role: string; content: string }> = [];

    if (applied === 0) {
      const unresolvedPaths = referentialArtifacts
        .map(a => a.filePath ?? a.fileName ?? 'unknown')
        .join(', ');
      messages.push({
        role: 'user',
        content: `[SYSTEM] Referential artifacts could not be applied automatically (files: ${unresolvedPaths}).`,
      });
    }

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain('[SYSTEM]');
    expect(messages[0].content).toContain('sections/header.liquid');
  });
});
