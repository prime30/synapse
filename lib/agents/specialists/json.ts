import { Agent } from '../base';
import { JSON_AGENT_PROMPT } from '../prompts';
import type { AgentTask, AgentResult, CodeChange } from '@/lib/types/agent';
import { budgetFiles } from './prompt-budget';

/**
 * JSON/Config specialist agent.
 * Modifies Shopify theme JSON configuration files:
 * - settings_schema.json
 * - settings_data.json
 * - templates/*.json
 * - config/*.json
 */
export class JSONAgent extends Agent {
  constructor() {
    super('json', 'anthropic');
  }

  getSystemPrompt(): string {
    return JSON_AGENT_PROMPT;
  }

  formatPrompt(task: AgentTask): string {
    // Budget files to 25k tokens, prioritizing JSON files
    const budgeted = budgetFiles(task.context.files, 25_000);
    const jsonFiles = budgeted.filter(
      (f) => f.fileName.endsWith('.json'),
    );
    const otherFiles = budgeted.filter(
      (f) => !f.fileName.endsWith('.json'),
    );

    return [
      `Task: ${task.instruction}`,
      '',
      // Cross-file dependency context
      ...(task.context.dependencyContext
        ? [task.context.dependencyContext, '']
        : []),
      // Design system token context
      ...(task.context.designContext
        ? [task.context.designContext, '']
        : []),
      // Developer memory
      ...(task.context.memoryContext
        ? [task.context.memoryContext, '']
        : []),
      '## JSON/Config Files (you may modify these):',
      ...jsonFiles.map(
        (f) => `### ${f.path ?? f.fileName}\n\`\`\`json\n${f.content}\n\`\`\``,
      ),
      '',
      '## Other Files (read-only context):',
      ...otherFiles.slice(0, 10).map(
        (f) => `### ${f.path ?? f.fileName} (${f.fileType})\n\`\`\`\n${f.content.slice(0, 500)}${f.content.length > 500 ? '\n... (truncated)' : ''}\n\`\`\``,
      ),
      '',
      'Respond with a JSON object containing your proposed changes.',
    ].join('\n');
  }

  parseResponse(raw: string, _task: AgentTask): AgentResult {
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { agentType: 'json', success: true, changes: [] };
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        changes?: Array<{
          fileId?: string;
          fileName?: string;
          originalContent?: string;
          proposedContent?: string;
          reasoning?: string;
        }>;
      };

      const changes: CodeChange[] = (parsed.changes ?? []).map((c) => ({
        fileId: c.fileId ?? '',
        fileName: c.fileName ?? '',
        originalContent: c.originalContent ?? '',
        proposedContent: c.proposedContent ?? '',
        reasoning: c.reasoning ?? '',
        agentType: 'json' as const,
      }));

      return { agentType: 'json', success: true, changes };
    } catch {
      return { agentType: 'json', success: true, changes: [] };
    }
  }
}

// EPIC C: Self-register with the agent registry
import { getAgentRegistry } from '../registry';
getAgentRegistry().register({
  name: 'JSON',
  type: 'json',
  filePatterns: ['*.json'],
  capabilities: ['configuration', 'settings'],
  priority: 4,
  factory: () => new JSONAgent(),
  enabled: true,
});
