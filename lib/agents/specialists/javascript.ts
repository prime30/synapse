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
        return { agentType: 'javascript', success: true, changes: [] };
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
          agentType: 'javascript' as const,
          confidence: c.confidence ?? 0.8,
        };
      });

      // Aggregate confidence: average across all changes (fallback 0.8)
      const avgConfidence = changes.length > 0
        ? changes.reduce((sum, ch) => sum + (ch.confidence ?? 0.8), 0) / changes.length
        : 0.8;

      return { agentType: 'javascript', success: true, changes, confidence: avgConfidence };
    } catch {
      return { agentType: 'javascript', success: true, changes: [] };
    }
  }
}
