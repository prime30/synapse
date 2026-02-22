import type { ToolCall, ToolResult } from '@/lib/ai/types';
import type {
  AgentTask,
  AgentContext,
  AgentResult,
  CodeChange,
  FileContext,
  UserPreference,
  OrchestrationActivitySignal,
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
import type { SpecialistLifecycleEvent } from '../specialist-lifecycle';
import { createPlan, updatePlan, readPlanForAgent } from '@/lib/services/plans';
import type { Plan, ConflictResult } from '@/lib/services/plans';

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
  /** Structured specialist lifecycle events for coordinator state machine. */
  onSpecialistLifecycleEvent?: (event: SpecialistLifecycleEvent) => void;
  /** Structured orchestration activity signals for PM decisioning/telemetry. */
  onActivitySignal?: (signal: OrchestrationActivitySignal) => void;
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
      const specialistAgent = agentName as SpecialistName;
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
        const dispatchTs = Date.now();
        ctx.onSpecialistLifecycleEvent?.({
          type: 'dispatched',
          agent: specialistAgent,
          timestampMs: dispatchTs,
          details: { affectedFiles },
        });
        ctx.onActivitySignal?.({
          type: 'specialist_dispatched',
          agent: specialistAgent,
          timestampMs: dispatchTs,
          details: { affectedFiles },
        });
        const startTs = Date.now();
        ctx.onSpecialistLifecycleEvent?.({
          type: 'started',
          agent: specialistAgent,
          timestampMs: startTs,
          details: { task: task.slice(0, 300) },
        });
        ctx.onActivitySignal?.({
          type: 'specialist_started',
          agent: specialistAgent,
          timestampMs: startTs,
          details: { task: task.slice(0, 300) },
        });

        // EPIC 4a: Emit worker_progress start event
        ctx.onProgress?.({
          type: 'worker_progress',
          workerId: agentName,
          label: `${agentName} specialist`,
          status: 'running',
          metadata: { agentType: agentName, affectedFiles },
        });
        const specialist = createSpecialist(specialistAgent);
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
        const completeTs = Date.now();
        ctx.onSpecialistLifecycleEvent?.({
          type: 'completed',
          agent: specialistAgent,
          timestampMs: completeTs,
          details: { changesCount, success: result.success },
        });
        ctx.onActivitySignal?.({
          type: 'specialist_completed',
          agent: specialistAgent,
          timestampMs: completeTs,
          details: { changesCount, success: result.success },
        });

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
        const failTs = Date.now();
        ctx.onSpecialistLifecycleEvent?.({
          type: 'failed',
          agent: specialistAgent,
          timestampMs: failTs,
          details: { error: message },
        });
        ctx.onActivitySignal?.({
          type: 'specialist_failed',
          agent: specialistAgent,
          timestampMs: failTs,
          details: { error: message },
        });
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
        ctx.onActivitySignal?.({
          type: 'review_started',
          agent: 'review',
          timestampMs: Date.now(),
          details: { scope },
        });
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
        ctx.onActivitySignal?.({
          type: 'review_completed',
          agent: 'review',
          timestampMs: Date.now(),
          details: {
            approved: result.reviewResult?.approved ?? null,
            issues: result.reviewResult?.issues.length ?? null,
          },
        });

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

    // -- create_plan ---------------------------------------------------------
    case 'create_plan': {
      const name = String(toolCall.input.name ?? '');
      const content = String(toolCall.input.content ?? '');
      const rawTodos = Array.isArray(toolCall.input.todos) ? toolCall.input.todos : [];
      const todos = rawTodos.map((t: Record<string, unknown>) => ({
        content: String(t.content ?? ''),
        status: (t.status as 'pending' | 'in_progress' | 'completed') ?? undefined,
      }));

      if (!name || !content) {
        return {
          tool_use_id: toolCall.id,
          content: 'Missing required fields: name and content.',
          is_error: true,
        };
      }

      try {
        const plan = await createPlan(ctx.projectId, name, content, todos, ctx.userId);
        return {
          tool_use_id: toolCall.id,
          content: JSON.stringify({ planId: plan.id, version: plan.version }),
          planData: plan,
        } as ToolResult;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          tool_use_id: toolCall.id,
          content: truncate(`Failed to create plan: ${message}`),
          is_error: true,
        };
      }
    }

    // -- update_plan ---------------------------------------------------------
    case 'update_plan': {
      const planId = String(toolCall.input.planId ?? '');
      const expectedVersion = Number(toolCall.input.expectedVersion ?? -1);

      if (!planId || expectedVersion < 0) {
        return {
          tool_use_id: toolCall.id,
          content: 'Missing required fields: planId and expectedVersion.',
          is_error: true,
        };
      }

      const updates: { name?: string; content?: string; status?: Plan['status'] } = {};
      if (toolCall.input.name !== undefined) updates.name = String(toolCall.input.name);
      if (toolCall.input.content !== undefined) updates.content = String(toolCall.input.content);
      if (toolCall.input.status !== undefined) updates.status = String(toolCall.input.status) as Plan['status'];

      try {
        const result = await updatePlan(planId, updates, ctx.userId, expectedVersion);

        if (!result) {
          return {
            tool_use_id: toolCall.id,
            content: `Plan not found: ${planId}`,
            is_error: true,
          };
        }

        if ('conflict' in result) {
          const conflict = result as ConflictResult;
          return {
            tool_use_id: toolCall.id,
            content: `Version conflict: expected ${expectedVersion}, current is ${conflict.currentVersion}. Re-read the plan and retry.`,
            is_error: true,
          };
        }

        const plan = result as Plan;
        return {
          tool_use_id: toolCall.id,
          content: JSON.stringify({ planId: plan.id, version: plan.version }),
          planData: plan,
        } as ToolResult;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          tool_use_id: toolCall.id,
          content: truncate(`Failed to update plan: ${message}`),
          is_error: true,
        };
      }
    }

    // -- read_plan -----------------------------------------------------------
    case 'read_plan': {
      const planId = String(toolCall.input.planId ?? '');
      if (!planId) {
        return {
          tool_use_id: toolCall.id,
          content: 'Missing required field: planId.',
          is_error: true,
        };
      }

      try {
        const text = await readPlanForAgent(planId);
        if (!text) {
          return {
            tool_use_id: toolCall.id,
            content: `Plan not found: ${planId}`,
            is_error: true,
          };
        }
        return { tool_use_id: toolCall.id, content: truncate(text) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          tool_use_id: toolCall.id,
          content: truncate(`Failed to read plan: ${message}`),
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
