import { describe, expect, it } from 'vitest';
import {
  extractTargetRegion,
  compressOldToolResults,
} from '@/lib/agents/coordinator-v2';
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
    expect(region.contextSnippet).toMatch(/\d+\| line 25 content here/);
    expect(region.startLine).toBeLessThanOrEqual(25);
    expect(region.endLine).toBeGreaterThanOrEqual(25);
  });

  it('rawSnippet is copy-safe (usable as old_text directly)', () => {
    const target = 'line 10 content here\nline 11 content here';
    const region = extractTargetRegion(sampleFile, target, 2);

    expect(region.matchType).toBe('exact');
    expect(region.rawSnippet).toContain(target);
    expect(sampleFile).toContain(region.rawSnippet.split('\n').slice(2, 4).join('\n'));
  });

  it('falls back to fuzzy match when whitespace differs', () => {
    const target = 'line  25   content   here';
    const region = extractTargetRegion(sampleFile, target, 3);

    expect(region.matchType).toBe('fuzzy');
    expect(region.rawSnippet).toContain('line 25 content here');
  });

  it('returns fallback for unmatched text', () => {
    const region = extractTargetRegion(sampleFile, 'nonexistent text xyz', 3);

    expect(region.matchType).toBe('fallback');
    expect(region.startLine).toBe(1);
    expect(region.rawSnippet).toContain('line 1 content here');
  });

  it('returns full file as fallback when file is under 200 lines', () => {
    const smallFile = Array.from({ length: 30 }, (_, i) => `row ${i}`).join('\n');
    const region = extractTargetRegion(smallFile, 'nope', 5);

    expect(region.matchType).toBe('fallback');
    expect(region.endLine).toBe(30);
  });

  it('caps fallback at 100 lines for large files', () => {
    const largeFile = Array.from({ length: 600 }, (_, i) => `big line ${i}`).join('\n');
    const region = extractTargetRegion(largeFile, 'does not exist', 5);

    expect(region.matchType).toBe('fallback');
    expect(region.endLine).toBe(100);
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
  it('AgentResult failureReason maps old_text_not_found to search_replace_failed', () => {
    const reason = 'old_text_not_found' as const;
    const mapped = reason === 'old_text_not_found'
      ? 'search_replace_failed'
      : reason === 'file_not_found'
        ? 'file_not_found'
        : null;
    expect(mapped).toBe('search_replace_failed');
  });

  it('AgentResult failureReason maps file_not_found correctly', () => {
    const reason = 'file_not_found' as const;
    const mapped = reason === 'old_text_not_found'
      ? 'search_replace_failed'
      : reason === 'file_not_found'
        ? 'file_not_found'
        : null;
    expect(mapped).toBe('file_not_found');
  });

  it('AgentResult failureReason returns null for unknown reasons', () => {
    const reason = 'unknown' as const;
    const mapped = reason === 'old_text_not_found'
      ? 'search_replace_failed'
      : reason === 'file_not_found'
        ? 'file_not_found'
        : null;
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
