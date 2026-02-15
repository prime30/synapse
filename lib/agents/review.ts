import { Agent } from './base';
import { REVIEW_AGENT_PROMPT } from './prompts';
import { AI_FEATURES } from '@/lib/ai/feature-flags';
import type {
  AgentTask,
  AgentResult,
  ReviewResult,
  ReviewIssue,
} from '@/lib/types/agent';
import { budgetFiles } from './specialists/prompt-budget';

/** JSON Schema for Review agent structured outputs. */
export const REVIEW_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['error', 'warning', 'info'] },
          file: { type: 'string' },
          line: { type: 'number' },
          description: { type: 'string' },
          suggestion: { type: 'string' },
          category: { type: 'string' },
        },
        required: ['severity', 'file', 'description'],
        additionalProperties: false,
      },
    },
    summary: { type: 'string' },
  },
  required: ['approved', 'issues', 'summary'],
  additionalProperties: false,
} as const;

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

  /**
   * Run Shopify-specific programmatic checks on project files.
   * Results are prepended to the review prompt so the LLM reviewer
   * has programmatic findings as additional context.
   */
  private runProgrammaticChecks(
    files: AgentTask['context']['files']
  ): string {
    const issues: string[] = [];

    for (const file of files) {
      if (file.fileType === 'liquid') {
        issues.push(...this.checkSchema(file));
        issues.push(...this.checkAssetOptimization(file));
        issues.push(...this.checkAccessibility(file));
      }
    }

    if (issues.length === 0) return '';
    return `## Automated Shopify Checks\n${issues.join('\n')}\n`;
  }

  private checkSchema(
    file: AgentTask['context']['files'][number]
  ): string[] {
    const issues: string[] = [];
    const schemaMatch = file.content.match(
      /\{%\s*schema\s*%\}([\s\S]*?)\{%\s*endschema\s*%\}/i
    );
    if (!schemaMatch) return issues;

    const schemaStr = schemaMatch[1].trim();
    let schema: Record<string, unknown>;

    try {
      schema = JSON.parse(schemaStr) as Record<string, unknown>;
    } catch {
      issues.push(`- [error] ${file.fileName}: Schema JSON is invalid`);
      return issues;
    }

    if (!schema.name) {
      issues.push(`- [warning] ${file.fileName}: Schema missing required \`name\` field`);
    }

    const blocks = schema.blocks as Array<{ type?: string; settings?: unknown[] }> | undefined;
    if (blocks && blocks.length > 0 && schema.max_blocks == null) {
      issues.push(
        `- [info] ${file.fileName}: Consider adding \`max_blocks\` to schema for sections with blocks`
      );
    }

    const checkSettingsHaveType = (settings: unknown[], context: string) => {
      const arr = Array.isArray(settings) ? settings : [];
      for (const s of arr) {
        const setting = s as Record<string, unknown>;
        if (!setting.type) {
          issues.push(
            `- [warning] ${file.fileName}: Setting in ${context} missing \`type\` property`
          );
        }
      }
    };
    checkSettingsHaveType(
      (schema.settings as unknown[]) ?? [],
      'root settings'
    );
    if (blocks) {
      for (const block of blocks) {
        checkSettingsHaveType(
          (block.settings as unknown[]) ?? [],
          `block "${block.type ?? 'unknown'}"`
        );
      }
    }

    // Template compatibility: section.settings.X and block.settings.X must exist in schema
    const templatePart = file.content.replace(schemaMatch[0], '');
    const sectionSettingsRefs = templatePart.matchAll(
      /section\.settings\.(\w+)/g
    );
    const rootSettingIds = new Set(
      ((schema.settings as Array<{ id?: string }>) ?? []).map((s) => s.id)
    );
    for (const m of sectionSettingsRefs) {
      const id = m[1];
      if (!rootSettingIds.has(id)) {
        issues.push(
          `- [warning] ${file.fileName}: Template references \`section.settings.${id}\` but it is not defined in schema`
        );
      }
    }
    const blockSettingsRefs = templatePart.matchAll(/block\.settings\.(\w+)/g);
    const allBlockSettingIds = new Set<string>();
    for (const block of blocks ?? []) {
      for (const s of (block.settings as Array<{ id?: string }>) ?? []) {
        if (s.id) allBlockSettingIds.add(s.id);
      }
    }
    for (const m of blockSettingsRefs) {
      const id = m[1];
      if (!allBlockSettingIds.has(id)) {
        issues.push(
          `- [warning] ${file.fileName}: Template references \`block.settings.${id}\` but it is not defined in any block schema`
        );
      }
    }

    return issues;
  }

  private checkAssetOptimization(
    file: AgentTask['context']['files'][number]
  ): string[] {
    const issues: string[] = [];
    const content = file.content;

    const imageUrlTags = content.match(
      /\{\{[^}]*\|[^}]*image_url[^}]*\}\}/g
    );
    if (imageUrlTags) {
      const hasAnyWithoutWidth = imageUrlTags.some(
        (tag) => !/width\s*:/i.test(tag)
      );
      if (hasAnyWithoutWidth) {
        issues.push(
          `- [warning] ${file.fileName}: \`image_url\` filter used without \`width:\` parameter`
        );
      }
    }

    let missingLoading = false;
    let missingWidthHeight = false;
    const imgTags = content.matchAll(/<img[\s\S]*?>/gi);
    for (const match of imgTags) {
      const tag = match[0];
      if (!/loading\s*=\s*["']?(?:lazy|eager)["']?/i.test(tag)) {
        missingLoading = true;
      }
      if (!/width\s*=/i.test(tag) || !/height\s*=/i.test(tag)) {
        missingWidthHeight = true;
      }
    }
    if (missingLoading) {
      issues.push(
        `- [warning] ${file.fileName}: <img> tag missing \`loading="lazy"\` or \`loading="eager"\``
      );
    }
    if (missingWidthHeight) {
      issues.push(
        `- [info] ${file.fileName}: <img> tag missing \`width\` and/or \`height\` attributes`
      );
    }

    return issues;
  }

  private checkAccessibility(
    file: AgentTask['context']['files'][number]
  ): string[] {
    const issues: string[] = [];
    const content = file.content;

    const imgTags = content.matchAll(/<img[\s\S]*?>/gi);
    for (const match of imgTags) {
      const tag = match[0];
      if (!/alt\s*=/i.test(tag)) {
        issues.push(
          `- [warning] ${file.fileName}: <img> tag missing \`alt\` attribute`
        );
      }
    }

    const inputCount = (content.match(/<input\b/gi) ?? []).length;
    const labelCount = (content.match(/<label\b/gi) ?? []).length;
    if (inputCount > 0 && inputCount > labelCount) {
      issues.push(
        `- [warning] ${file.fileName}: More <input> elements (${inputCount}) than <label> elements (${labelCount}) — ensure inputs have associated labels`
      );
    }

    const hasKeyframes = /@keyframes\s+\w+/.test(content);
    const hasAnimation = /animation\s*:/i.test(content);
    const hasTransition = /transition\s*:/i.test(content);
    const hasReducedMotion = /prefers-reduced-motion/i.test(content);
    if (
      (hasKeyframes || hasAnimation || hasTransition) &&
      !hasReducedMotion
    ) {
      issues.push(
        `- [warning] ${file.fileName}: CSS animations/transitions present without \`prefers-reduced-motion\` media query`
      );
    }

    return issues;
  }

  formatPrompt(task: AgentTask): string {
    // Budget files to 15k tokens for review context (leaves room for proposed changes in instruction)
    const budgeted = budgetFiles(task.context.files, 15_000);
    const programmaticSection = this.runProgrammaticChecks(budgeted);
    return [
      ...(programmaticSection ? [programmaticSection, ''] : []),
      `Review the following proposed code changes for the request: "${task.context.userRequest}"`,
      '',
      // Cross-file dependency context from REQ-5 context system
      ...(task.context.dependencyContext
        ? [task.context.dependencyContext, '']
        : []),
      // Live DOM context from Shopify preview bridge
      ...(task.context.domContext
        ? [task.context.domContext, '']
        : []),
      '## Proposed Changes:',
      task.instruction,
      '',
      '## Original Project Files:',
      ...budgeted.map(
        (f) => `### ${f.fileName} (${f.fileType})\n\`\`\`\n${f.content}\n\`\`\``
      ),
      '',
      'Review all changes and respond with your assessment as JSON.',
    ].join('\n');
  }

  parseResponse(raw: string): AgentResult {
    try {
      // Try direct parse first (structured outputs), fall back to regex
      let jsonString: string | null = null;
      if (AI_FEATURES.structuredOutputs) {
        try {
          JSON.parse(raw);
          jsonString = raw;
        } catch { /* fallthrough to regex */ }
      }
      if (!jsonString) {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        jsonString = jsonMatch?.[0] ?? null;
      }
      if (!jsonString) {
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

      const parsed = JSON.parse(jsonString) as {
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
