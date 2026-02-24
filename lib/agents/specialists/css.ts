import { Agent } from '../base';
import { CSS_AGENT_PROMPT } from '../prompts';
import { AI_FEATURES } from '@/lib/ai/feature-flags';
import type { AgentTask, AgentResult, CodeChange, CodePatch } from '@/lib/types/agent';
import { applyPatches } from '@/lib/types/agent';
import { budgetFiles } from './prompt-budget';
import { SPECIALIST_OUTPUT_SCHEMA } from './output-schema';

/**
 * CSS specialist agent.
 * Modifies only .css and .scss files based on delegated tasks.
 */
export class CSSAgent extends Agent {
  constructor() {
    super('css', 'anthropic');
  }

  getSystemPrompt(): string {
    return CSS_AGENT_PROMPT;
  }

  formatPrompt(task: AgentTask): string {
    // Budget files to 35k tokens, prioritizing CSS files
    const budgeted = budgetFiles(task.context.files, 35_000);
    const cssFiles = budgeted.filter((f) => f.fileType === 'css');
    const otherFiles = budgeted.filter((f) => f.fileType !== 'css');

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
      '## CSS/SCSS Files (you may modify these):',
      ...cssFiles.map(
        (f) => `### ${f.fileName}\n\`\`\`css\n${f.content}\n\`\`\``
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
      agentType: 'css',
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
  name: 'CSS',
  type: 'css',
  filePatterns: ['*.css', '*.scss'],
  capabilities: ['styling', 'performance'],
  priority: 2,
  factory: () => new CSSAgent(),
  enabled: true,
});
