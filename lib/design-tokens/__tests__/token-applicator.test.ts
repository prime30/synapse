/**
 * REQ-52 Task 5: Unit tests for the token application engine.
 *
 * Mocks the file service (getFile, updateFile, listProjectFiles)
 * and the design-system version model to test the TokenApplicator
 * in isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TokenChange } from '../application/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockListProjectFiles = vi.fn();
const mockGetFile = vi.fn();
const mockUpdateFile = vi.fn();

vi.mock('@/lib/services/files', () => ({
  listProjectFiles: (...args: unknown[]) => mockListProjectFiles(...args),
  getFile: (...args: unknown[]) => mockGetFile(...args),
  updateFile: (...args: unknown[]) => mockUpdateFile(...args),
}));

const mockCreateVersion = vi.fn();
const mockGetLatestVersion = vi.fn();
const mockGetVersionById = vi.fn();

vi.mock('../models/token-model', () => ({
  createVersion: (...args: unknown[]) => mockCreateVersion(...args),
  getLatestVersion: (...args: unknown[]) => mockGetLatestVersion(...args),
  getVersionById: (...args: unknown[]) => mockGetVersionById(...args),
}));

// Import module under test AFTER mocks
const { TokenApplicator } = await import('../application/token-applicator');
const { validateCSS, validateLiquid } = await import(
  '../application/syntax-validator'
);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_ID = 'proj-test-123';
const USER_ID = 'user-abc';

const CSS_FILE = {
  id: 'file-1',
  name: 'theme.css',
  path: 'assets/theme.css',
  content: `
:root {
  --color-primary: #ff0000;
  --color-secondary: #00ff00;
}
.hero {
  color: var(--color-primary);
  background: #ff0000;
}
`.trim(),
};

const LIQUID_FILE = {
  id: 'file-2',
  name: 'header.liquid',
  path: 'sections/header.liquid',
  content: `
{% if section.settings.show_header %}
<header style="color: #ff0000;">
  {{ section.settings.title }}
</header>
{% endif %}
`.trim(),
};

const JS_FILE = {
  id: 'file-3',
  name: 'utils.js',
  path: 'assets/utils.js',
  content: `const primaryColor = '#ff0000';`,
};

function setupFiles(files: typeof CSS_FILE[]) {
  mockListProjectFiles.mockResolvedValue(
    files.map((f) => ({ id: f.id, name: f.name, path: f.path })),
  );
  mockGetFile.mockImplementation((id: string) => {
    const file = files.find((f) => f.id === id);
    if (!file) throw new Error(`File not found: ${id}`);
    return Promise.resolve({ content: file.content });
  });
  mockUpdateFile.mockResolvedValue({});
  mockGetLatestVersion.mockResolvedValue(null);
  mockCreateVersion.mockResolvedValue({ id: 'ver-new-1', version_number: 1 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let applicator: InstanceType<typeof TokenApplicator>;

beforeEach(() => {
  vi.clearAllMocks();
  applicator = new TokenApplicator();
});

// ---------------------------------------------------------------------------
// analyzeImpact
// ---------------------------------------------------------------------------

describe('analyzeImpact', () => {
  it('identifies correct files and instance counts for replace', async () => {
    setupFiles([CSS_FILE, LIQUID_FILE, JS_FILE]);

    const changes: TokenChange[] = [
      { type: 'replace', tokenName: 'color-primary', oldValue: '#ff0000', newValue: 'var(--color-primary)' },
    ];

    const impact = await applicator.analyzeImpact(PROJECT_ID, changes);

    // CSS file: #ff0000 appears in declaration value + .hero background = 2
    // Liquid file: #ff0000 appears in inline style = 1
    // JS file: '#ff0000' = 1
    expect(impact.totalInstances).toBe(4);
    expect(impact.filesAffected).toHaveLength(3);

    const cssImpact = impact.filesAffected.find((f) => f.filePath === CSS_FILE.path)!;
    expect(cssImpact.instanceCount).toBe(2);

    const liquidImpact = impact.filesAffected.find((f) => f.filePath === LIQUID_FILE.path)!;
    expect(liquidImpact.instanceCount).toBe(1);
  });

  it('returns empty analysis when no files match', async () => {
    setupFiles([CSS_FILE]);

    const changes: TokenChange[] = [
      { type: 'replace', tokenName: 'nonexistent', oldValue: '#abcdef', newValue: 'blue' },
    ];

    const impact = await applicator.analyzeImpact(PROJECT_ID, changes);

    expect(impact.totalInstances).toBe(0);
    expect(impact.filesAffected).toHaveLength(0);
    expect(impact.riskSummary).toContain('No files affected');
  });

  it('correctly identifies rename impacts', async () => {
    setupFiles([CSS_FILE]);

    const changes: TokenChange[] = [
      { type: 'rename', tokenName: 'color-primary', newValue: 'brand-primary' },
    ];

    const impact = await applicator.analyzeImpact(PROJECT_ID, changes);

    // --color-primary declaration + var(--color-primary) reference = 2
    expect(impact.totalInstances).toBe(2);
    expect(impact.filesAffected).toHaveLength(1);
  });

  it('assigns correct risk levels', async () => {
    // Create a file with many instances
    const bigCss = {
      id: 'file-big',
      name: 'big.css',
      path: 'assets/big.css',
      content: Array(15).fill('.item { color: #ff0000; }').join('\n'),
    };
    setupFiles([CSS_FILE, bigCss]);

    const changes: TokenChange[] = [
      { type: 'replace', tokenName: 'color', oldValue: '#ff0000', newValue: '#0000ff' },
    ];

    const impact = await applicator.analyzeImpact(PROJECT_ID, changes);

    const cssRisk = impact.filesAffected.find((f) => f.filePath === CSS_FILE.path)!;
    expect(cssRisk.riskLevel).toBe('low'); // 2 instances

    const bigRisk = impact.filesAffected.find((f) => f.filePath === bigCss.path)!;
    expect(bigRisk.riskLevel).toBe('high'); // 15 instances
  });

  it('skips files that fail to read', async () => {
    mockListProjectFiles.mockResolvedValue([
      { id: 'ok', name: 'ok.css', path: 'ok.css' },
      { id: 'broken', name: 'broken.css', path: 'broken.css' },
    ]);
    mockGetFile.mockImplementation((id: string) => {
      if (id === 'broken') throw new Error('Storage error');
      return Promise.resolve({ content: '.a { color: #ff0000; }' });
    });

    const changes: TokenChange[] = [
      { type: 'replace', tokenName: 'c', oldValue: '#ff0000', newValue: 'red' },
    ];

    const impact = await applicator.analyzeImpact(PROJECT_ID, changes);
    expect(impact.filesAffected).toHaveLength(1);
    expect(impact.filesAffected[0].filePath).toBe('ok.css');
  });
});

// ---------------------------------------------------------------------------
// applyTokenChanges
// ---------------------------------------------------------------------------

describe('applyTokenChanges', () => {
  it('replaces values in file content and writes atomically', async () => {
    setupFiles([CSS_FILE, JS_FILE]);

    const changes: TokenChange[] = [
      { type: 'replace', tokenName: 'color-primary', oldValue: '#ff0000', newValue: '#0000ff' },
    ];

    const result = await applicator.applyTokenChanges(PROJECT_ID, changes, USER_ID);

    expect(result.success).toBe(true);
    expect(result.filesModified).toContain(CSS_FILE.path);
    expect(result.instancesChanged).toBeGreaterThan(0);

    // Verify updateFile was called with replaced content
    const cssWriteCall = mockUpdateFile.mock.calls.find(
      (args: unknown[]) => args[0] === CSS_FILE.id,
    );
    expect(cssWriteCall).toBeDefined();
    const newCSSContent = (cssWriteCall![1] as { content: string }).content;
    expect(newCSSContent).toContain('#0000ff');
    expect(newCSSContent).not.toContain('#ff0000');
  });

  it('renames CSS variable references', async () => {
    setupFiles([CSS_FILE]);

    const changes: TokenChange[] = [
      { type: 'rename', tokenName: 'color-primary', newValue: 'brand-primary' },
    ];

    const result = await applicator.applyTokenChanges(PROJECT_ID, changes, USER_ID);

    expect(result.success).toBe(true);

    const writeCall = mockUpdateFile.mock.calls[0];
    const newContent = (writeCall[1] as { content: string }).content;
    expect(newContent).toContain('--brand-primary');
    expect(newContent).toContain('var(--brand-primary)');
    expect(newContent).not.toContain('--color-primary');
  });

  it('handles delete changes', async () => {
    setupFiles([CSS_FILE]);

    const changes: TokenChange[] = [
      { type: 'delete', tokenName: 'color-primary' },
    ];

    const result = await applicator.applyTokenChanges(PROJECT_ID, changes, USER_ID);

    expect(result.success).toBe(true);

    const writeCall = mockUpdateFile.mock.calls[0];
    const newContent = (writeCall[1] as { content: string }).content;
    // Declaration should be removed, var() reference replaced with 'inherit'
    expect(newContent).not.toContain('--color-primary:');
    expect(newContent).toContain('inherit');
  });

  it('returns success with no modifications when no files match', async () => {
    setupFiles([CSS_FILE]);

    const changes: TokenChange[] = [
      { type: 'replace', tokenName: 'nothing', oldValue: '#zzzzzz', newValue: '#aaa' },
    ];

    const result = await applicator.applyTokenChanges(PROJECT_ID, changes, USER_ID);

    expect(result.success).toBe(true);
    expect(result.filesModified).toHaveLength(0);
    expect(result.instancesChanged).toBe(0);
    expect(mockUpdateFile).not.toHaveBeenCalled();
  });

  it('creates a design-system version on success', async () => {
    setupFiles([CSS_FILE]);

    const changes: TokenChange[] = [
      { type: 'replace', tokenName: 'c', oldValue: '#ff0000', newValue: '#0000ff' },
    ];

    const result = await applicator.applyTokenChanges(PROJECT_ID, changes, USER_ID);

    expect(result.success).toBe(true);
    expect(result.versionId).toBe('ver-new-1');
    expect(mockCreateVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: PROJECT_ID,
        version_number: 1,
        author_id: USER_ID,
      }),
    );
  });

  it('rolls back (writes nothing) when validation fails', async () => {
    // Create a file where the replacement would break CSS syntax
    const brokenAfterReplace = {
      id: 'file-bad',
      name: 'bad.css',
      path: 'assets/bad.css',
      // The replacement will produce an unclosed brace
      content: '.a { color: REPLACE_ME; }',
    };
    setupFiles([brokenAfterReplace]);

    const changes: TokenChange[] = [
      {
        type: 'replace',
        tokenName: 'test',
        // This replacement removes the closing brace — syntax error
        oldValue: 'REPLACE_ME; }',
        newValue: '#000; /* missing close',
      },
    ];

    const result = await applicator.applyTokenChanges(PROJECT_ID, changes, USER_ID);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.errors![0]).toContain('Validation failed');
    // No files should have been written
    expect(mockUpdateFile).not.toHaveBeenCalled();
  });

  it('handles partial write failures gracefully', async () => {
    setupFiles([CSS_FILE, JS_FILE]);

    // Make the second updateFile call throw
    let callCount = 0;
    mockUpdateFile.mockImplementation(() => {
      callCount++;
      if (callCount === 2) throw new Error('DB write error');
      return Promise.resolve({});
    });

    const changes: TokenChange[] = [
      { type: 'replace', tokenName: 'c', oldValue: '#ff0000', newValue: '#0000ff' },
    ];

    const result = await applicator.applyTokenChanges(PROJECT_ID, changes, USER_ID);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toContain('Failed to write');
  });
});

// ---------------------------------------------------------------------------
// Syntax validators (unit tests)
// ---------------------------------------------------------------------------

describe('validateCSS', () => {
  it('passes valid CSS', () => {
    const result = validateCSS('.a { color: red; } .b { font-size: 16px; }');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('catches unclosed braces', () => {
    const result = validateCSS('.a { color: red;');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('unclosed brace'))).toBe(true);
  });

  it('catches unmatched quotes', () => {
    const result = validateCSS('.a { content: "hello; }');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Unmatched double quote'))).toBe(true);
  });

  it('catches unexpected closing braces', () => {
    const result = validateCSS('.a { color: red; } }');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Unexpected closing brace'))).toBe(true);
  });

  it('handles escaped characters in strings', () => {
    const result = validateCSS(".a { content: \"it\\'s ok\"; }");
    expect(result.valid).toBe(true);
  });

  it('catches unmatched parentheses', () => {
    const result = validateCSS('.a { background: url(foo.png; }');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('unclosed parenthesis'))).toBe(true);
  });
});

describe('validateLiquid', () => {
  it('passes valid Liquid', () => {
    const result = validateLiquid(
      '{% if true %}<p>{{ title }}</p>{% endif %}',
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('catches unclosed Liquid tags', () => {
    const result = validateLiquid('{% if true %}<p>Hello</p>');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Unclosed Liquid tag'))).toBe(true);
  });

  it('catches mismatched Liquid tags', () => {
    const result = validateLiquid('{% if true %}{% endfor %}');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Mismatched Liquid tags'))).toBe(true);
  });

  it('catches unexpected endtags', () => {
    const result = validateLiquid('{% endif %}');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Unexpected'))).toBe(true);
  });

  it('catches unmatched output tags', () => {
    const result = validateLiquid('{{ title }');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Unmatched Liquid output'))).toBe(true);
  });

  it('handles nested block tags', () => {
    const template = `
{% if true %}
  {% for item in items %}
    {{ item.name }}
  {% endfor %}
{% endif %}`;
    const result = validateLiquid(template);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// rollback
// ---------------------------------------------------------------------------

describe('rollback', () => {
  it('restores previous state by inverting replace changes', async () => {
    mockGetVersionById.mockResolvedValue({
      id: 'ver-1',
      project_id: PROJECT_ID,
      version_number: 1,
      changes: {
        tokenChanges: [
          { type: 'replace', tokenName: 'c', oldValue: '#ff0000', newValue: '#0000ff' },
        ],
        filesModified: [CSS_FILE.path],
      },
    });

    // After inversion, the applicator calls applyTokenChanges which will
    // look for '#0000ff' (the newValue from the original) and replace with '#ff0000'
    const cssWithApplied = {
      ...CSS_FILE,
      content: CSS_FILE.content.replace(/#ff0000/g, '#0000ff'),
    };
    setupFiles([cssWithApplied]);

    await applicator.rollback(PROJECT_ID, 'ver-1');

    // Verify updateFile was called with the reverted content
    expect(mockUpdateFile).toHaveBeenCalled();
    const writeCall = mockUpdateFile.mock.calls[0];
    const restoredContent = (writeCall[1] as { content: string }).content;
    expect(restoredContent).toContain('#ff0000');
  });

  it('inverts rename changes correctly', async () => {
    mockGetVersionById.mockResolvedValue({
      id: 'ver-2',
      project_id: PROJECT_ID,
      version_number: 2,
      changes: {
        tokenChanges: [
          { type: 'rename', tokenName: 'color-primary', newValue: 'brand-primary' },
        ],
        filesModified: [CSS_FILE.path],
      },
    });

    // File content with already-renamed tokens
    const renamedCss = {
      ...CSS_FILE,
      content: CSS_FILE.content
        .replace(/--color-primary/g, '--brand-primary')
        .replace(/var\(--color-primary\)/g, 'var(--brand-primary)'),
    };
    setupFiles([renamedCss]);

    await applicator.rollback(PROJECT_ID, 'ver-2');

    expect(mockUpdateFile).toHaveBeenCalled();
    const writeCall = mockUpdateFile.mock.calls[0];
    const restoredContent = (writeCall[1] as { content: string }).content;
    expect(restoredContent).toContain('--color-primary');
    expect(restoredContent).toContain('var(--color-primary)');
  });

  it('throws when version not found', async () => {
    mockGetVersionById.mockResolvedValue(null);

    await expect(
      applicator.rollback(PROJECT_ID, 'nonexistent'),
    ).rejects.toThrow('not found');
  });

  it('throws when version has only delete changes (non-invertible)', async () => {
    mockGetVersionById.mockResolvedValue({
      id: 'ver-3',
      project_id: PROJECT_ID,
      version_number: 3,
      changes: {
        tokenChanges: [
          { type: 'delete', tokenName: 'color-primary' },
        ],
        filesModified: [CSS_FILE.path],
      },
    });

    setupFiles([CSS_FILE]);

    await expect(
      applicator.rollback(PROJECT_ID, 'ver-3'),
    ).rejects.toThrow('No invertible changes');
  });
});
