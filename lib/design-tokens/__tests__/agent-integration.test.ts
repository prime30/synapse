/**
 * REQ-52 Task 7: Agent integration layer tests.
 *
 * Tests the DesignSystemContextProvider and DesignCodeValidator
 * by mocking the token-model's listByProject.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DesignTokenRow } from '../models/token-model';

// ---------------------------------------------------------------------------
// Mock token-model — intercept listByProject
// ---------------------------------------------------------------------------

const mockListByProject = vi.fn<(projectId: string) => Promise<DesignTokenRow[]>>();

vi.mock('../models/token-model', () => ({
  listByProject: (...args: unknown[]) => mockListByProject(args[0] as string),
}));

// Import AFTER mocks
const { DesignSystemContextProvider } = await import(
  '../agent-integration/context-provider'
);
const { DesignCodeValidator } = await import(
  '../agent-integration/code-validator'
);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const PROJECT_ID = 'test-project-123';

function makeToken(
  overrides: Partial<DesignTokenRow> & Pick<DesignTokenRow, 'name' | 'category' | 'value'>,
): DesignTokenRow {
  return {
    id: crypto.randomUUID(),
    project_id: PROJECT_ID,
    aliases: [],
    description: null,
    metadata: {},
    semantic_parent_id: null,
    created_at: '2026-02-10T00:00:00Z',
    updated_at: '2026-02-10T00:00:00Z',
    ...overrides,
  };
}

const COLOR_TOKEN = makeToken({
  name: 'color-primary',
  category: 'color',
  value: '#3B82F6',
  description: 'Primary brand color',
});

const FONT_TOKEN = makeToken({
  name: 'font-heading',
  category: 'typography',
  value: '"Inter", sans-serif',
});

const SPACING_TOKEN = makeToken({
  name: 'spacing-md',
  category: 'spacing',
  value: '16px',
});

const BORDER_TOKEN = makeToken({
  name: 'border-radius-md',
  category: 'border',
  value: '8px',
});

const ALL_TOKENS = [COLOR_TOKEN, FONT_TOKEN, SPACING_TOKEN, BORDER_TOKEN];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// DesignSystemContextProvider
// ---------------------------------------------------------------------------

describe('DesignSystemContextProvider', () => {
  const provider = new DesignSystemContextProvider();

  it('generates formatted token list grouped by category', async () => {
    mockListByProject.mockResolvedValue(ALL_TOKENS);

    const ctx = await provider.getDesignContext(PROJECT_ID);

    // Should contain section headers
    expect(ctx).toContain('## Design System Tokens');
    expect(ctx).toContain('### Color Tokens');
    expect(ctx).toContain('### Typography Tokens');
    expect(ctx).toContain('### Spacing Tokens');
    expect(ctx).toContain('### Border Tokens');

    // Should contain token values in CSS custom property format
    expect(ctx).toContain('--color-primary: #3B82F6;');
    expect(ctx).toContain('--font-heading: "Inter", sans-serif;');
    expect(ctx).toContain('--spacing-md: 16px;');
    expect(ctx).toContain('--border-radius-md: 8px;');

    // Should contain description
    expect(ctx).toContain('Primary brand color');

    // Should contain convention rules
    expect(ctx).toContain('### Convention Rules');
    expect(ctx).toContain('var(--token-name)');
    expect(ctx).toContain('{{ settings.token_name }}');
  });

  it('returns empty string when no tokens exist', async () => {
    mockListByProject.mockResolvedValue([]);

    const ctx = await provider.getDesignContext(PROJECT_ID);

    expect(ctx).toBe('');
  });

  it('returns empty string on error (graceful fallback)', async () => {
    mockListByProject.mockRejectedValue(new Error('DB error'));

    const ctx = await provider.getDesignContext(PROJECT_ID);

    expect(ctx).toBe('');
  });

  it('only includes sections for categories that have tokens', async () => {
    mockListByProject.mockResolvedValue([COLOR_TOKEN]);

    const ctx = await provider.getDesignContext(PROJECT_ID);

    expect(ctx).toContain('### Color Tokens');
    expect(ctx).not.toContain('### Typography Tokens');
    expect(ctx).not.toContain('### Spacing Tokens');
  });
});

// ---------------------------------------------------------------------------
// DesignCodeValidator
// ---------------------------------------------------------------------------

describe('DesignCodeValidator', () => {
  const validator = new DesignCodeValidator();

  it('detects hardcoded values that match existing tokens', async () => {
    mockListByProject.mockResolvedValue(ALL_TOKENS);

    // CSS with hardcoded color that matches a token
    const code = `.hero {
  color: #3B82F6;
  padding: 16px;
}`;

    const report = await validator.validateGeneratedCode(code, PROJECT_ID, 'css');

    expect(report.valid).toBe(false);
    expect(report.hardcodedCount).toBeGreaterThan(0);
    expect(report.issues.length).toBeGreaterThan(0);

    // At least one issue should reference the primary color
    const colorIssue = report.issues.find((i) => i.value.toLowerCase() === '#3b82f6');
    expect(colorIssue).toBeDefined();
    expect(colorIssue!.suggestion).toContain('var(--color-primary)');
  });

  it('passes clean code that uses token references', async () => {
    mockListByProject.mockResolvedValue(ALL_TOKENS);

    // CSS using var() references — no hardcoded values that match tokens
    const code = `.hero {
  --custom-local: 100%;
  display: flex;
  flex-direction: column;
}`;

    const report = await validator.validateGeneratedCode(code, PROJECT_ID, 'css');

    expect(report.valid).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it('returns valid report when no tokens exist for project', async () => {
    mockListByProject.mockResolvedValue([]);

    const code = `.hero { color: red; }`;
    const report = await validator.validateGeneratedCode(code, PROJECT_ID, 'css');

    expect(report.valid).toBe(true);
    expect(report.tokenizedCount).toBe(0);
    expect(report.hardcodedCount).toBe(0);
  });

  it('returns valid report when listByProject throws', async () => {
    mockListByProject.mockRejectedValue(new Error('DB failure'));

    const code = `.hero { color: #3B82F6; }`;
    const report = await validator.validateGeneratedCode(code, PROJECT_ID, 'css');

    expect(report.valid).toBe(true);
    expect(report.issues).toHaveLength(0);
  });
});
