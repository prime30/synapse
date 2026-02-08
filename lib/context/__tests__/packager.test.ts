import { describe, it, expect } from 'vitest';
import type { ProjectContext, FileContext, FileDependency } from '../types';
import type { ProposedChange } from '../packager';
import {
  ClaudeContextPackager,
  CodexContextPackager,
} from '../packager';

// ── helpers ─────────────────────────────────────────────────────────

function createMockFile(
  overrides: Partial<FileContext> & { fileId: string; fileName: string },
): FileContext {
  return {
    fileType: 'other',
    content: '',
    sizeBytes: 0,
    lastModified: new Date('2025-01-01'),
    dependencies: { imports: [], exports: [], usedBy: [] },
    ...overrides,
  };
}

function createMockContext(
  overrides?: Partial<ProjectContext>,
): ProjectContext {
  return {
    projectId: 'proj-1',
    files: [],
    dependencies: [],
    loadedAt: new Date('2025-01-01'),
    totalSizeBytes: 0,
    ...overrides,
  };
}

// ── Claude packager ─────────────────────────────────────────────────

describe('ClaudeContextPackager', () => {
  const packager = new ClaudeContextPackager();

  describe('packageForAgent', () => {
    it('should include all file contents', () => {
      const context = createMockContext({
        files: [
          createMockFile({
            fileId: 'f1',
            fileName: 'template.liquid',
            fileType: 'liquid',
            content: '<div>Hello</div>',
          }),
          createMockFile({
            fileId: 'f2',
            fileName: 'styles.css',
            fileType: 'css',
            content: '.header { color: red; }',
          }),
        ],
      });

      const result = packager.packageForAgent(
        context,
        'Fix the header',
      );

      expect(result).toContain('<div>Hello</div>');
      expect(result).toContain('.header { color: red; }');
      expect(result).toContain('template.liquid');
      expect(result).toContain('styles.css');
    });

    it('should include dependency summary', () => {
      const dep: FileDependency = {
        sourceFileId: 'liquid-1',
        targetFileId: 'css-1',
        dependencyType: 'css_class',
        references: [
          {
            sourceLocation: { line: 1, column: 12 },
            symbol: 'header',
            context: 'class="header"',
          },
        ],
      };

      const context = createMockContext({
        files: [
          createMockFile({ fileId: 'liquid-1', fileName: 'template.liquid' }),
          createMockFile({ fileId: 'css-1', fileName: 'styles.css' }),
        ],
        dependencies: [dep],
      });

      const result = packager.packageForAgent(
        context,
        'Review dependencies',
      );

      expect(result).toContain('Dependency Summary');
      expect(result).toContain('liquid-1');
      expect(result).toContain('css-1');
      expect(result).toContain('css_class');
      expect(result).toContain('header');
    });

    it('should include user request', () => {
      const context = createMockContext();
      const result = packager.packageForAgent(
        context,
        'Please refactor the template',
      );

      expect(result).toContain('Please refactor the template');
      expect(result).toContain('User Request');
    });

    it('should add agent focus note when agentType is provided', () => {
      const context = createMockContext();
      const result = packager.packageForAgent(
        context,
        'Fix liquid',
        'Liquid',
      );

      expect(result).toContain('You are the Liquid specialist');
    });

    it('should not add agent focus note when agentType is omitted', () => {
      const context = createMockContext();
      const result = packager.packageForAgent(
        context,
        'Fix liquid',
      );

      expect(result).not.toContain('specialist');
    });
  });

  describe('estimateTokens', () => {
    it('should return a reasonable estimate based on character count', () => {
      // 400 chars → ~100 tokens
      const text = 'a'.repeat(400);
      const tokens = packager.estimateTokens(text);
      expect(tokens).toBe(100);
    });

    it('should round up for non-exact division', () => {
      const text = 'abcde'; // 5 chars → ceil(5/4) = 2
      expect(packager.estimateTokens(text)).toBe(2);
    });

    it('should return 0 for empty text', () => {
      expect(packager.estimateTokens('')).toBe(0);
    });
  });

  describe('shouldWarn', () => {
    it('should return true when context exceeds 160K tokens', () => {
      // 160 001 tokens × 4 chars/token = 640 004 chars
      const bigContent = 'x'.repeat(640_004);

      const context = createMockContext({
        files: [
          createMockFile({
            fileId: 'big',
            fileName: 'big.liquid',
            content: bigContent,
          }),
        ],
      });

      expect(packager.shouldWarn(context)).toBe(true);
    });

    it('should return false for small context', () => {
      const context = createMockContext({
        files: [
          createMockFile({
            fileId: 'small',
            fileName: 'small.liquid',
            content: 'Hello',
          }),
        ],
      });

      expect(packager.shouldWarn(context)).toBe(false);
    });
  });
});

// ── Codex packager ──────────────────────────────────────────────────

describe('CodexContextPackager', () => {
  const packager = new CodexContextPackager();

  describe('packageForReview', () => {
    it('should include original and proposed content', () => {
      const context = createMockContext({
        files: [
          createMockFile({
            fileId: 'f1',
            fileName: 'template.liquid',
            content: '<div>Old</div>',
          }),
        ],
      });

      const changes: ProposedChange[] = [
        {
          fileId: 'f1',
          fileName: 'template.liquid',
          originalContent: '<div>Old</div>',
          proposedContent: '<div>New</div>',
          agentType: 'Liquid',
        },
      ];

      const result = packager.packageForReview(context, changes);

      expect(result).toContain('<div>Old</div>');
      expect(result).toContain('<div>New</div>');
      expect(result).toContain('Original');
      expect(result).toContain('Proposed');
    });

    it('should focus on changed files only', () => {
      const context = createMockContext({
        files: [
          createMockFile({
            fileId: 'f1',
            fileName: 'template.liquid',
            content: '<div>Old</div>',
          }),
          createMockFile({
            fileId: 'f2',
            fileName: 'untouched.css',
            content: '.header { color: blue; }',
          }),
        ],
      });

      const changes: ProposedChange[] = [
        {
          fileId: 'f1',
          fileName: 'template.liquid',
          originalContent: '<div>Old</div>',
          proposedContent: '<div>New</div>',
          agentType: 'Liquid',
        },
      ];

      const result = packager.packageForReview(context, changes);

      // Changed file present
      expect(result).toContain('template.liquid');
      expect(result).toContain('<div>New</div>');

      // Untouched file NOT in changed-files section
      expect(result).not.toContain('untouched.css');
      expect(result).not.toContain('.header { color: blue; }');
    });

    it('should include dependency impact section for affected deps', () => {
      const dep: FileDependency = {
        sourceFileId: 'f1',
        targetFileId: 'f2',
        dependencyType: 'css_class',
        references: [
          {
            sourceLocation: { line: 1, column: 5 },
            symbol: 'header',
            context: 'class="header"',
          },
        ],
      };

      const context = createMockContext({
        files: [
          createMockFile({ fileId: 'f1', fileName: 'template.liquid' }),
          createMockFile({ fileId: 'f2', fileName: 'styles.css' }),
        ],
        dependencies: [dep],
      });

      const changes: ProposedChange[] = [
        {
          fileId: 'f1',
          fileName: 'template.liquid',
          originalContent: '<div class="header">',
          proposedContent: '<div class="banner">',
          agentType: 'Liquid',
        },
      ];

      const result = packager.packageForReview(context, changes);

      expect(result).toContain('Dependency Impact');
      expect(result).toContain('css_class');
      expect(result).toContain('header');
    });

    it('should omit dependency impact section when no deps affected', () => {
      const dep: FileDependency = {
        sourceFileId: 'unrelated-1',
        targetFileId: 'unrelated-2',
        dependencyType: 'css_class',
        references: [
          {
            sourceLocation: { line: 1, column: 1 },
            symbol: 'foo',
            context: 'class="foo"',
          },
        ],
      };

      const context = createMockContext({
        files: [
          createMockFile({ fileId: 'f1', fileName: 'template.liquid' }),
        ],
        dependencies: [dep],
      });

      const changes: ProposedChange[] = [
        {
          fileId: 'f1',
          fileName: 'template.liquid',
          originalContent: '<div>Old</div>',
          proposedContent: '<div>New</div>',
          agentType: 'Liquid',
        },
      ];

      const result = packager.packageForReview(context, changes);

      expect(result).not.toContain('Dependency Impact');
    });
  });

  describe('estimateTokens', () => {
    it('should return a reasonable estimate based on character count', () => {
      const text = 'b'.repeat(800);
      expect(packager.estimateTokens(text)).toBe(200);
    });
  });
});
