import { Agent } from '../base';
import { CSS_AGENT_PROMPT } from '../prompts';
import type { AgentTask, AgentResult, CodeChange } from '@/lib/types/agent';

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
    const cssFiles = task.context.files.filter((f) => f.fileType === 'css');
    const otherFiles = task.context.files.filter((f) => f.fileType !== 'css');

    return [
      `Task: ${task.instruction}`,
      '',
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
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { agentType: 'css', success: true, changes: [] };
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
        agentType: 'css' as const,
      }));

      return { agentType: 'css', success: true, changes };
    } catch {
      return { agentType: 'css', success: true, changes: [] };
    }
  }
}
