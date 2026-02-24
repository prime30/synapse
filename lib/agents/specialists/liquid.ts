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
    // When using executeWithTools, the specialist's edits are already applied
    // via search_replace/propose_code_edit tools. The final response is just
    // a summary. Return it as analysis text.
    return {
      agentType: 'liquid',
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
  name: 'Liquid',
  type: 'liquid',
  filePatterns: ['*.liquid'],
  capabilities: ['templating', 'shopify', 'accessibility'],
  priority: 1,
  factory: () => new LiquidAgent(),
  enabled: true,
});
