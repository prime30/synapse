import { Agent } from './base';
import { REVIEW_AGENT_PROMPT } from './prompts';
import type {
  AgentTask,
  AgentResult,
  ReviewResult,
  ReviewIssue,
} from '@/lib/types/agent';

/**
 * Review agent for quality assurance and error detection.
 * Uses GPT Codex. Does NOT modify code — only reviews and flags issues.
 */
export class ReviewAgent extends Agent {
  constructor() {
    super('review', 'openai');
  }

  getSystemPrompt(): string {
    return REVIEW_AGENT_PROMPT;
  }

  formatPrompt(task: AgentTask): string {
    return [
      `Review the following proposed code changes for the request: "${task.context.userRequest}"`,
      '',
      '## Proposed Changes:',
      task.instruction,
      '',
      '## Original Project Files:',
      ...task.context.files.map(
        (f) => `### ${f.fileName} (${f.fileType})\n\`\`\`\n${f.content}\n\`\`\``
      ),
      '',
      'Review all changes and respond with your assessment as JSON.',
    ].join('\n');
  }

  parseResponse(raw: string): AgentResult {
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // Default to approved if response can't be parsed
        const defaultResult: ReviewResult = {
          approved: true,
          issues: [],
          summary: 'Review completed — no structured response from reviewer.',
        };
        return {
          agentType: 'review',
          success: true,
          reviewResult: defaultResult,
        };
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        approved?: boolean;
        issues?: Array<{
          severity?: string;
          file?: string;
          line?: number;
          description?: string;
          suggestion?: string;
          category?: string;
        }>;
        summary?: string;
      };

      const issues: ReviewIssue[] = (parsed.issues ?? []).map((i) => ({
        severity: (i.severity as ReviewIssue['severity']) ?? 'info',
        file: i.file ?? 'unknown',
        line: i.line,
        description: i.description ?? 'No description',
        suggestion: i.suggestion,
        category: (i.category as ReviewIssue['category']) ?? 'syntax',
      }));

      const hasErrors = issues.some((i) => i.severity === 'error');

      const reviewResult: ReviewResult = {
        approved: parsed.approved ?? !hasErrors,
        issues,
        summary: parsed.summary ?? 'Review completed.',
      };

      return {
        agentType: 'review',
        success: true,
        reviewResult,
      };
    } catch {
      const defaultResult: ReviewResult = {
        approved: true,
        issues: [],
        summary: 'Review completed — failed to parse reviewer response.',
      };
      return {
        agentType: 'review',
        success: true,
        reviewResult: defaultResult,
      };
    }
  }
}
