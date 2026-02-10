import { Agent } from './base';
import { PROJECT_MANAGER_PROMPT } from './prompts';
import { getThemeContext, THEME_STRUCTURE_DOC } from '@/lib/shopify/theme-structure';
import type {
  AgentTask,
  AgentResult,
  DelegationTask,
  LearnedPattern,
} from '@/lib/types/agent';

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

  formatPrompt(task: AgentTask): string {
    const fileList = task.context.files
      .map((f) => `- ${f.fileName} (${f.fileType}, ${f.content.length} chars)`)
      .join('\n');

    const prefs = task.context.userPreferences
      .map((p) => `- [${p.category}] ${p.key}: ${p.value}`)
      .join('\n');

    const themeFiles = task.context.files
      .filter((f) => f.path ?? f.fileName.includes('/'))
      .map((f) => ({ path: f.path ?? f.fileName }));
    const themeContext = getThemeContext(themeFiles);

    return [
      `User Request: ${task.instruction}`,
      '',
      '## Shopify Theme Structure:',
      THEME_STRUCTURE_DOC,
      themeContext.summary,
      '',
      '## Project Files:',
      fileList,
      '',
      '## User Preferences:',
      prefs || '(No preferences recorded yet)',
      '',
      '## Full File Contents:',
      ...task.context.files.map(
        (f) => `### ${f.fileName}\n\`\`\`${f.fileType}\n${f.content}\n\`\`\``
      ),
      '',
      'Analyze the request and respond with your delegation plan as JSON.',
    ].join('\n');
  }

  parseResponse(raw: string, _task: AgentTask): AgentResult {
    try {
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

      const parsed = JSON.parse(jsonMatch[0]) as {
        analysis?: string;
        delegations?: Array<{
          agent?: string;
          task?: string;
          affectedFiles?: string[];
        }>;
        learnedPatterns?: LearnedPattern[];
        standardizationOpportunities?: unknown[];
      };

      const delegations: DelegationTask[] = (parsed.delegations ?? [])
        .filter((d) => d.agent && d.task)
        .map((d) => ({
          agent: d.agent as DelegationTask['agent'],
          task: d.task!,
          affectedFiles: d.affectedFiles ?? [],
        }));

      return {
        agentType: 'project_manager',
        success: true,
        analysis: parsed.analysis ?? 'Analysis complete',
        delegations,
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
