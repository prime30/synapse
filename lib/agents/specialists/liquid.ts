import { Agent } from '../base';
import { LIQUID_AGENT_PROMPT } from '../prompts';
import { AI_FEATURES } from '@/lib/ai/feature-flags';
import { parseLiquidAST } from '@/lib/liquid/liquid-ast';
import type { AgentTask, AgentResult, CodeChange, CodePatch } from '@/lib/types/agent';
import { applyPatches } from '@/lib/types/agent';
import { budgetFiles } from './prompt-budget';
import { SPECIALIST_OUTPUT_SCHEMA } from './output-schema';

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
    // Budget files to 35k tokens, prioritizing liquid files
    const budgeted = budgetFiles(task.context.files, 35_000);
    const liquidFiles = budgeted.filter(
      (f) => f.fileType === 'liquid'
    );
    const otherFiles = budgeted.filter(
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
      // Try direct parse first (structured outputs), fall back to regex
      let jsonString: string | null = null;
      if (AI_FEATURES.structuredOutputs) {
        try { JSON.parse(raw); jsonString = raw; } catch { /* fallthrough */ }
      }
      if (!jsonString) {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        jsonString = jsonMatch?.[0] ?? null;
      }
      if (!jsonString) {
        return { agentType: 'liquid', success: true, changes: [] };
      }

      const parsed = JSON.parse(jsonString) as {
        changes?: Array<{
          fileId?: string;
          fileName?: string;
          originalContent?: string;
          proposedContent?: string;
          patches?: CodePatch[];
          reasoning?: string;
          confidence?: number;
        }>;
      };

      const changes: CodeChange[] = (parsed.changes ?? []).map((c) => {
        const originalContent = c.originalContent ?? '';
        const patches = c.patches ?? [];
        // Prefer patches; reconstruct proposedContent from them.
        // Fall back to proposedContent if no patches provided.
        const proposedContent = patches.length > 0
          ? applyPatches(originalContent, patches)
          : (c.proposedContent ?? '');

        return {
          fileId: c.fileId ?? '',
          fileName: c.fileName ?? '',
          originalContent,
          proposedContent,
          patches: patches.length > 0 ? patches : undefined,
          reasoning: c.reasoning ?? '',
          agentType: 'liquid' as const,
          confidence: c.confidence ?? 0.8,
        };
      });

      // Aggregate confidence: average across all changes (fallback 0.8)
      const avgConfidence = changes.length > 0
        ? changes.reduce((sum, ch) => sum + (ch.confidence ?? 0.8), 0) / changes.length
        : 0.8;

      return { agentType: 'liquid', success: true, changes, confidence: avgConfidence };
    } catch {
      return { agentType: 'liquid', success: true, changes: [] };
    }
  }
}
