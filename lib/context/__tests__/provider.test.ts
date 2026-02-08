import { describe, it, expect } from 'vitest';
import { ClaudeContextPackager, CodexContextPackager } from '../packager';
import type { ProjectContext, FileContext } from '../types';
import type { ProposedChange } from '../packager';
import type { AgentContext } from '@/lib/types/agent';

function makeContext(files: FileContext[]): ProjectContext {
  return {
    projectId: 'proj-1',
    files,
    dependencies: [],
    loadedAt: new Date(),
    totalSizeBytes: files.reduce((s, f) => s + f.sizeBytes, 0),
  };
}

function makeFile(
  id: string,
  name: string,
  type: FileContext['fileType'],
  content: string
): FileContext {
  return {
    fileId: id,
    fileName: name,
    fileType: type,
    content,
    sizeBytes: new TextEncoder().encode(content).length,
    lastModified: new Date(),
    dependencies: { imports: [], exports: [], usedBy: [] },
  };
}

describe('AgentContextProvider - formatting', () => {
  const claude = new ClaudeContextPackager();
  const codex = new CodexContextPackager();

  const files: FileContext[] = [
    makeFile('f1', 'product.liquid', 'liquid', '<h1>{{ product.title }}</h1>'),
    makeFile('f2', 'theme.js', 'javascript', 'function init() {}'),
    makeFile('f3', 'theme.css', 'css', '.product-grid { display: grid; }'),
  ];
  const ctx = makeContext(files);

  it('Claude packager formats all files for PM agent', () => {
    const result = claude.packageForAgent(ctx, 'Fix the grid', 'project_manager');
    expect(result).toContain('product.liquid');
    expect(result).toContain('theme.js');
    expect(result).toContain('theme.css');
    expect(result).toContain('Fix the grid');
  });

  it('Claude packager adds specialist focus note', () => {
    const result = claude.packageForAgent(ctx, 'Fix the grid', 'liquid');
    expect(result).toContain('liquid');
  });

  it('Codex packager includes proposed changes', () => {
    const changes: ProposedChange[] = [
      {
        fileId: 'f3',
        fileName: 'theme.css',
        originalContent: '.product-grid { display: grid; }',
        proposedContent: '.product-grid { display: flex; }',
        agentType: 'css',
      },
    ];
    const result = codex.packageForReview(ctx, changes);
    expect(result).toContain('theme.css');
    expect(result).toContain('display: flex');
    expect(result).toContain('display: grid');
  });

  it('AgentContext structure is correct', () => {
    const agentCtx: AgentContext = {
      executionId: 'exec-1',
      projectId: 'proj-1',
      userId: 'user-1',
      userRequest: 'Fix the grid',
      files: files.map((f) => ({
        fileId: f.fileId,
        fileName: f.fileName,
        fileType: f.fileType,
        content: f.content,
      })),
      userPreferences: [],
    };
    expect(agentCtx.files).toHaveLength(3);
    expect(agentCtx.userRequest).toBe('Fix the grid');
  });

  it('formats for review agent with changes', () => {
    const changes: ProposedChange[] = [
      {
        fileId: 'f2',
        fileName: 'theme.js',
        originalContent: 'function init() {}',
        proposedContent: 'function init() { console.log("ready"); }',
        agentType: 'javascript',
      },
    ];
    const result = codex.packageForReview(ctx, changes);
    expect(result).toContain('theme.js');
    expect(result).toContain('console.log');
  });
});
