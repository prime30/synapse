import { Agent } from '../base';
import { LIQUID_AGENT_PROMPT } from '../prompts';
import { parseLiquidAST } from '@/lib/liquid/liquid-ast';
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

    // Generate AST summaries for each Liquid file
    const astSummaries = liquidFiles
      .map((f) => {
        try {
          const result = parseLiquidAST(f.content);
          if (result.errors.length > 0 || result.ast.length === 0) return null;

          // Summarize the AST structure
          const nodeTypes: Record<string, number> = {};
          const variables: string[] = [];
          const sections: string[] = [];

          for (const node of result.ast) {
            const type = node.type;
            nodeTypes[type] = (nodeTypes[type] || 0) + 1;

            if (type === 'Assign') {
              variables.push((node as { name: string }).name);
            }
            if (type === 'Schema') {
              try {
                const schemaNode = node as { jsonContent: string; parsedJSON: unknown };
                const parsed =
                  schemaNode.parsedJSON ??
                  (schemaNode.jsonContent
                    ? JSON.parse(schemaNode.jsonContent.trim())
                    : null);
                if (parsed && typeof parsed === 'object' && 'name' in parsed && parsed.name) {
                  sections.push(String(parsed.name));
                }
              } catch {
                /* ignore */
              }
            }
          }

          const parts: string[] = [
            `Structure: ${Object.entries(nodeTypes)
              .map(([t, c]) => `${c} ${t}`)
              .join(', ')}`,
          ];
          if (variables.length > 0)
            parts.push(`Variables: ${variables.join(', ')}`);
          if (sections.length > 0)
            parts.push(`Schema name: ${sections.join(', ')}`);

          return `${f.fileName}: ${parts.join(' | ')}`;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

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
      ...(astSummaries.length > 0
        ? ['## Template Structure (AST analysis):', ...astSummaries, '']
        : []),
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
