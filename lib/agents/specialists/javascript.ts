import { Agent } from '../base';
import { JAVASCRIPT_AGENT_PROMPT } from '../prompts';
import type { AgentTask, AgentResult, CodeChange } from '@/lib/types/agent';

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
    const jsFiles = task.context.files.filter(
      (f) => f.fileType === 'javascript'
    );
    const otherFiles = task.context.files.filter(
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
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { agentType: 'javascript', success: true, changes: [] };
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
        agentType: 'javascript' as const,
      }));

      return { agentType: 'javascript', success: true, changes };
    } catch {
      return { agentType: 'javascript', success: true, changes: [] };
    }
  }
}
