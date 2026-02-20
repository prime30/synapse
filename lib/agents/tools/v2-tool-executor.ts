import type { ToolCall, ToolResult } from '@/lib/ai/types';
import type {
  AgentTask,
  AgentContext,
  AgentResult,
  CodeChange,
  FileContext,
  UserPreference,
} from '@/lib/types/agent';
import { CodexContextPackager } from '@/lib/context/packager';
import type { ProjectContext } from '@/lib/context/types';
import { LiquidAgent } from '../specialists/liquid';
import { JavaScriptAgent } from '../specialists/javascript';
import { CSSAgent } from '../specialists/css';
import { JSONAgent } from '../specialists/json';
import { ReviewAgent } from '../review';
import type { AgentExecuteOptions } from '../base';
import { Agent } from '../base';
import { getAIProvider } from '@/lib/ai/get-provider';
import { MODELS } from '../model-router';

// -- Types -------------------------------------------------------------------

const SECOND_OPINION_SYSTEM = `You are a critical second reviewer. Given a plan or refactor summary from another AI, provide a concise second opinion in 2–4 short paragraphs. Cover: (1) risks or edge cases, (2) alternative approaches if relevant, (3) concrete improvements. Be direct and constructive. Do not repeat the plan; only add value.`;

const VALID_SPECIALISTS = ['liquid', 'javascript', 'css', 'json'] as const;
type SpecialistName = (typeof VALID_SPECIALISTS)[number];

const MAX_RESULT_CHARS = 8_000;

export interface V2ToolExecutorContext {
  /** All project files (stubs + hydrated). */
  files: FileContext[];
  /** Project ID. */
  projectId: string;
  /** User ID. */
  userId: string;
  /** Execution ID for the current agent run. */
  executionId: string;
  /** User request text. */
  userRequest: string;
  /** User preferences. */
  userPreferences: UserPreference[];
  /** Accumulated code changes from the current session (used by run_review). */
  accumulatedChanges: CodeChange[];
  /** Callback to emit code changes to the UI (so specialist changes appear as diffs). */
  onCodeChange?: (change: CodeChange) => void;
  /** Reasoning chunk callback for streaming specialist thinking. */
  onReasoningChunk?: (agent: string, chunk: string) => void;
  /** Optional model override. */
  model?: string;
  /** Optional dependency context string. */
  dependencyContext?: string;
  /** Optional design context string. */
  designContext?: string;
  /** Optional memory context string. */
  memoryContext?: string;
  /** Progress callback for emitting worker_progress events. */
  onProgress?: (event: {
    type: string;
    phase?: string;
    label?: string;
    workerId?: string;
    status?: string;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  }) => void;
  /** Specialist call counter for rate limiting (shared mutable ref). */
  specialistCallCount?: { value: number };
  /** Routing tier for review model selection (Codex vs Opus by tier). */
  tier?: 'TRIVIAL' | 'SIMPLE' | 'COMPLEX' | 'ARCHITECTURAL';
}

// -- Helpers -----------------------------------------------------------------

function truncate(text: string, max: number = MAX_RESULT_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n... (truncated)';
}

/**
 * Scope files to those matching `affectedFiles` paths.
 * Uses `.endsWith` for partial-path matching.  If `affectedFiles` is empty
 * or undefined, all files are returned.
 */
function scopeFiles(allFiles: FileContext[], affectedFiles?: string[]): FileContext[] {
  if (!affectedFiles || affectedFiles.length === 0) return allFiles;

  return allFiles.filter((f) => {
    const name = f.fileName;
    const path = f.path ?? '';
    return affectedFiles.some(
      (af) => name === af || path === af || name.endsWith(af) || path.endsWith(af),
    );
  });
}

function createSpecialist(name: SpecialistName): Agent {
  const specialists: Record<SpecialistName, Agent> = {
    liquid: new LiquidAgent(),
    javascript: new JavaScriptAgent(),
    css: new CSSAgent(),
    json: new JSONAgent(),
  };
  return specialists[name];
}

/**
 * Format accumulated code changes into a readable diff summary that can be
 * included in the review agent's instruction prompt.
 */
export function formatChangesForReview(changes: CodeChange[]): string {
  if (changes.length === 0) return 'No changes to review.';

  const sections = changes.map((change, i) => {
    const header = `### Change ${i + 1}: ${change.fileName} (${change.agentType})`;
    const reasoning = change.reasoning ? `**Reasoning:** ${change.reasoning}` : '';

    let diff: string;
    if (change.patches && change.patches.length > 0) {
      diff = change.patches
        .map(
          (p, j) =>
            `**Patch ${j + 1}:**\n` +
            '```diff\n' +
            `- ${p.search.split('\n').join('\n- ')}\n` +
            `+ ${p.replace.split('\n').join('\n+ ')}\n` +
            '```',
        )
        .join('\n\n');
    } else {
      const originalLines = (change.originalContent ?? '').split('\n');
      const proposedLines = (change.proposedContent ?? '').split('\n');

      const diffLines: string[] = [];
      const maxLen = Math.max(originalLines.length, proposedLines.length);
      for (let j = 0; j < maxLen; j++) {
        const orig = originalLines[j];
        const prop = proposedLines[j];
        if (orig === prop) {
          diffLines.push(`  ${orig ?? ''}`);
        } else {
          if (orig !== undefined) diffLines.push(`- ${orig}`);
          if (prop !== undefined) diffLines.push(`+ ${prop}`);
        }
      }
      diff = '```diff\n' + diffLines.join('\n') + '\n```';
    }

    return [header, reasoning, diff].filter(Boolean).join('\n');
  });

  return sections.join('\n\n---\n\n');
}

// -- Main executor -----------------------------------------------------------

/**
 * Execute a v2 tool call (`run_specialist` or `run_review`) and return
 * a ToolResult.  Wraps specialist and review agents inline during the
 * coordinator streaming loop.
 */
export async function executeV2Tool(
  toolCall: ToolCall,
  ctx: V2ToolExecutorContext,
): Promise<ToolResult> {
  switch (toolCall.name) {
    // -- run_specialist ------------------------------------------------------
    case 'run_specialist': {
      const agentName = String(toolCall.input.agent ?? '');
      const task = String(toolCall.input.task ?? '');
      const affectedFiles = Array.isArray(toolCall.input.affectedFiles)
        ? (toolCall.input.affectedFiles as string[]).map(String)
        : [];

      if (!VALID_SPECIALISTS.includes(agentName as SpecialistName)) {
        return {
          tool_use_id: toolCall.id,
          content: `Invalid specialist "${agentName}". Must be one of: ${VALID_SPECIALISTS.join(', ')}`,
          is_error: true,
        };
      }

      // EPIC 4b: Per-request specialist rate limit
      const MAX_SPECIALIST_CALLS = 8;
      if (ctx.specialistCallCount) {
        if (ctx.specialistCallCount.value >= MAX_SPECIALIST_CALLS) {
          return {
            tool_use_id: toolCall.id,
            content: 'Specialist call limit reached (8). Complete remaining edits directly.',
            is_error: true,
          };
        }
        ctx.specialistCallCount.value++;
      }

      try {
        console.log(
          `[V2ToolExecutor] Running specialist "${agentName}" -- task: ${task.slice(0, 120)}`,
        );

        // EPIC 4a: Emit worker_progress start event
        ctx.onProgress?.({
          type: 'worker_progress',
          workerId: agentName,
          label: `${agentName} specialist`,
          status: 'running',
          metadata: { agentType: agentName, affectedFiles },
        });

        const specialist = createSpecialist(agentName as SpecialistName);
        const scopedFiles = scopeFiles(ctx.files, affectedFiles);

        const agentContext: AgentContext = {
          executionId: ctx.executionId,
          projectId: ctx.projectId,
          userId: ctx.userId,
          userRequest: ctx.userRequest,
          files: scopedFiles,
          userPreferences: ctx.userPreferences,
          dependencyContext: ctx.dependencyContext,
          designContext: ctx.designContext,
          memoryContext: ctx.memoryContext,
        };

        const agentTask: AgentTask = {
          executionId: ctx.executionId,
          instruction: task,
          context: agentContext,
        };

        const executeOptions: AgentExecuteOptions = {
          action: 'generate',
          ...(ctx.model ? { model: ctx.model } : {}),
          ...(ctx.onReasoningChunk
            ? { onReasoningChunk: (chunk: string) => ctx.onReasoningChunk!(agentName, chunk) }
            : {}),
        };

        const result: AgentResult = await specialist.execute(agentTask, executeOptions);

        if (result.changes && result.changes.length > 0) {
          for (const change of result.changes) {
            ctx.onCodeChange?.(change);
          }
        }

        const changesCount = result.changes?.length ?? 0;
        const analysisBrief = result.analysis
          ? ` ${result.analysis.slice(0, 300)}`
          : '';

        const summary = truncate(
          `Specialist ${agentName} completed: ${changesCount} file(s) changed.${analysisBrief}`,
        );

        // EPIC 4a: Emit worker_progress complete event
        ctx.onProgress?.({
          type: 'worker_progress',
          workerId: agentName,
          label: `${agentName} specialist`,
          status: 'complete',
          metadata: { agentType: agentName, changesCount, success: result.success },
        });

        console.log(
          `[V2ToolExecutor] Specialist "${agentName}" done -- ${changesCount} change(s), success=${result.success}`,
        );

        return { tool_use_id: toolCall.id, content: summary };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[V2ToolExecutor] Specialist "${agentName}" failed:`, message);
        return {
          tool_use_id: toolCall.id,
          content: truncate(`Specialist failed: ${message}`),
          is_error: true,
        };
      }
    }

    // -- run_review ----------------------------------------------------------
    case 'run_review': {
      const scope = String(toolCall.input.scope ?? 'all');

      if (ctx.accumulatedChanges.length === 0) {
        return {
          tool_use_id: toolCall.id,
          content: 'No changes to review.',
        };
      }

      try {
        const changesToReview =
          scope === 'all'
            ? ctx.accumulatedChanges
            : ctx.accumulatedChanges.filter((c) => c.agentType === scope);

        if (changesToReview.length === 0) {
          return {
            tool_use_id: toolCall.id,
            content: `No changes matching scope "${scope}" to review.`,
          };
        }

        console.log(
          `[V2ToolExecutor] Running review -- ${changesToReview.length} change(s), scope="${scope}"`,
        );

        // Use Codex packager (same as v1 coordinator) for review context when we have proposed changes
        const proposedChanges = changesToReview.map((c) => ({
          fileId: c.fileId,
          fileName: c.fileName,
          originalContent: c.originalContent ?? '',
          proposedContent: c.proposedContent ?? '',
          agentType: c.agentType,
        }));
        const projectContext: ProjectContext = {
          projectId: ctx.projectId,
          files: ctx.files.map((f) => ({
            fileId: f.fileId,
            fileName: f.fileName,
            fileType: f.fileType,
            content: f.content,
            sizeBytes: (f.content ?? '').length,
            lastModified: new Date(),
            dependencies: { imports: [], exports: [], usedBy: [] },
          })),
          dependencies: [],
          loadedAt: new Date(),
          totalSizeBytes: ctx.files.reduce((sum, f) => sum + (f.content?.length ?? 0), 0),
        };
        const codexPackager = new CodexContextPackager();
        const codexReviewContent = codexPackager.packageForReview(projectContext, proposedChanges);

        const reviewInstruction = [
          `Review the following ${changesToReview.length} code change(s) for quality, correctness, and Shopify theme best practices.`,
          '',
          `User request: ${ctx.userRequest}`,
          '',
          codexReviewContent,
        ].join('\n');

        const reviewer = new ReviewAgent();

        const reviewContext: AgentContext = {
          executionId: ctx.executionId,
          projectId: ctx.projectId,
          userId: ctx.userId,
          userRequest: ctx.userRequest,
          files: ctx.files,
          userPreferences: ctx.userPreferences,
        };

        const reviewTask: AgentTask = {
          executionId: ctx.executionId,
          instruction: reviewInstruction,
          context: reviewContext,
        };

        const reviewOptions: AgentExecuteOptions = {
          action: 'review',
          ...(ctx.model ? { model: ctx.model } : {}),
          ...(ctx.tier ? { tier: ctx.tier } : {}),
        };

        const result: AgentResult = await reviewer.execute(reviewTask, reviewOptions);

        let summary: string;
        if (result.reviewResult) {
          const { approved, issues, summary: reviewSummary } = result.reviewResult;
          const issueLines = issues
            .map((issue) => `- [${issue.severity}] ${issue.file}: ${issue.description}`)
            .join('\n');
          summary = [
            `Review ${approved ? 'APPROVED' : 'NEEDS CHANGES'}`,
            reviewSummary,
            issues.length > 0 ? `\nIssues (${issues.length}):\n${issueLines}` : '',
          ]
            .filter(Boolean)
            .join('\n');
        } else {
          summary = result.analysis ?? 'Review completed (no structured result).';
        }

        console.log(
          `[V2ToolExecutor] Review done -- approved=${result.reviewResult?.approved ?? 'N/A'}`,
        );

        return { tool_use_id: toolCall.id, content: truncate(summary) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[V2ToolExecutor] Review failed:', message);
        return {
          tool_use_id: toolCall.id,
          content: truncate(`Review failed: ${message}`),
          is_error: true,
        };
      }
    }

    // -- get_second_opinion ---------------------------------------------------
    case 'get_second_opinion': {
      const content = String(toolCall.input.content ?? '').trim();
      if (!content) {
        return {
          tool_use_id: toolCall.id,
          content: 'No content provided for second opinion.',
          is_error: true,
        };
      }
      try {
        const provider = getAIProvider('openai');
        const result = await provider.complete(
          [
            { role: 'system', content: SECOND_OPINION_SYSTEM },
            { role: 'user', content: `User request context: ${ctx.userRequest}\n\nContent to review:\n${content}` },
          ],
          { model: MODELS.GPT_4O, maxTokens: 1024 },
        );
        return {
          tool_use_id: toolCall.id,
          content: truncate(result.content ?? 'No response.'),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[V2ToolExecutor] get_second_opinion failed:', message);
        return {
          tool_use_id: toolCall.id,
          content: truncate(`Second opinion failed: ${message}`),
          is_error: true,
        };
      }
    }

    // -- Unknown tool --------------------------------------------------------
    default:
      return {
        tool_use_id: toolCall.id,
        content: `Unknown v2 tool: ${toolCall.name}`,
        is_error: true,
      };
  }
}
