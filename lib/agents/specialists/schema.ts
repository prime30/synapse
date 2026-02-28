import { Agent } from '../base';
import { SCHEMA_AGENT_PROMPT } from '../prompts';
import { AI_FEATURES } from '@/lib/ai/feature-flags';
import type { AgentTask, AgentResult, CodeChange, CodePatch } from '@/lib/types/agent';
import { applyPatches } from '@/lib/types/agent';
import { budgetFiles } from './prompt-budget';
import { analyzeSchemaNeeds } from '../tools/schema-planner';

/**
 * Schema specialist agent.
 * Designs and writes {% schema %} JSON for Shopify sections and blocks.
 * Analyzes Liquid code to determine required settings, blocks, and presets.
 */
export class SchemaAgent extends Agent {
  constructor() {
    super('schema', 'anthropic');
  }

  getSystemPrompt(): string {
    return SCHEMA_AGENT_PROMPT;
  }

  formatPrompt(task: AgentTask): string {
    const budgeted = budgetFiles(task.context.files, 35_000);
    const liquidFiles = budgeted.filter(
      (f) => f.fileType === 'liquid'
    );
    const otherFiles = budgeted.filter(
      (f) => f.fileType !== 'liquid'
    );

    const schemaAnalyses = liquidFiles
      .map((f) => {
        try {
          const analysis = analyzeSchemaNeeds(f.content);
          const parts: string[] = [];

          if (analysis.sectionSettings.length > 0) {
            parts.push(`section.settings: ${analysis.sectionSettings.join(', ')}`);
          }

          for (const [blockType, settings] of analysis.blockSettings) {
            parts.push(`block[${blockType}].settings: ${settings.join(', ')}`);
          }

          parts.push(analysis.hasSchema ? 'has existing {% schema %}' : 'no {% schema %} found');

          return parts.length > 0
            ? `${f.fileName}: ${parts.join(' | ')}`
            : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return [
      `Task: ${task.instruction}`,
      '',
      ...(task.context.dependencyContext
        ? [task.context.dependencyContext, '']
        : []),
      ...(task.context.designContext
        ? [task.context.designContext, '']
        : []),
      ...(task.context.domContext
        ? [task.context.domContext, '']
        : []),
      ...(schemaAnalyses.length > 0
        ? ['## Schema Analysis (auto-detected settings references):', ...schemaAnalyses, '']
        : []),
      '## Liquid Files (you may modify the {% schema %} in these):',
      ...liquidFiles.map(
        (f) => `### ${f.fileName}\n\`\`\`liquid\n${f.content}\n\`\`\``
      ),
      '',
      '## Other Files (read-only context):',
      ...otherFiles.map(
        (f) => `### ${f.fileName} (${f.fileType})\n\`\`\`\n${f.content}\n\`\`\``
      ),
      '',
      'EDITING STRATEGY: Use read_file or read_lines to see exact content, then edit_lines to make changes by line number. Do NOT use search_replace.',
    ].join('\n');
  }

  parseResponse(raw: string, _task: AgentTask): AgentResult {
    try {
      let jsonString: string | null = null;
      if (AI_FEATURES.structuredOutputs) {
        try { JSON.parse(raw); jsonString = raw; } catch { /* fallthrough */ }
      }
      if (!jsonString) {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        jsonString = jsonMatch?.[0] ?? null;
      }
      if (!jsonString) {
        return { agentType: 'schema', success: true, changes: [] };
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
          agentType: 'schema' as const,
          confidence: c.confidence ?? 0.8,
        };
      });

      const avgConfidence = changes.length > 0
        ? changes.reduce((sum, ch) => sum + (ch.confidence ?? 0.8), 0) / changes.length
        : 0.8;

      return { agentType: 'schema', success: true, changes, confidence: avgConfidence };
    } catch {
      return { agentType: 'schema', success: true, changes: [] };
    }
  }
}

// EPIC C: Self-register with the agent registry
import { getAgentRegistry } from '../registry';
getAgentRegistry().register({
  name: 'Schema',
  type: 'schema',
  filePatterns: ['*.liquid'],
  capabilities: ['schema', 'shopify', 'settings', 'blocks'],
  priority: 4,
  factory: () => new SchemaAgent(),
  enabled: true,
});
