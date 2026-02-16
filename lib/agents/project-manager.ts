import { Agent } from './base';
import { PROJECT_MANAGER_PROMPT, SOLO_PM_PROMPT, PM_PROMPT_LIGHTWEIGHT } from './prompts';
import { getThemeContext, THEME_STRUCTURE_DOC } from '@/lib/shopify/theme-structure';
import { detectWorkflow, getWorkflowDelegationHint } from './workflows/shopify-workflows';
import { AI_FEATURES } from '@/lib/ai/feature-flags';
import type {
  AgentTask,
  AgentResult,
  DelegationTask,
  CodeChange,
  LearnedPattern,
} from '@/lib/types/agent';

/** JSON Schema for PM structured outputs (Anthropic output_config). */
export const PM_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    analysis: { type: 'string' },
    needsClarification: { type: 'boolean' },
    clarificationQuestion: { type: 'string' },
    routing: {
      type: 'object',
      properties: {
        decision: { type: 'string', enum: ['self_handle', 'delegate', 'hybrid'] },
        selfAssessedTier: { type: 'string', enum: ['TRIVIAL', 'SIMPLE', 'COMPLEX', 'ARCHITECTURAL'] },
      },
      additionalProperties: false,
    },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fileId: { type: 'string' },
          fileName: { type: 'string' },
          originalContent: { type: 'string' },
          proposedContent: { type: 'string' },
          reasoning: { type: 'string' },
        },
        required: ['fileId', 'fileName', 'originalContent', 'proposedContent', 'reasoning'],
        additionalProperties: false,
      },
      description: 'Direct changes for files the PM can handle itself',
    },
    delegations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          agent: { type: 'string', enum: ['liquid', 'javascript', 'css', 'json'] },
          task: { type: 'string' },
          affectedFiles: { type: 'array', items: { type: 'string' } },
        },
        required: ['agent', 'task', 'affectedFiles'],
        additionalProperties: false,
      },
    },
    referencedFiles: { type: 'array', items: { type: 'string' } },
  },
  required: ['analysis', 'needsClarification', 'delegations', 'referencedFiles'],
  additionalProperties: false,
} as const;

/**
 * Project Manager agent.
 * Analyzes user requests, delegates to specialists, learns patterns.
 * Uses Claude Opus 4.6. Does NOT modify code directly.
 */
export class ProjectManagerAgent extends Agent {
  constructor() {
    super('project_manager', 'anthropic');
  }

  getSystemPrompt(): string {
    return PROJECT_MANAGER_PROMPT;
  }

  getSoloSystemPrompt(): string {
    return SOLO_PM_PROMPT;
  }

  getLightweightSystemPrompt(): string {
    return PM_PROMPT_LIGHTWEIGHT;
  }

  /**
   * Format a lightweight prompt for TRIVIAL-tier requests.
   * Includes only the files and essentials — no dependency context,
   * workflow hints, or theme structure docs.
   */
  formatLightweightPrompt(task: AgentTask): string {
    const selectedFiles = task.context.files.filter(f => !f.content.startsWith('['));
    const stubCount = task.context.files.length - selectedFiles.length;

    const fileList = [
      `Files in context (${selectedFiles.length}):`,
      ...selectedFiles.map(f => `- ${f.fileName} (${f.fileType})`),
      stubCount > 0 ? `\n${stubCount} other files available but not loaded. Open tabs and pinned files are always in the list above — do not ask the user to open a file that is already listed.` : '',
    ].filter(Boolean).join('\n');

    return [
      `User Request: ${task.instruction}`,
      '',
      '## Files:',
      fileList,
      '',
      ...(task.context.designContext
        ? ['## Design Tokens:', task.context.designContext.slice(0, 2000), '']
        : []),
      '## File Contents:',
      ...selectedFiles.map(
        (f) => `### ${f.fileName}\n\`\`\`${f.fileType}\n${f.content}\n\`\`\``
      ),
      '',
      'Respond with your changes as JSON.',
    ].join('\n');
  }

  formatPrompt(task: AgentTask): string {
    // Compact manifest: only detail selected (non-stub) files, summarize the rest
    const selectedFiles = task.context.files.filter(f => !f.content.startsWith('['));
    const stubCount = task.context.files.length - selectedFiles.length;
    const fileList = [
      `Selected files (${selectedFiles.length}):`,
      ...selectedFiles.map(f => `- ${f.fileName} (${f.fileType}, ${f.content.length} chars)`),
      '',
      stubCount > 0
        ? `${stubCount} other theme files available (not loaded). Open tabs and pinned files are always in the selected set above — do not ask the user to open a file that is already listed there.`
        : '',
    ].filter(Boolean).join('\n');

    const prefs = task.context.userPreferences
      .map((p) => `- [${p.category}] ${p.key}: ${p.value}`)
      .join('\n');

    const themeFiles = task.context.files
      .filter((f) => f.path ?? f.fileName.includes('/'))
      .map((f) => ({ path: f.path ?? f.fileName }));
    const themeContext = getThemeContext(themeFiles);

    // Detect Shopify workflow pattern for optimized delegation
    const workflow = detectWorkflow(task.instruction);
    const workflowHint = workflow ? getWorkflowDelegationHint(workflow) : '';

    return [
      `User Request: ${task.instruction}`,
      '',
      '## Shopify Theme Structure:',
      THEME_STRUCTURE_DOC,
      themeContext.summary,
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
      // Developer memory (conventions, decisions, preferences)
      ...(task.context.memoryContext
        ? [task.context.memoryContext, '']
        : []),
      '## Project Files:',
      fileList,
      '',
      '## User Preferences:',
      prefs || '(No preferences recorded yet)',
      '',
      ...(workflowHint ? ['## Workflow Pattern Detected', workflowHint, ''] : []),
      '## Full File Contents (selected files):',
      ...task.context.files
        .filter((f) => !f.content.startsWith('['))
        .map(
          (f) => `### ${f.fileName}\n\`\`\`${f.fileType}\n${f.content}\n\`\`\``
        ),
      '',
      'Analyze the request and respond with your delegation plan as JSON.',
    ].join('\n');
  }

  /**
   * Format prompt for solo mode — single-pass code generation.
   * Uses SOLO_PM_PROMPT instead of PROJECT_MANAGER_PROMPT.
   */
  formatSoloPrompt(task: AgentTask): string {
    // Compact manifest: only detail selected (non-stub) files, summarize the rest
    const selectedFiles = task.context.files.filter(f => !f.content.startsWith('['));
    const stubCount = task.context.files.length - selectedFiles.length;
    const fileList = [
      `Selected files (${selectedFiles.length}):`,
      ...selectedFiles.map(f => `- ${f.fileName} (${f.fileType}, ${f.content.length} chars)`),
      '',
      stubCount > 0
        ? `${stubCount} other theme files available (not loaded). Open tabs and pinned files are always in the selected set above — do not ask the user to open a file that is already listed there.`
        : '',
    ].filter(Boolean).join('\n');

    const prefs = task.context.userPreferences
      .map((p) => `- [${p.category}] ${p.key}: ${p.value}`)
      .join('\n');

    const themeFiles = task.context.files
      .filter((f) => f.path ?? f.fileName.includes('/'))
      .map((f) => ({ path: f.path ?? f.fileName }));
    const themeContext = getThemeContext(themeFiles);

    // Detect Shopify workflow pattern for optimized delegation
    const workflow = detectWorkflow(task.instruction);
    const workflowHint = workflow ? getWorkflowDelegationHint(workflow) : '';

    return [
      `User Request: ${task.instruction}`,
      '',
      '## Shopify Theme Structure:',
      THEME_STRUCTURE_DOC,
      themeContext.summary,
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
      // Developer memory (conventions, decisions, preferences)
      ...(task.context.memoryContext
        ? [task.context.memoryContext, '']
        : []),
      '## Project Files:',
      fileList,
      '',
      '## User Preferences:',
      prefs || '(No preferences recorded yet)',
      '',
      ...(workflowHint ? ['## Workflow Pattern Detected', workflowHint, ''] : []),
      '## Full File Contents (selected files):',
      ...task.context.files
        .filter((f) => !f.content.startsWith('['))
        .map(
          (f) => `### ${f.fileName}\n\`\`\`${f.fileType}\n${f.content}\n\`\`\``
        ),
      '',
      'Analyze the request and respond with your changes as JSON. Include a referencedFiles array listing all files you examined.',
    ].join('\n');
  }

  parseResponse(raw: string, _task: AgentTask): AgentResult {
    try {
      // When structured outputs is enabled, the response should be clean JSON.
      // Try direct parse first, fall back to regex extraction for non-Anthropic or fallback.
      let jsonString: string;
      if (AI_FEATURES.structuredOutputs) {
        try {
          JSON.parse(raw); // validate
          jsonString = raw;
        } catch {
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('No JSON found');
          jsonString = jsonMatch[0];
        }
      } else {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          return {
            agentType: 'project_manager',
            success: false,
            analysis: 'Failed to parse PM response',
            error: {
              code: 'PARSE_ERROR',
              message: 'Could not extract JSON from PM response',
              agentType: 'project_manager',
              recoverable: true,
            },
          };
        }
        jsonString = jsonMatch[0];
      }

      const parsed = JSON.parse(jsonString) as {
        analysis?: string;
        needsClarification?: boolean;
        clarificationQuestion?: string;
        routing?: {
          decision?: string;
          selfAssessedTier?: string;
        };
        changes?: Array<{
          fileId?: string;
          fileName?: string;
          originalContent?: string;
          proposedContent?: string;
          reasoning?: string;
        }>;
        delegations?: Array<{
          agent?: string;
          task?: string;
          affectedFiles?: string[];
        }>;
        learnedPatterns?: LearnedPattern[];
        standardizationOpportunities?: unknown[];
        referencedFiles?: string[];
        selfReview?: {
          approved?: boolean;
          issues?: unknown[];
          summary?: string;
        };
      };

      // Extract direct changes (from solo/hybrid mode)
      const changes: CodeChange[] = (parsed.changes ?? [])
        .filter((c) => c.fileId && c.fileName && c.proposedContent)
        .map((c) => ({
          fileId: c.fileId!,
          fileName: c.fileName!,
          originalContent: c.originalContent ?? '',
          proposedContent: c.proposedContent!,
          reasoning: c.reasoning ?? 'PM direct change',
          agentType: 'project_manager' as const,
        }));

      const delegations: DelegationTask[] = (parsed.delegations ?? [])
        .filter((d) => d.agent && d.task)
        .map((d) => ({
          agent: d.agent as DelegationTask['agent'],
          task: d.task!,
          affectedFiles: d.affectedFiles ?? [],
        }));

      const referencedFiles = parsed.referencedFiles ?? [];
      const analysisWithRefs =
        referencedFiles.length > 0
          ? `${parsed.analysis ?? 'Analysis complete'}\n\nReferenced files: ${referencedFiles.join(', ')}`
          : parsed.analysis ?? 'Analysis complete';

      // Extract PM self-assessed tier (for tier escalation)
      const selfAssessedTier = parsed.routing?.selfAssessedTier;

      return {
        agentType: 'project_manager',
        success: true,
        analysis: parsed.needsClarification
          ? (parsed.clarificationQuestion || analysisWithRefs)
          : analysisWithRefs,
        changes: changes.length > 0 ? changes : undefined,
        delegations,
        needsClarification: parsed.needsClarification ?? false,
        selfAssessedTier,
      };
    } catch {
      return {
        agentType: 'project_manager',
        success: false,
        analysis: 'Failed to parse PM response',
        error: {
          code: 'PARSE_ERROR',
          message: 'Invalid JSON in PM response',
          agentType: 'project_manager',
          recoverable: true,
        },
      };
    }
  }

  /** Synthesize specialist results into a cohesive summary */
  synthesizeResults(specialistResults: AgentResult[]): string {
    const sections: string[] = [];

    for (const result of specialistResults) {
      if (result.changes?.length) {
        sections.push(
          `**${result.agentType}**: ${result.changes.length} change(s) proposed`
        );
        for (const change of result.changes) {
          sections.push(`  - ${change.fileName}: ${change.reasoning}`);
        }
      }
    }

    return sections.length
      ? `## Proposed Changes Summary\n\n${sections.join('\n')}`
      : 'No changes were proposed by the specialists.';
  }
}
