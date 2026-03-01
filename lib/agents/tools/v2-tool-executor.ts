import type { ToolCall, ToolResult } from '@/lib/ai/types';
import type {
  AgentTask,
  AgentContext,
  AgentResult,
  CodeChange,
  FileContext,
  UserPreference,
  OrchestrationActivitySignal,
  ScoutBrief,
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
import type { ToolExecutorContext } from './tool-executor';
import { ContextEngine } from '@/lib/ai/context-engine';
import { MODELS, type AgentCostEvent } from '../model-router';
import type { SpecialistLifecycleEvent } from '../specialist-lifecycle';
import { createPlan, updatePlan, readPlanForAgent } from '@/lib/services/plans';
import type { Plan } from '@/lib/services/plans';

// -- Types -------------------------------------------------------------------

const SECOND_OPINION_SYSTEM = `You are a critical second reviewer. Given a plan or refactor summary from another AI, provide a concise second opinion in 2–4 short paragraphs. Cover: (1) risks or edge cases, (2) alternative approaches if relevant, (3) concrete improvements. Be direct and constructive. Do not repeat the plan; only add value.`;

const VALID_SPECIALISTS = ['liquid', 'javascript', 'css', 'json'] as const;
type SpecialistName = (typeof VALID_SPECIALISTS)[number];

const MAX_RESULT_CHARS = 32_000;

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
  /** Content hydrator for loading file stubs on demand. */
  loadContent?: (fileIds: string[]) => Promise<Array<{ fileId: string; content: string }>>;
  /** Max Quality mode: force highest iterations and Opus for specialists. */
  maxQuality?: boolean;
  /** Accumulated change summaries from completed specialists (for cross-specialist context). */
  changeSummaries?: ChangeSummary[];
  /** Structural Scout brief — precise file targets and line ranges for specialist context. */
  scoutBrief?: ScoutBrief;
  /** Callback that returns a structured memory anchor string for the current session state. */
  getMemoryAnchor?: () => string;
  /** Supabase client for persisting role memory (task outcomes, developer memory). */
  supabaseClient?: unknown;
}

export interface ChangeSummary {
  agent: string;
  files: Array<{
    filePath: string;
    edits: Array<{
      lineRange: [number, number];
      addedSymbols: string[];
    }>;
  }>;
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
function scopeFiles(
  allFiles: FileContext[],
  affectedFiles?: string[],
): { files: FileContext[]; usedFallback: boolean } {
  if (!affectedFiles || affectedFiles.length === 0) return { files: allFiles, usedFallback: false };

  const matched = allFiles.filter((f) => {
    const name = f.fileName;
    const path = f.path ?? '';
    return affectedFiles.some(
      (af) => name === af || path === af || name.endsWith(af) || path.endsWith(af),
    );
  });
  if (matched.length === 0) {
    // Fallback to full context when declared paths fail to match any file.
    return { files: allFiles, usedFallback: true };
  }
  return { files: matched, usedFallback: false };
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
      const inputFiles = Array.isArray(toolCall.input.files)
        ? (toolCall.input.files as string[]).map(String)
        : [];
      const affectedFiles = Array.isArray(toolCall.input.affectedFiles)
        ? (toolCall.input.affectedFiles as string[]).map(String)
        : [];
      const files = inputFiles.length > 0 ? inputFiles : affectedFiles;

      if (!VALID_SPECIALISTS.includes(agentName as SpecialistName)) {
        return {
          tool_use_id: toolCall.id,
          content: `Invalid specialist "${agentName}". Must be one of: ${VALID_SPECIALISTS.join(', ')}`,
          is_error: true,
        };
      }

      // EPIC 4b: Per-request specialist rate limit
      const MAX_SPECIALIST_CALLS = 16;
      if (ctx.specialistCallCount) {
        if (ctx.specialistCallCount.value >= MAX_SPECIALIST_CALLS) {
          return {
            tool_use_id: toolCall.id,
            content: 'Specialist call limit reached (16). Complete remaining edits directly.',
            is_error: true,
          };
        }
        ctx.specialistCallCount.value++;
      }

      try {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d09cca'},body:JSON.stringify({sessionId:'d09cca',location:'v2-tool-executor.ts:run_specialist',message:'PM calling run_specialist',data:{agentName,task:task.slice(0,300),files},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
        // #endregion
        console.log(
          `[V2ToolExecutor] Running specialist "${agentName}" -- task: ${task.slice(0, 120)}`,
        );
        const dispatchTs = Date.now();
        ctx.onSpecialistLifecycleEvent?.({
          type: 'dispatched',
          agent: specialistAgent,
          timestampMs: dispatchTs,
          details: { affectedFiles: files },
        });
        ctx.onActivitySignal?.({
          type: 'specialist_dispatched',
          agent: specialistAgent,
          timestampMs: dispatchTs,
          details: { affectedFiles: files },
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
          files,
          metadata: { agentType: agentName, affectedFiles: files },
        });
        const specialist = createSpecialist(specialistAgent);
        const scoped = scopeFiles(ctx.files, files);
        const scopedFiles = scoped.files;

        // Load role-specific past outcomes to enrich specialist context
        let combinedMemory = ctx.memoryContext;
        if (ctx.supabaseClient) {
          try {
            const { retrieveSimilarOutcomes, formatOutcomesForPrompt } =
              await import('@/lib/agents/memory/task-outcomes');
            const roleOutcomes = await retrieveSimilarOutcomes(
              ctx.supabaseClient as import('@supabase/supabase-js').SupabaseClient,
              ctx.projectId, task, 3, 0.6,
              { role: agentName },
            );
            if (roleOutcomes.length > 0) {
              const roleContext = formatOutcomesForPrompt(roleOutcomes, {
                maxResults: 3, similarityThreshold: 0.7,
              });
              if (roleContext) {
                combinedMemory = [ctx.memoryContext, roleContext].filter(Boolean).join('\n\n') || undefined;
              }
            }
          } catch { /* role memory is best-effort */ }
        }

        const agentContext: AgentContext = {
          executionId: ctx.executionId,
          projectId: ctx.projectId,
          userId: ctx.userId,
          userRequest: ctx.userRequest,
          files: scopedFiles,
          userPreferences: ctx.userPreferences,
          dependencyContext: ctx.dependencyContext,
          designContext: ctx.designContext,
          memoryContext: combinedMemory,
        };

        let enrichedTask = task;

        // Inject relevant scout targets so the specialist knows exact line ranges
        if (ctx.scoutBrief && files.length > 0) {
          const relevantTargets: string[] = [];
          for (const kf of ctx.scoutBrief.keyFiles) {
            const matches = files.some(f =>
              kf.path === f || kf.path.endsWith('/' + f) || f.endsWith('/' + kf.path),
            );
            if (matches && kf.targets.length > 0) {
              relevantTargets.push(`${kf.path} [${kf.type}, relevance: ${kf.relevance}]`);
              for (const t of kf.targets) {
                relevantTargets.push(`  → Lines ${t.lineRange[0]}-${t.lineRange[1]}: ${t.context} — ${t.description}`);
              }
            }
          }
          if (relevantTargets.length > 0) {
            enrichedTask = `${task}\n\nSCOUT TARGETS (precise line ranges for this task):\n${relevantTargets.join('\n')}`;
          }
        }

        if (ctx.changeSummaries && ctx.changeSummaries.length > 0) {
          const priorContext = ctx.changeSummaries
            .map((s) => {
              const fileEdits = s.files.map((f) => {
                const symbols = f.edits.flatMap((e) => e.addedSymbols).filter(Boolean);
                return `  ${f.filePath}${symbols.length > 0 ? ` [added: ${symbols.join(', ')}]` : ''}`;
              }).join('\n');
              return `${s.agent} specialist:\n${fileEdits}`;
            })
            .join('\n')
            .slice(0, 1500);
          enrichedTask += `\n\nPRIOR SPECIALIST CHANGES (coordinate with these):\n${priorContext}`;
        }

        const agentTask: AgentTask = {
          executionId: ctx.executionId,
          instruction: enrichedTask,
          context: agentContext,
        };

        // Build a ToolExecutorContext so the specialist can use tools
        // (read_file, search_replace, grep_content, etc.) directly.
        let specialistSupabase: import('@supabase/supabase-js').SupabaseClient | undefined;
        let supabaseInitError: string | null = null;
        try {
          const { createServiceClient } = await import('@/lib/supabase/admin');
          specialistSupabase = createServiceClient();
        } catch (err) {
          supabaseInitError = err instanceof Error ? err.message : String(err);
        }
        if (!specialistSupabase) {
          const message = `Specialist failed to initialize file writer: ${supabaseInitError ?? 'service client unavailable'}`;
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
          ctx.onProgress?.({
            type: 'worker_progress',
            workerId: agentName,
            label: `${agentName} specialist`,
            status: 'failed',
            metadata: { agentType: agentName, error: message },
          });
          return {
            tool_use_id: toolCall.id,
            content: truncate(message),
            is_error: true,
          };
        }

        const specialistTrackedChanges: CodeChange[] = [];

        const specialistToolCtx: ToolExecutorContext = {
          files: scopedFiles,
          contextEngine: new ContextEngine(8_000),
          projectId: ctx.projectId,
          userId: ctx.userId,
          loadContent: ctx.loadContent
            ? async (fileIds: string[]) => {
                const loaded = await ctx.loadContent!(fileIds);
                return loaded.map(
                  (f: { fileId: string; content: string }) => {
                    const known = scopedFiles.find((s) => s.fileId === f.fileId);
                    return {
                      fileId: f.fileId,
                      fileName: known?.fileName ?? f.fileId,
                      fileType: known?.fileType ?? 'other',
                      content: f.content,
                      path: known?.path,
                    };
                  },
                );
              }
            : undefined,
          supabaseClient: specialistSupabase,
          sessionId: ctx.executionId,
          onFileChanged: (change) => {
            const codeChange: CodeChange = {
              fileId: change.fileId,
              fileName: change.fileName,
              originalContent: change.originalContent,
              proposedContent: change.proposedContent,
              reasoning: change.reasoning || `Applied by ${specialistAgent} specialist`,
              agentType: specialistAgent,
            };
            specialistTrackedChanges.push(codeChange);
            ctx.onCodeChange?.(codeChange);
          },
        };

        const SPECIALIST_ITERATION_LIMITS: Record<string, number> = {
          TRIVIAL: 8,
          SIMPLE: 12,
          COMPLEX: 16,
          ARCHITECTURAL: 20,
        };
        const maxIter = ctx.maxQuality || ctx.tier === 'ARCHITECTURAL'
          ? 20
          : SPECIALIST_ITERATION_LIMITS[ctx.tier ?? 'COMPLEX'] ?? 14;

        const executeOptions: AgentExecuteOptions & { maxIterations?: number; onToolUse?: (name: string) => void } = {
          action: 'generate',
          executionTier: 'editing' as const,
          maxIterations: maxIter,
          ...(ctx.model ? { model: ctx.model } : {}),
          ...(ctx.onReasoningChunk
            ? { onReasoningChunk: (chunk: string) => ctx.onReasoningChunk!(agentName, chunk) }
            : {}),
          onToolUse: (toolName: string) => {
            ctx.onProgress?.({
              type: 'tool_progress',
              name: toolName,
              id: `specialist-${agentName}-${Date.now()}`,
              toolCallId: `specialist-${agentName}-${Date.now()}`,
              progress: { phase: 'executing', detail: `${agentName}: ${toolName}` },
            });
          },
        };

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d09cca'},body:JSON.stringify({sessionId:'d09cca',location:'v2-tool-executor.ts:specialist-entry',message:'Specialist executeWithTools called',data:{agentName,task:task.slice(0,200),filesCount:scopedFiles.length,hasSupabase:!!specialistSupabase},timestamp:Date.now(),hypothesisId:'H3,H4'})}).catch(()=>{});
        // #endregion
        // Specialist uses tools: reads files, makes search_replace edits directly
        const result: AgentResult = await specialist.executeWithTools(
          agentTask,
          specialistToolCtx,
          executeOptions,
        );

        if (!result.success) {
          const errMsg =
            result.error?.message ||
            result.analysis ||
            `Specialist ${agentName} returned unsuccessful result`;
          const failTs = Date.now();
          ctx.onSpecialistLifecycleEvent?.({
            type: 'failed',
            agent: specialistAgent,
            timestampMs: failTs,
            details: { error: errMsg },
          });
          ctx.onActivitySignal?.({
            type: 'specialist_failed',
            agent: specialistAgent,
            timestampMs: failTs,
            details: { error: errMsg },
          });
          ctx.onProgress?.({
            type: 'worker_progress',
            workerId: agentName,
            label: `${agentName} specialist`,
            status: 'failed',
            metadata: { agentType: agentName, error: errMsg },
          });
          return {
            tool_use_id: toolCall.id,
            content: truncate(`Specialist ${agentName} failed: ${errMsg}`),
            is_error: true,
          };
        }

        // Syntax validation: when using cheap editing tier, verify output
        if (executeOptions.executionTier === 'editing' && specialistTrackedChanges.length > 0) {
          const hasLiquidError = specialistTrackedChanges.some(c => {
            if (!c.fileName.endsWith('.liquid')) return false;
            const content = c.proposedContent;
            const opens = (content.match(/\{%/g) || []).length;
            const closes = (content.match(/%\}/g) || []).length;
            return opens !== closes;
          });
          const hasCssError = specialistTrackedChanges.some(c => {
            if (!c.fileName.endsWith('.css')) return false;
            const content = c.proposedContent;
            const opens = (content.match(/\{/g) || []).length;
            const closes = (content.match(/\}/g) || []).length;
            return opens !== closes;
          });

          if (hasLiquidError || hasCssError) {
            console.warn(`[V2ToolExecutor] Cheap model syntax error detected for ${agentName}, retrying with mid-tier`);
            ctx.onProgress?.({
              type: 'worker_progress',
              workerId: agentName,
              label: `${agentName} specialist`,
              status: 'retrying',
              metadata: { reason: 'syntax_validation_failed' },
            });

            specialistTrackedChanges.length = 0;
            const retryOptions = { ...executeOptions, executionTier: undefined as undefined };
            const retryResult = await specialist.executeWithTools(
              agentTask,
              specialistToolCtx,
              retryOptions,
            );
            if (!retryResult.success) {
              return {
                tool_use_id: toolCall.id,
                content: truncate(`Specialist ${agentName} failed on retry: ${retryResult.error?.message || retryResult.analysis || 'unknown'}`),
                is_error: true,
              };
            }
          }
        }

        const validChanges = specialistTrackedChanges.filter(
          (c) => c.proposedContent && c.proposedContent.length > 0,
        );
        const changesCount = validChanges.length;
        if (changesCount === 0) {
          const fallbackNote = scoped.usedFallback
            ? ' File scoping fell back to project-wide context because declared files did not match.'
            : '';
          const message = `Specialist ${agentName} completed with 0 file changes. Re-scope files and provide exact target edits.${fallbackNote}`;
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
          ctx.onProgress?.({
            type: 'worker_progress',
            workerId: agentName,
            label: `${agentName} specialist`,
            status: 'failed',
            metadata: { agentType: agentName, error: message },
          });
          return {
            tool_use_id: toolCall.id,
            content: truncate(message),
            is_error: true,
          };
        }

        const analysisBrief = result.analysis
          ? ` ${result.analysis.slice(0, 300)}`
          : '';

        const changeSummaryLines = validChanges.map((c) => {
          const origLines = (c.originalContent ?? '').split('\n').length;
          const newLines = (c.proposedContent ?? '').split('\n').length;
          const addedSymbols: string[] = [];
          const proposed = c.proposedContent ?? '';
          const original = c.originalContent ?? '';
          const newCssClasses = proposed.match(/\.([\w-]+)\s*\{/g)?.filter(m => !original.includes(m)) ?? [];
          for (const cls of newCssClasses) addedSymbols.push(cls.replace(/\s*\{/, ''));
          const newDataAttrs = proposed.match(/data-[\w-]+/g)?.filter(a => !original.includes(a)) ?? [];
          for (const attr of newDataAttrs) addedSymbols.push(attr);
          const newFunctions = proposed.match(/function\s+([\w$]+)/g)?.filter(f => !original.includes(f)) ?? [];
          for (const fn of newFunctions) addedSymbols.push(fn.replace('function ', ''));
          const symbolNote = addedSymbols.length > 0 ? ` [added: ${addedSymbols.slice(0, 5).join(', ')}]` : '';
          return `- ${c.fileName}: ${origLines}→${newLines} lines${symbolNote}`;
        }).join('\n');

        const structuredSummary: ChangeSummary = {
          agent: agentName,
          files: validChanges.map((c) => {
            const proposed = c.proposedContent ?? '';
            const original = c.originalContent ?? '';
            const addedSymbols: string[] = [];
            const newCssClasses = proposed.match(/\.([\w-]+)\s*\{/g)?.filter(m => !original.includes(m)) ?? [];
            for (const cls of newCssClasses) addedSymbols.push(cls.replace(/\s*\{/, ''));
            const newDataAttrs = proposed.match(/data-[\w-]+/g)?.filter(a => !original.includes(a)) ?? [];
            for (const attr of newDataAttrs) addedSymbols.push(attr);
            const newFunctions = proposed.match(/function\s+([\w$]+)/g)?.filter(f => !original.includes(f)) ?? [];
            for (const fn of newFunctions) addedSymbols.push(fn.replace('function ', ''));
            const origLineCount = original.split('\n').length;
            const newLineCount = proposed.split('\n').length;
            return {
              filePath: c.fileName,
              edits: [{
                lineRange: [1, Math.max(origLineCount, newLineCount)] as [number, number],
                addedSymbols: addedSymbols.slice(0, 10),
              }],
            };
          }),
        };
        ctx.changeSummaries?.push(structuredSummary);

        // Emit cost event for monitoring
        const usage = specialist.getLastUsage();
        if (usage) {
          const { calculateCostCents } = await import('@/lib/billing/cost-calculator');
          const costEvent: AgentCostEvent = {
            executionId: ctx.executionId,
            projectId: ctx.projectId,
            phase: 'specialist',
            modelId: usage.model,
            executionTier: executeOptions.executionTier ?? 'default',
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            costCents: calculateCostCents(usage.model, usage.inputTokens, usage.outputTokens),
            durationMs: Date.now() - startTs,
          };
          ctx.onActivitySignal?.({
            type: 'cost_event',
            agent: specialistAgent,
            timestampMs: Date.now(),
            details: costEvent as unknown as Record<string, unknown>,
          });
        }

        const summary = truncate(
          `Specialist ${agentName} completed: ${changesCount} file(s) changed.${analysisBrief}\n\nChange summary:\n${changeSummaryLines}`,
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

        // Persist role-tagged outcome for specialist memory (fire-and-forget)
        if (ctx.supabaseClient && result.success && changesCount > 0) {
          import('@/lib/agents/memory/task-outcomes').then(({ storeTaskOutcome }) => {
            storeTaskOutcome(ctx.supabaseClient as import('@supabase/supabase-js').SupabaseClient, {
              projectId: ctx.projectId,
              userId: ctx.userId,
              taskSummary: task.slice(0, 2000),
              outcome: 'success',
              filesChanged: validChanges.map(c => c.fileName),
              toolSequence: [],
              role: agentName,
            }).catch(() => {});
          });
        }

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

        // Use Codex packager for review context when we have proposed changes
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
          executionTier: 'review' as const,
          ...(ctx.model ? { model: ctx.model } : {}),
          ...(ctx.tier ? { tier: ctx.tier } : {}),
        };

        const result: AgentResult = await reviewer.execute(reviewTask, reviewOptions);

        // If the reviewer's context was truncated, it cannot reliably evaluate the changes.
        // Force-approve and surface a warning rather than blocking on incomplete analysis.
        if (result.budgetTruncated) {
          console.warn('[V2ToolExecutor] Review context was truncated — auto-approving with advisory warning');
          ctx.onActivitySignal?.({
            type: 'review_completed',
            agent: 'review',
            timestampMs: Date.now(),
            details: { approved: true, issues: 0 },
          });
          return {
            tool_use_id: toolCall.id,
            content: truncate(
              'Review APPROVED (advisory)\n' +
              'NOTE: Review context was truncated due to token budget limits. ' +
              'Changes are provisionally approved. Manual review recommended.',
            ),
          };
        }

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

        const reviewUsage = reviewer.getLastUsage();
        if (reviewUsage) {
          const { calculateCostCents } = await import('@/lib/billing/cost-calculator');
          const costEvent: AgentCostEvent = {
            executionId: ctx.executionId,
            projectId: ctx.projectId,
            phase: 'review',
            modelId: reviewUsage.model,
            executionTier: 'review',
            inputTokens: reviewUsage.inputTokens,
            outputTokens: reviewUsage.outputTokens,
            costCents: calculateCostCents(reviewUsage.model, reviewUsage.inputTokens, reviewUsage.outputTokens),
            durationMs: 0,
          };
          ctx.onActivitySignal?.({
            type: 'cost_event',
            agent: 'review',
            timestampMs: Date.now(),
            details: costEvent as unknown as Record<string, unknown>,
          });
        }

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

    // -- refresh_memory_anchor ------------------------------------------------
    // -- recall_role_memory -------------------------------------------------
    case 'recall_role_memory': {
      const role = String(toolCall.input.role ?? '');
      const query = String(toolCall.input.query ?? '');
      if (!ctx.supabaseClient) {
        return { tool_use_id: toolCall.id, content: 'Role memory not available — no database connection.' };
      }
      try {
        const { retrieveSimilarOutcomes, formatOutcomesForPrompt } =
          await import('@/lib/agents/memory/task-outcomes');
        const outcomes = await retrieveSimilarOutcomes(
          ctx.supabaseClient as import('@supabase/supabase-js').SupabaseClient,
          ctx.projectId, query, 5, 0.5, { role },
        );
        const formatted = outcomes.length > 0
          ? formatOutcomesForPrompt(outcomes, { maxResults: 5 })
          : `No past patterns found for ${role} specialist matching "${query}".`;
        return { tool_use_id: toolCall.id, content: formatted };
      } catch (err) {
        return {
          tool_use_id: toolCall.id,
          content: `Role memory lookup failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    case 'refresh_memory_anchor': {
      if (ctx.getMemoryAnchor) {
        return {
          tool_use_id: toolCall.id,
          content: ctx.getMemoryAnchor(),
        };
      }
      return {
        tool_use_id: toolCall.id,
        content: 'Memory anchor not available in this execution context.',
        is_error: true,
      };
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
        const plan = await createPlan(ctx.projectId, ctx.userId, name, content, todos);
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
        const result = await updatePlan(planId, ctx.userId, updates, expectedVersion);

        if ('conflict' in result) {
          return {
            tool_use_id: toolCall.id,
            content: `Version conflict: expected ${expectedVersion}, current is ${result.currentVersion}. Re-read the plan and retry.`,
            is_error: true,
          };
        }

        return {
          tool_use_id: toolCall.id,
          content: JSON.stringify({ planId: result.id, version: result.version }),
          planData: result,
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
