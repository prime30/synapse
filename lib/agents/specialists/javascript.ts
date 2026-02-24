import { Agent } from '../base';
import { JAVASCRIPT_AGENT_PROMPT } from '../prompts';
import { AI_FEATURES } from '@/lib/ai/feature-flags';
import type { AgentTask, AgentResult, CodeChange, CodePatch } from '@/lib/types/agent';
import { applyPatches } from '@/lib/types/agent';
import { budgetFiles } from './prompt-budget';
import { SPECIALIST_OUTPUT_SCHEMA } from './output-schema';

/**
 * JavaScript specialist agent.
 * Modifies only .js and .ts files based on delegated tasks.
 */
export class JavaScriptAgent extends Agent {
  constructor() {
    super('javascript', 'anthropic');
  }

  getSystemPrompt(): string {
    return JAVASCRIPT_AGENT_PROMPT;
  }

  formatPrompt(task: AgentTask): string {
    // Budget files to 35k tokens, prioritizing JS files
    const budgeted = budgetFiles(task.context.files, 35_000);
    const jsFiles = budgeted.filter(
      (f) => f.fileType === 'javascript'
    );
    const otherFiles = budgeted.filter(
      (f) => f.fileType !== 'javascript'
    );

    return [
      `Task: ${task.instruction}`,
      '',
      // Cross-file dependency context from REQ-5 context system
      ...(task.context.dependencyContext
        ? [task.context.dependencyContext, '']
        : []),
      // Design system token context from REQ-52
      ...(task.context.designContext
        ? [task.context.designContext, '']
        : []),
      // Live DOM context from Shopify preview bridge
      ...(task.context.domContext
        ? [task.context.domContext, '']
        : []),
      '## JavaScript/TypeScript Files (you may modify these):',
      ...jsFiles.map(
        (f) => `### ${f.fileName}\n\`\`\`javascript\n${f.content}\n\`\`\``
      ),
      '',
      '## Other Files (read-only context):',
      ...otherFiles.map(
        (f) => `### ${f.fileName} (${f.fileType})\n\`\`\`\n${f.content}\n\`\`\``
      ),
      '',
      'Respond with a JSON object containing your proposed changes.',
    ].join('\n');
  }

  parseResponse(raw: string): AgentResult {
    return {
      agentType: 'javascript',
      success: true,
      analysis: raw,
      changes: [],
      confidence: 0.8,
    };
  }
}

// EPIC C: Self-register with the agent registry
import { getAgentRegistry } from '../registry';
getAgentRegistry().register({
  name: 'JavaScript',
  type: 'javascript',
  filePatterns: ['*.js', '*.ts', '*.jsx', '*.tsx'],
  capabilities: ['scripting', 'performance'],
  priority: 3,
  factory: () => new JavaScriptAgent(),
  enabled: true,
});
