import { Agent } from '../base';
import { LIQUID_AGENT_PROMPT } from '../prompts';
import type { AgentTask, AgentResult, CodeChange } from '@/lib/types/agent';

/**
 * Liquid specialist agent.
 * Modifies only .liquid files based on delegated tasks.
 */
export class LiquidAgent extends Agent {
  constructor() {
    super('liquid', 'anthropic');
  }

  getSystemPrompt(): string {
    return LIQUID_AGENT_PROMPT;
  }

  formatPrompt(task: AgentTask): string {
    const liquidFiles = task.context.files.filter(
      (f) => f.fileType === 'liquid'
    );
    const otherFiles = task.context.files.filter(
      (f) => f.fileType !== 'liquid'
    );

    return [
      `Task: ${task.instruction}`,
      '',
      '## Liquid Files (you may modify these):',
      ...liquidFiles.map(
        (f) => `### ${f.fileName}\n\`\`\`liquid\n${f.content}\n\`\`\``
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

  parseResponse(raw: string, _task: AgentTask): AgentResult {
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { agentType: 'liquid', success: true, changes: [] };
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
        agentType: 'liquid' as const,
      }));

      return { agentType: 'liquid', success: true, changes };
    } catch {
      return { agentType: 'liquid', success: true, changes: [] };
    }
  }
}
