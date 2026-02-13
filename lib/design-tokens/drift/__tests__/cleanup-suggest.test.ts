/**
 * Tests for the cleanup-suggest API route.
 *
 * Verifies deterministic path, LLM path, LLM failure fallback, and empty input.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const mockRequireProjectAccess = vi.fn().mockResolvedValue(undefined);
const mockComplete = vi.fn();

vi.mock('@/lib/middleware/auth', () => ({
  requireProjectAccess: (...args: unknown[]) => mockRequireProjectAccess(...args),
}));

vi.mock('@/lib/errors/handler', async () => {
  const actual = await vi.importActual<typeof import('@/lib/errors/handler')>('@/lib/errors/handler');
  return actual;
});

// Mock AI provider
vi.mock('@/lib/ai/get-provider', () => ({
  getAIProvider: () => ({
    complete: (...args: unknown[]) => mockComplete(...args),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/projects/proj-1/design-tokens/cleanup-suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const DRIFT_RESULTS = [
  {
    filePath: 'assets/theme.css',
    hardcodedValues: [
      { value: '#ff0000', lineNumber: 5, context: '.hero { color: #ff0000; }', category: 'color' },
    ],
    nearMatches: [],
    suggestions: [
      {
        hardcodedValue: '#ff0000',
        lineNumber: 5,
        suggestedToken: 'color-primary',
        suggestedReplacement: 'var(--color-primary)',
        confidence: 1.0,
        reason: 'Exact match',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Clear env vars to ensure deterministic path by default
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GOOGLE_AI_API_KEY;
});

describe('POST /api/projects/[projectId]/design-tokens/cleanup-suggest', () => {
  it('returns deterministic changes when no API key is set', async () => {
    const { POST } = await import(
      '@/app/api/projects/[projectId]/design-tokens/cleanup-suggest/route'
    );

    const response = await POST(
      makeRequest({ driftResults: DRIFT_RESULTS }) as any,
      { params: Promise.resolve({ projectId: 'proj-1' }) },
    );

    const json = await response.json();
    expect(json.data.source).toBe('deterministic');
    expect(json.data.recommendedChanges.length).toBeGreaterThanOrEqual(1);
    expect(json.data.recommendedChanges[0].tokenName).toBe('color-primary');
  });

  it('uses LLM when API key is available', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';

    mockComplete.mockResolvedValue({
      content: JSON.stringify({
        recommendedChanges: [
          { type: 'replace', tokenName: 'color-primary', oldValue: '#ff0000', newValue: 'var(--color-primary)' },
        ],
        rationale: 'LLM says replace this.',
      }),
    });

    const { POST } = await import(
      '@/app/api/projects/[projectId]/design-tokens/cleanup-suggest/route'
    );

    const response = await POST(
      makeRequest({ driftResults: DRIFT_RESULTS }) as any,
      { params: Promise.resolve({ projectId: 'proj-1' }) },
    );

    const json = await response.json();
    expect(json.data.source).toBe('llm');
    expect(json.data.rationale).toContain('LLM says replace');
  });

  it('falls back to deterministic when LLM call fails', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';

    mockComplete.mockRejectedValue(new Error('LLM timeout'));

    const { POST } = await import(
      '@/app/api/projects/[projectId]/design-tokens/cleanup-suggest/route'
    );

    const response = await POST(
      makeRequest({ driftResults: DRIFT_RESULTS }) as any,
      { params: Promise.resolve({ projectId: 'proj-1' }) },
    );

    const json = await response.json();
    expect(json.data.source).toBe('deterministic');
    expect(json.data.recommendedChanges.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty changes when drift results have no suggestions', async () => {
    const emptyDrift = [
      {
        filePath: 'assets/empty.css',
        hardcodedValues: [],
        nearMatches: [],
        suggestions: [],
      },
    ];

    const { POST } = await import(
      '@/app/api/projects/[projectId]/design-tokens/cleanup-suggest/route'
    );

    const response = await POST(
      makeRequest({ driftResults: emptyDrift }) as any,
      { params: Promise.resolve({ projectId: 'proj-1' }) },
    );

    const json = await response.json();
    expect(json.data.recommendedChanges).toEqual([]);
    expect(json.data.source).toBe('deterministic');
  });

  it('returns 400 when driftResults is missing', async () => {
    const { POST } = await import(
      '@/app/api/projects/[projectId]/design-tokens/cleanup-suggest/route'
    );

    const response = await POST(
      makeRequest({}) as any,
      { params: Promise.resolve({ projectId: 'proj-1' }) },
    );

    expect(response.status).toBe(400);
  });
});
