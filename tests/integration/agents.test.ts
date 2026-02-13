import { describe, it, expect } from 'vitest';
import type {
  AgentType,
  AgentMessage,
  CodeChange,
  ReviewResult,
  DelegationTask,
  FileContext,
} from '@/lib/types/agent';
import { checkLiquid, checkJavaScript, checkCSS } from '@/lib/agents/validation/syntax-checker';
import { checkCrossFileConsistency } from '@/lib/agents/validation/consistency-checker';
import { ProjectManagerAgent } from '@/lib/agents/project-manager';
import { LiquidAgent } from '@/lib/agents/specialists/liquid';
import { JavaScriptAgent } from '@/lib/agents/specialists/javascript';
import { CSSAgent } from '@/lib/agents/specialists/css';
import { ReviewAgent } from '@/lib/agents/review';
import { PatternLearning } from '@/lib/agents/pattern-learning';
import {
  PROJECT_MANAGER_PROMPT,
  LIQUID_AGENT_PROMPT,
  JAVASCRIPT_AGENT_PROMPT,
  CSS_AGENT_PROMPT,
  REVIEW_AGENT_PROMPT,
} from '@/lib/agents/prompts';

describe('Agent Types', () => {
  it('should define all agent types', () => {
    const types: AgentType[] = [
      'project_manager',
      'liquid',
      'javascript',
      'css',
      'review',
    ];
    expect(types).toHaveLength(5);
  });

  it('should create valid AgentMessage', () => {
    const msg: AgentMessage = {
      id: 'msg-1',
      executionId: 'exec-1',
      fromAgent: 'project_manager',
      toAgent: 'liquid',
      messageType: 'task',
      payload: { instruction: 'Modify header template' },
      timestamp: new Date(),
    };
    expect(msg.fromAgent).toBe('project_manager');
    expect(msg.messageType).toBe('task');
  });

  it('should create valid CodeChange', () => {
    const change: CodeChange = {
      fileId: 'file-1',
      fileName: 'header.liquid',
      originalContent: '<h1>Old</h1>',
      proposedContent: '<h1>New</h1>',
      reasoning: 'Updated heading',
      agentType: 'liquid',
    };
    expect(change.agentType).toBe('liquid');
  });

  it('should create valid ReviewResult', () => {
    const result: ReviewResult = {
      approved: false,
      issues: [
        {
          severity: 'error',
          file: 'theme.js',
          line: 45,
          description: 'Missing closing brace',
          category: 'syntax',
        },
      ],
      summary: 'Found 1 error',
    };
    expect(result.approved).toBe(false);
    expect(result.issues).toHaveLength(1);
  });

  it('should create valid DelegationTask', () => {
    const task: DelegationTask = {
      agent: 'liquid',
      task: 'Add product gallery section',
      affectedFiles: ['product.liquid'],
    };
    expect(task.agent).toBe('liquid');
  });
});

describe('Agent Instances', () => {
  it('should create ProjectManagerAgent with correct config', () => {
    const pm = new ProjectManagerAgent();
    expect(pm.type).toBe('project_manager');
    expect(pm.defaultProvider).toBe('anthropic');
    expect(pm.getSystemPrompt()).toBe(PROJECT_MANAGER_PROMPT);
  });

  it('should create LiquidAgent with correct config', () => {
    const agent = new LiquidAgent();
    expect(agent.type).toBe('liquid');
    expect(agent.defaultProvider).toBe('anthropic');
    expect(agent.getSystemPrompt()).toBe(LIQUID_AGENT_PROMPT);
  });

  it('should create JavaScriptAgent with correct config', () => {
    const agent = new JavaScriptAgent();
    expect(agent.type).toBe('javascript');
    expect(agent.defaultProvider).toBe('anthropic');
    expect(agent.getSystemPrompt()).toBe(JAVASCRIPT_AGENT_PROMPT);
  });

  it('should create CSSAgent with correct config', () => {
    const agent = new CSSAgent();
    expect(agent.type).toBe('css');
    expect(agent.defaultProvider).toBe('anthropic');
    expect(agent.getSystemPrompt()).toBe(CSS_AGENT_PROMPT);
  });

  it('should create ReviewAgent with correct config', () => {
    const agent = new ReviewAgent();
    expect(agent.type).toBe('review');
    expect(agent.defaultProvider).toBe('openai');
    expect(agent.getSystemPrompt()).toBe(REVIEW_AGENT_PROMPT);
  });
});

describe('System Prompts', () => {
  it('should have version identifiers', () => {
    expect(PROJECT_MANAGER_PROMPT).toContain('Version: 1.1.0');
    expect(LIQUID_AGENT_PROMPT).toContain('Version: 1.0.0');
    expect(JAVASCRIPT_AGENT_PROMPT).toContain('Version: 1.0.0');
    expect(CSS_AGENT_PROMPT).toContain('Version: 1.0.0');
    expect(REVIEW_AGENT_PROMPT).toContain('Version: 1.0.0');
  });

  it('PM prompt should specify delegation role', () => {
    expect(PROJECT_MANAGER_PROMPT).toContain('delegate');
    expect(PROJECT_MANAGER_PROMPT).toContain('do NOT');
  });

  it('specialist prompts should restrict file types', () => {
    expect(LIQUID_AGENT_PROMPT).toContain('.liquid');
    expect(JAVASCRIPT_AGENT_PROMPT).toContain('.js');
    expect(CSS_AGENT_PROMPT).toContain('.css');
  });

  it('review prompt should define severity levels', () => {
    expect(REVIEW_AGENT_PROMPT).toContain('"error"');
    expect(REVIEW_AGENT_PROMPT).toContain('"warning"');
    expect(REVIEW_AGENT_PROMPT).toContain('"info"');
  });
});

describe('Syntax Checker', () => {
  it('should detect unclosed Liquid tags', () => {
    const code = '{% if product %}\n<h1>Hello</h1>';
    const errors = checkLiquid(code);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('Unclosed');
  });

  it('should pass valid Liquid code', () => {
    const code = '{% if product %}\n<h1>Hello</h1>\n{% endif %}';
    const errors = checkLiquid(code);
    expect(errors).toHaveLength(0);
  });

  it('should detect unclosed JavaScript braces', () => {
    const code = 'function test() {\n  console.log("hello");\n';
    const errors = checkJavaScript(code);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('unclosed brace');
  });

  it('should pass valid JavaScript', () => {
    const code = 'function test() {\n  console.log("hello");\n}';
    const errors = checkJavaScript(code);
    expect(errors).toHaveLength(0);
  });

  it('should detect unclosed CSS braces', () => {
    const code = '.header {\n  color: red;\n';
    const errors = checkCSS(code);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should pass valid CSS', () => {
    const code = '.header {\n  color: red;\n}';
    const errors = checkCSS(code);
    expect(errors).toHaveLength(0);
  });
});

describe('Consistency Checker', () => {
  it('should detect missing CSS selector for Liquid class', () => {
    const changes: CodeChange[] = [
      {
        fileId: '1',
        fileName: 'product.liquid',
        originalContent: '',
        proposedContent: '<div class="gallery-item">Content</div>',
        reasoning: 'Added gallery',
        agentType: 'liquid',
      },
    ];
    const originalFiles: FileContext[] = [
      { fileId: '2', fileName: 'theme.css', fileType: 'css', content: '.header { color: red; }' },
    ];

    const issues = checkCrossFileConsistency(changes, originalFiles);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].description).toContain('gallery-item');
  });

  it('should not flag classes that exist in CSS', () => {
    const changes: CodeChange[] = [
      {
        fileId: '1',
        fileName: 'product.liquid',
        originalContent: '',
        proposedContent: '<div class="header">Content</div>',
        reasoning: 'Added header',
        agentType: 'liquid',
      },
    ];
    const originalFiles: FileContext[] = [
      { fileId: '2', fileName: 'theme.css', fileType: 'css', content: '.header { color: red; }' },
    ];

    const issues = checkCrossFileConsistency(changes, originalFiles);
    const headerIssues = issues.filter((i) => i.description.includes('header'));
    expect(headerIssues).toHaveLength(0);
  });
});

describe('Pattern Learning', () => {
  it('should extract quote style pattern', () => {
    const pl = new PatternLearning();
    const change: CodeChange = {
      fileId: '1',
      fileName: 'theme.js',
      originalContent: '',
      proposedContent: "const a = 'hello';\nconst b = 'world';\nconst c = 'foo';\nconst d = 'bar';\nconst e = 'baz';\nconst f = 'qux';",
      reasoning: 'Added variables',
      agentType: 'javascript',
    };

    const pattern = pl.extractPattern(change);
    expect(pattern).not.toBeNull();
    expect(pattern!.pattern).toContain('single quotes');
  });

  it('should return null for ambiguous patterns', () => {
    const pl = new PatternLearning();
    const change: CodeChange = {
      fileId: '1',
      fileName: 'theme.js',
      originalContent: '',
      proposedContent: 'x = 1',
      reasoning: 'Simple change',
      agentType: 'javascript',
    };

    const pattern = pl.extractPattern(change);
    expect(pattern).toBeNull();
  });

  it('should identify standardization opportunities', () => {
    const pl = new PatternLearning();
    const files: FileContext[] = [
      { fileId: '1', fileName: 'a.js', fileType: 'javascript', content: "const x = 'hello';\nconst y = 'world';" },
      { fileId: '2', fileName: 'b.js', fileType: 'javascript', content: 'const x = "hello";\nconst y = "world";' },
    ];

    const opportunities = pl.identifyStandardizationOpportunities(files);
    expect(opportunities.length).toBeGreaterThan(0);
    expect(opportunities[0].pattern).toContain('quote');
  });
});
