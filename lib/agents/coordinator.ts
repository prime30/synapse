import type {
  AgentType,
  AgentMessage,
  AgentContext,
  AgentTask,
  AgentResult,
  CodeChange,
  FileContext,
  UserPreference,
} from '@/lib/types/agent';
import {
  createExecution,
  updateExecutionStatus,
  addMessage,
  setAgentActive,
  setAgentCompleted,
  storeChanges,
  setReviewResult,
  persistExecution,
} from './execution-store';
import { ProjectManagerAgent } from './project-manager';
import { LiquidAgent } from './specialists/liquid';
import { JavaScriptAgent } from './specialists/javascript';
import { CSSAgent } from './specialists/css';
import { JSONAgent } from './specialists/json';
import { ReviewAgent } from './review';
import type { AgentExecuteOptions, AgentUsage } from './base';
import type { AIAction } from './model-router';
import { getProviderForModel } from './model-router';
import { AIProviderError } from '@/lib/ai/errors';
import { DependencyDetector, ContextCache } from '@/lib/context';
import type {
  FileContext as ContextFileContext,
  ProjectContext,
  FileDependency,
} from '@/lib/context/types';
import { DesignSystemContextProvider } from '@/lib/design-tokens/agent-integration';
import { generateFileGroups } from '@/lib/shopify/theme-grouping';
import { ContextEngine } from '@/lib/ai/context-engine';
import { validateChangeSet } from './validation/change-set-validator';

// ── Cross-file context helpers (REQ-5) ────────────────────────────────

/** Module-level singletons so cache persists across requests within the same process. */
const contextCache = new ContextCache();
const dependencyDetector = new DependencyDetector();
const designContextProvider = new DesignSystemContextProvider();
const contextEngine = new ContextEngine(60_000);

/**
 * Detect cross-file dependencies and format a human-readable summary.
 * Uses TTL-based caching to avoid recomputing on every request.
 * Fails gracefully — returns empty string on error so agent execution is never blocked.
 */
function buildDependencyContext(
  files: FileContext[],
  projectId: string,
): string {
  try {
    // Check cache first
    const cached = contextCache.get(projectId);
    if (cached) {
      return formatDependencies(cached.dependencies, cached.files);
    }

    // Convert agent FileContext → context FileContext (adds required fields)
    const contextFiles: ContextFileContext[] = files.map((f) => ({
      fileId: f.fileId,
      fileName: f.fileName,
      fileType: f.fileType,
      content: f.content,
      sizeBytes: f.content.length,
      lastModified: new Date(),
      dependencies: { imports: [], exports: [], usedBy: [] },
    }));

    const dependencies = dependencyDetector.detectDependencies(contextFiles);

    // Cache the full ProjectContext for the TTL window
    const projectContext: ProjectContext = {
      projectId,
      files: contextFiles,
      dependencies,
      loadedAt: new Date(),
      totalSizeBytes: contextFiles.reduce((sum, f) => sum + f.sizeBytes, 0),
    };
    contextCache.set(projectId, projectContext);

    return formatDependencies(dependencies, contextFiles);
  } catch (error) {
    console.warn('[AgentCoordinator] Failed to build dependency context:', error);
    return '';
  }
}

/**
 * B3: Format dependencies as structured cross-file relationship maps.
 * Groups by source file and categorises by dependency type for richer AI context.
 */
function formatDependencies(
  dependencies: FileDependency[],
  files: ContextFileContext[],
): string {
  if (dependencies.length === 0) return '';

  const nameMap = new Map(files.map((f) => [f.fileId, f.fileName]));
  const idByName = new Map(files.map((f) => [f.fileName, f.fileId]));

  // Group deps by source file
  const bySource = new Map<string, FileDependency[]>();
  for (const dep of dependencies) {
    const source = nameMap.get(dep.sourceFileId) ?? dep.sourceFileId;
    const existing = bySource.get(source) ?? [];
    existing.push(dep);
    bySource.set(source, existing);
  }

  // Build reverse lookup: which files reference a given target?
  const usedByMap = new Map<string, Set<string>>();
  for (const dep of dependencies) {
    const target = nameMap.get(dep.targetFileId) ?? dep.targetFileId;
    const source = nameMap.get(dep.sourceFileId) ?? dep.sourceFileId;
    if (!usedByMap.has(target)) usedByMap.set(target, new Set());
    usedByMap.get(target)!.add(source);
  }

  const sections: string[] = [];

  for (const [sourceFile, deps] of bySource) {
    const lines: string[] = [`## Cross-File Relationships for ${sourceFile}`];

    // Categorise outgoing dependencies
    const renders: string[] = [];
    const styledBy: string[] = [];
    const usedIn: string[] = [];
    const other: string[] = [];

    for (const dep of deps) {
      const target = nameMap.get(dep.targetFileId) ?? dep.targetFileId;
      const refs = dep.references.map((r) => r.symbol).join(', ');

      if (dep.dependencyType === 'liquid_include' || dep.dependencyType === 'snippet_variable') {
        renders.push(`${target} (passes: ${refs})`);
      } else if (dep.dependencyType === 'css_class' || dep.dependencyType === 'css_import' || dep.dependencyType === 'css_section') {
        styledBy.push(`${target} (classes: ${refs})`);
      } else if (dep.dependencyType === 'template_section' || dep.dependencyType === 'schema_setting') {
        usedIn.push(`${target} (${refs})`);
      } else {
        other.push(`${target} (${dep.dependencyType}): ${refs}`);
      }
    }

    if (renders.length > 0) lines.push(`Renders: ${renders.join(', ')}`);
    if (styledBy.length > 0) lines.push(`Styled by: ${styledBy.join(', ')}`);
    if (usedIn.length > 0) lines.push(`Used in: ${usedIn.join(', ')}`);
    if (other.length > 0) lines.push(`Related: ${other.join(', ')}`);

    // Schema settings from file metadata
    const sourceId = idByName.get(sourceFile);
    if (sourceId) {
      const sourceCtxFile = files.find((f) => f.fileId === sourceId);
      const schemaSettings = sourceCtxFile?.dependencies?.exports ?? [];
      if (schemaSettings.length > 0) {
        lines.push(`Schema settings: ${schemaSettings.join(', ')}`);
      }
    }

    // Reverse: who references this file?
    const referencedBy = usedByMap.get(sourceFile);
    lines.push(`Used by: ${referencedBy ? [...referencedBy].join(', ') : '(nothing references this file directly)'}`);

    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}

// ── p0 Architectural Principles ──────────────────────────────────────────

/**
 * File Context Rule: Reject code changes to files that aren't loaded in context.
 * This prevents agents from hallucinating changes to files they haven't seen.
 */
function enforceFileContextRule(
  changes: CodeChange[],
  contextFiles: FileContext[],
): { allowed: CodeChange[]; rejected: CodeChange[] } {
  const contextFileNames = new Set(contextFiles.map((f) => f.fileName));
  const contextFileIds = new Set(contextFiles.map((f) => f.fileId));

  const allowed: CodeChange[] = [];
  const rejected: CodeChange[] = [];

  for (const change of changes) {
    if (contextFileNames.has(change.fileName) || contextFileIds.has(change.fileId)) {
      allowed.push(change);
    } else {
      rejected.push(change);
    }
  }

  return { allowed, rejected };
}

/**
 * Scope Assessment Gate: Check if the PM flagged the request as needing clarification.
 */
function checkNeedsClarification(pmResult: AgentResult): boolean {
  if (!pmResult.analysis) return false;

  try {
    const jsonMatch = pmResult.analysis.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.needsClarification === true;
    }
  } catch {
    // Not JSON, check for the flag in the raw text
  }

  return pmResult.analysis.toLowerCase().includes('needsclarification');
}

// ── Thinking Events (real-time progress) ────────────────────────────────

export interface ThinkingEvent {
  type: 'thinking';
  phase: 'analyzing' | 'planning' | 'executing' | 'reviewing' | 'complete';
  label: string;
  detail?: string;
  agent?: string;
  analysis?: string;
  summary?: string;
}

export type ProgressCallback = (event: ThinkingEvent) => void;

// ── Coordinator Options ─────────────────────────────────────────────────

export interface CoordinatorExecuteOptions {
  /** The primary AI action being performed. */
  action?: AIAction;
  /** User's preferred model override (from useAgentSettings). */
  model?: string;
  /** Execution mode: orchestrated (multi-agent) or solo (PM only). */
  mode?: 'orchestrated' | 'solo';
  /** DOM context from preview bridge. */
  domContext?: string;
  /** Developer memory context (formatted string). */
  memoryContext?: string;
  /** Real-time progress callback for thinking events. */
  onProgress?: ProgressCallback;
  /** If true, return after PM analysis without delegating to specialists. */
  planOnly?: boolean;
}

// ── Usage tracking types ────────────────────────────────────────────────

export interface AgentUsageEntry {
  agentType: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ExecutionUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  perAgent: AgentUsageEntry[];
}

/**
 * Message queue coordinator for multi-agent orchestration.
 * Routes messages between agents, manages execution lifecycle,
 * and handles parallel specialist execution.
 *
 * EPIC 1a Architectural Principles (p0):
 * - File Context Rule: reject changes to files not in context
 * - Scope Assessment Gate: PM returns needsClarification for broad requests
 * - Verification First-Class: review agent mandatory in orchestrated mode
 * - Parallel over Sequential: Promise.all for context loading
 * - Testing Always First: "Verify this works" chip after code_change
 */
export class AgentCoordinator {
  private pm: ProjectManagerAgent;
  private specialists: Record<string, LiquidAgent | JavaScriptAgent | CSSAgent | JSONAgent>;
  private reviewer: ReviewAgent;

  constructor() {
    this.pm = new ProjectManagerAgent();
    this.specialists = {
      liquid: new LiquidAgent(),
      javascript: new JavaScriptAgent(),
      css: new CSSAgent(),
      json: new JSONAgent(),
    };
    this.reviewer = new ReviewAgent();
  }

  /**
   * Collect token usage from every agent that participated in the last execution.
   * Call this after execute() or executeSolo() completes.
   * Returns accumulated totals + per-agent breakdown.
   */
  getAccumulatedUsage(): ExecutionUsage {
    const entries: AgentUsageEntry[] = [];

    const collect = (agentType: string, usage: AgentUsage | null) => {
      if (!usage) return;
      entries.push({
        agentType,
        provider: getProviderForModel(usage.model),
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });
    };

    collect('project_manager', this.pm.getLastUsage());

    for (const [name, agent] of Object.entries(this.specialists)) {
      collect(name, agent.getLastUsage());
    }

    collect('review', this.reviewer.getLastUsage());

    return {
      totalInputTokens: entries.reduce((s, e) => s + e.inputTokens, 0),
      totalOutputTokens: entries.reduce((s, e) => s + e.outputTokens, 0),
      perAgent: entries,
    };
  }

  /**
   * Execute a full multi-agent workflow:
   * 1. PM analyzes request and creates delegations
   * 2. Scope Assessment Gate: check if PM needs clarification
   * 3. Specialists execute in parallel
   * 4. File Context Rule: filter out changes to files not in context
   * 5. Verification First-Class: review agent validates all changes
   * 6. Persist execution and return result
   */
  async execute(
    executionId: string,
    projectId: string,
    userId: string,
    userRequest: string,
    files: FileContext[],
    userPreferences: UserPreference[],
    options?: CoordinatorExecuteOptions,
  ): Promise<AgentResult> {
    // Top-level coordinator timeout (180s) -- ensures we never hang
    const COORDINATOR_TIMEOUT_MS = 180_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new AIProviderError(
        'TIMEOUT',
        `Coordinator execution timed out after ${COORDINATOR_TIMEOUT_MS / 1000}s`,
        'coordinator'
      )), COORDINATOR_TIMEOUT_MS)
    );

    try {
      return await Promise.race([
        this._executeInner(executionId, projectId, userId, userRequest, files, userPreferences, options),
        timeoutPromise,
      ]);
    } catch (error) {
      updateExecutionStatus(executionId, 'failed');
      await persistExecution(executionId);

      const isProviderErr = error instanceof AIProviderError;
      return {
        agentType: 'project_manager',
        success: false,
        error: {
          code: isProviderErr ? error.code : 'EXECUTION_FAILED',
          message: isProviderErr ? error.userMessage : String(error),
          agentType: 'project_manager',
          recoverable: isProviderErr ? error.retryable : false,
        },
      };
    }
  }

  private async _executeInner(
    executionId: string,
    projectId: string,
    userId: string,
    userRequest: string,
    files: FileContext[],
    userPreferences: UserPreference[],
    options?: CoordinatorExecuteOptions,
  ): Promise<AgentResult> {
    createExecution(executionId, projectId, userId, userRequest);
    updateExecutionStatus(executionId, 'in_progress');

    // Index files for ContextEngine (EPIC 1b)
    contextEngine.indexFiles(files);

    const agentOptions: AgentExecuteOptions = {
      action: options?.action,
      model: options?.model,
    };

    // ── Parallel context building (p0: Parallel over Sequential) ──────
    // Build all context layers simultaneously instead of sequentially.
    const [dependencyContext, designContext, fileGroupContext] = await Promise.all([
      Promise.resolve(buildDependencyContext(files, projectId)),
      buildDesignContext(projectId),
      buildFileGroupContext(files),
    ]);

    const context: AgentContext = {
      executionId,
      projectId,
      userId,
      userRequest,
      files,
      userPreferences,
      dependencyContext: (dependencyContext + fileGroupContext) || undefined,
      designContext: designContext || undefined,
      domContext: options?.domContext || undefined,
      memoryContext: options?.memoryContext || undefined,
    };

    const onProgress = options?.onProgress;

    try {
      // Step 1: Project Manager analyzes and delegates
      onProgress?.({
        type: 'thinking',
        phase: 'analyzing',
        label: 'Reviewing your request',
        detail: userRequest.slice(0, 120),
      });

      setAgentActive(executionId, 'project_manager');
      const pmTask: AgentTask = {
        executionId,
        instruction: userRequest,
        context,
      };

      this.logMessage(executionId, 'coordinator', 'project_manager', 'task', {
        instruction: userRequest,
      });

      const pmResult = await this.pm.execute(pmTask, {
        ...agentOptions,
        action: 'analyze',
      });
      setAgentCompleted(executionId, 'project_manager');

      this.logMessage(executionId, 'project_manager', 'coordinator', 'result', {
        instruction: pmResult.analysis,
      });

      onProgress?.({
        type: 'thinking',
        phase: 'planning',
        label: 'Planning changes',
        analysis: pmResult.analysis,
        detail: pmResult.delegations?.length
          ? `Delegating to ${pmResult.delegations.length} specialist(s)`
          : 'Analyzing results',
      });

      // ── p0: Scope Assessment Gate ──────────────────────────────────
      // If PM signals the request is too broad/ambiguous, return early
      // with needsClarification so the frontend can prompt the user.
      if (checkNeedsClarification(pmResult)) {
        updateExecutionStatus(executionId, 'completed');
        await persistExecution(executionId);
        return {
          agentType: 'project_manager',
          success: true,
          analysis: pmResult.analysis,
          needsClarification: true,
        };
      }

      // ── Plan-only mode: return after PM analysis (no specialists) ────
      if (options?.planOnly) {
        onProgress?.({
          type: 'thinking',
          phase: 'complete',
          label: 'Analysis complete',
          summary: pmResult.analysis,
        });
        updateExecutionStatus(executionId, 'completed');
        await persistExecution(executionId);
        return {
          agentType: 'project_manager',
          success: true,
          analysis: pmResult.analysis,
          delegations: pmResult.delegations,
        };
      }

      if (!pmResult.success || !pmResult.delegations?.length) {
        updateExecutionStatus(executionId, 'failed');
        await persistExecution(executionId);
        return pmResult;
      }

      // Auto-include dependencies for specialist context via ContextEngine (EPIC 1b)
      const affectedFileNames = (pmResult.delegations ?? []).flatMap(d => d.affectedFiles);
      const affectedFileIds = files
        .filter(f => affectedFileNames.includes(f.fileName))
        .map(f => f.fileId);
      const expandedIds = contextEngine.resolveWithDependencies(affectedFileIds);
      const expandedFiles = expandedIds
        .map(id => files.find(f => f.fileId === id))
        .filter((f): f is FileContext => f !== undefined);
      // Merge expanded files into context (without duplicates)
      const contextFileIds = new Set(files.map(f => f.fileId));
      const additionalFiles = expandedFiles.filter(f => !contextFileIds.has(f.fileId));
      const enrichedFiles = [...files, ...additionalFiles];

      // Step 2: Specialists execute in parallel
      const specialistPromises = pmResult.delegations.map(async (delegation) => {
        const agent = this.specialists[delegation.agent];
        if (!agent) return null;

        onProgress?.({
          type: 'thinking',
          phase: 'executing',
          label: `${delegation.agent} agent`,
          detail: delegation.task.slice(0, 120),
          agent: delegation.agent,
        });

        setAgentActive(executionId, delegation.agent);

        this.logMessage(executionId, 'coordinator', delegation.agent, 'task', {
          instruction: delegation.task,
        });

        // A4: Build specialist-scoped context with 40k budget
        const specialistContextEngine = new ContextEngine(40_000);
        specialistContextEngine.indexFiles(enrichedFiles);
        const specialistCtx = specialistContextEngine.selectRelevantFiles(
          delegation.task,
          [],
          delegation.affectedFiles[0],
        );

        const specialistTask: AgentTask = {
          executionId,
          instruction: delegation.task,
          context: {
            ...context,
            files: specialistCtx.files.length > 0 ? specialistCtx.files : enrichedFiles,
            userRequest: delegation.task,
          },
        };

        const result = await agent.execute(specialistTask, {
          ...agentOptions,
          action: 'generate',
        });
        setAgentCompleted(executionId, delegation.agent);

        if (result.changes?.length) {
          storeChanges(executionId, delegation.agent, result.changes);
        }

        this.logMessage(executionId, delegation.agent, 'coordinator', 'result', {
          changes: result.changes,
        });

        return result;
      });

      const specialistResults = (await Promise.all(specialistPromises)).filter(
        (r): r is AgentResult => r !== null
      );

      // ── C1: Inter-Agent Proposal Sharing ──────────────────────────────
      // Build a proposal summary so agents can see each other's changes
      const proposalSummary = this.buildProposalSummary(specialistResults);
      if (proposalSummary && specialistResults.length > 1) {
        onProgress?.({
          type: 'thinking',
          phase: 'executing',
          label: 'Coordinating changes',
          detail: 'Cross-checking specialist proposals',
        });
        // Note: In a future iteration, re-invoke specialists with cross-context
        // For now, log the proposal summary for the review agent to use
        console.log('[AgentCoordinator] Proposal summary for review:', proposalSummary.slice(0, 200));
      }

      // Collect all proposed changes
      let allChanges: CodeChange[] = specialistResults.flatMap(
        (r) => r.changes ?? []
      );

      // ── p0: File Context Rule ──────────────────────────────────────
      // Reject changes to files not loaded in the current context.
      if (allChanges.length > 0) {
        const { allowed, rejected } = enforceFileContextRule(allChanges, files);
        if (rejected.length > 0) {
          console.warn(
            `[AgentCoordinator] File Context Rule rejected ${rejected.length} change(s) to files not in context:`,
            rejected.map((c) => c.fileName)
          );
        }
        allChanges = allowed;
      }

      if (allChanges.length === 0) {
        updateExecutionStatus(executionId, 'completed');
        await persistExecution(executionId);
        return {
          agentType: 'project_manager',
          success: true,
          changes: [],
          analysis: pmResult.analysis ?? 'No changes needed based on the analysis.',
        };
      }

      // ── C4: Cross-File Validation Gate ──────────────────────────────
      // Programmatic cross-file consistency check before review
      const validationResult = validateChangeSet(allChanges, files);
      let validationContext = '';
      if (validationResult.issues.length > 0) {
        const issueLines = validationResult.issues.map(
          (i) => `- [${i.severity}] ${i.file}: ${i.description} (${i.category})`
        );
        validationContext = `\n\n## Pre-Review Validation Issues\n${issueLines.join('\n')}`;
      }

      // ── p0: Verification First-Class ────────────────────────────────
      // Review agent is mandatory in orchestrated mode.
      onProgress?.({
        type: 'thinking',
        phase: 'reviewing',
        label: 'Reviewing changes',
        detail: `Checking ${allChanges.length} proposed change(s)`,
      });

      setAgentActive(executionId, 'review');

      this.logMessage(executionId, 'coordinator', 'review', 'task', {
        instruction: 'Review all proposed changes',
        changes: allChanges,
      });

      // A4: Build review-scoped context with 30k budget
      const reviewContextEngine = new ContextEngine(30_000);
      reviewContextEngine.indexFiles(files);
      const reviewCtx = reviewContextEngine.buildContext(
        files.filter(f => allChanges.some(c => c.fileName === f.fileName)).map(f => f.fileId),
      );

      const reviewTask: AgentTask = {
        executionId,
        instruction: `Review the following ${allChanges.length} proposed changes for: ${userRequest}${validationContext}${proposalSummary ? `\n\n${proposalSummary}` : ''}`,
        context: {
          ...context,
          files: reviewCtx.files.length > 0 ? reviewCtx.files : files,
          userRequest: JSON.stringify(allChanges),
        },
      };

      const reviewResult = await this.reviewer.execute(reviewTask, {
        ...agentOptions,
        action: 'review',
      });
      setAgentCompleted(executionId, 'review');

      if (reviewResult.reviewResult) {
        setReviewResult(executionId, reviewResult.reviewResult);
      }

      this.logMessage(executionId, 'review', 'coordinator', 'result', {
        instruction: reviewResult.reviewResult?.summary,
      });

      // ── C3: Review-Triggered Refinement ──────────────────────────────
      // If review found critical errors, re-invoke responsible specialists (1 iteration max)
      if (reviewResult.reviewResult && !reviewResult.reviewResult.approved) {
        const criticalIssues = reviewResult.reviewResult.issues.filter(
          (i) => i.severity === 'error'
        );
        if (criticalIssues.length > 0) {
          onProgress?.({
            type: 'thinking',
            phase: 'executing',
            label: 'Fixing critical issues',
            detail: `${criticalIssues.length} critical issue(s) found`,
          });

          // Group issues by file to identify responsible specialists
          const issuesByFile = new Map<string, typeof criticalIssues>();
          for (const issue of criticalIssues) {
            const existing = issuesByFile.get(issue.file) || [];
            existing.push(issue);
            issuesByFile.set(issue.file, existing);
          }

          // Re-invoke specialists for files with critical issues
          const refinementPromises: Promise<AgentResult | null>[] = [];
          for (const [fileName, issues] of issuesByFile) {
            // Find which specialist originally changed this file
            const originalChange = allChanges.find(c => c.fileName === fileName);
            if (!originalChange) continue;
            const agent = this.specialists[originalChange.agentType];
            if (!agent) continue;

            const issueDescriptions = issues.map(i =>
              `- [${i.severity}] ${i.description}${i.suggestion ? ` (Suggestion: ${i.suggestion})` : ''}`
            ).join('\n');

            const refinementTask: AgentTask = {
              executionId,
              instruction: `Fix the following critical review issues in ${fileName}:\n${issueDescriptions}\n\nOriginal change reasoning: ${originalChange.reasoning}\n\nProvide the corrected version.`,
              context: {
                ...context,
                files: files.filter(f =>
                  f.fileName === fileName || enrichedFiles.some(ef => ef.fileId === f.fileId)
                ),
                userRequest: `Fix critical issues in ${fileName}`,
              },
            };

            refinementPromises.push(
              agent.execute(refinementTask, { ...agentOptions, action: 'fix' }).catch(() => null)
            );
          }

          const refinementResults = (await Promise.all(refinementPromises)).filter(
            (r): r is AgentResult => r !== null && r.success
          );

          // Merge refinement changes (replace original changes for the same files)
          const refinedChanges = refinementResults.flatMap(r => r.changes ?? []);
          if (refinedChanges.length > 0) {
            for (const refined of refinedChanges) {
              const idx = allChanges.findIndex(c => c.fileName === refined.fileName);
              if (idx >= 0) {
                allChanges[idx] = refined;
              } else {
                allChanges.push(refined);
              }
            }
          }
        }
      }

      // Step 4: Persist and return
      onProgress?.({
        type: 'thinking',
        phase: 'complete',
        label: 'Ready',
        summary: reviewResult.reviewResult?.summary ?? 'Changes complete',
      });

      updateExecutionStatus(executionId, 'completed');
      await persistExecution(executionId);

      return {
        agentType: 'project_manager',
        success: true,
        changes: allChanges,
        reviewResult: reviewResult.reviewResult,
        analysis: pmResult.analysis,
        // p0: Testing Always First — signal to frontend to inject "Verify this works" chip
        suggestVerification: allChanges.length > 0,
      };
    } catch (error) {
      updateExecutionStatus(executionId, 'failed');

      this.logMessage(executionId, 'coordinator', 'coordinator', 'error', {
        error: undefined,
        instruction: String(error),
      });

      await persistExecution(executionId);

      const isProviderErr = error instanceof AIProviderError;
      return {
        agentType: 'project_manager',
        success: false,
        error: {
          code: isProviderErr ? error.code : 'EXECUTION_FAILED',
          message: isProviderErr ? error.userMessage : String(error),
          agentType: 'project_manager',
          recoverable: isProviderErr ? error.retryable : false,
        },
      };
    }
  }

  /**
   * Execute in solo mode: PM generates code changes directly without
   * specialist delegation or review. Faster, simpler, best for
   * straightforward requests.
   */
  async executeSolo(
    executionId: string,
    projectId: string,
    userId: string,
    userRequest: string,
    files: FileContext[],
    userPreferences: UserPreference[],
    options?: CoordinatorExecuteOptions,
  ): Promise<AgentResult> {
    createExecution(executionId, projectId, userId, userRequest);
    updateExecutionStatus(executionId, 'in_progress');

    const onProgress = options?.onProgress;

    // Index files for context engine
    contextEngine.indexFiles(files);

    // Build enriched context using ContextEngine
    const allFileIds = files.map(f => f.fileId);
    const contextResult = contextEngine.buildContext(allFileIds);

    const dependencyContext = buildDependencyContext(files, projectId);

    let designContext = '';
    try {
      designContext = await designContextProvider.getDesignContext(projectId);
    } catch { /* never block */ }

    const context: AgentContext = {
      executionId,
      projectId,
      userId,
      userRequest,
      files: contextResult.files,
      userPreferences,
      dependencyContext: dependencyContext || undefined,
      designContext: designContext || undefined,
      domContext: options?.domContext || undefined,
      memoryContext: options?.memoryContext || undefined,
    };

    try {
      onProgress?.({
        type: 'thinking',
        phase: 'analyzing',
        label: 'Solo mode — generating changes directly',
        detail: userRequest.slice(0, 120),
      });

      setAgentActive(executionId, 'project_manager');

      const pmTask: AgentTask = {
        executionId,
        instruction: userRequest,
        context,
      };

      this.logMessage(executionId, 'coordinator', 'project_manager', 'task', {
        instruction: userRequest,
      });

      // Solo execution: call PM's generateResponse directly with solo prompt
      // We use `as any` to access the protected `client` from the base Agent class.
      const raw = await Promise.race([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.pm as any).client.generateResponse(
          this.pm.formatSoloPrompt(pmTask),
          this.pm.getSoloSystemPrompt(),
          context
        ) as Promise<string>,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Solo PM timed out after 120s')), 120_000)
        ),
      ]);

      setAgentCompleted(executionId, 'project_manager');

      // Parse the solo response (contains direct changes, not delegations)
      const result = this.pm.parseResponse(raw, pmTask);

      this.logMessage(executionId, 'project_manager', 'coordinator', 'result', {
        instruction: result.analysis,
      });

      updateExecutionStatus(executionId, result.success ? 'completed' : 'failed');
      await persistExecution(executionId);

      return result;
    } catch (error) {
      updateExecutionStatus(executionId, 'failed');

      this.logMessage(executionId, 'coordinator', 'coordinator', 'error', {
        error: undefined,
        instruction: String(error),
      });

      await persistExecution(executionId);

      const isProviderErr = error instanceof AIProviderError;
      return {
        agentType: 'project_manager',
        success: false,
        error: {
          code: isProviderErr ? error.code : 'SOLO_EXECUTION_FAILED',
          message: isProviderErr ? error.userMessage : String(error),
          agentType: 'project_manager',
          recoverable: isProviderErr ? error.retryable : false,
        },
      };
    }
  }

  /**
   * C1: Build a summary of all specialist proposals for cross-agent coordination.
   */
  private buildProposalSummary(results: AgentResult[]): string {
    const sections: string[] = [];
    for (const result of results) {
      if (!result.changes?.length) continue;
      sections.push(`### ${result.agentType} agent proposals:`);
      for (const change of result.changes) {
        sections.push(`- ${change.fileName}: ${change.reasoning}`);
      }
    }
    return sections.length > 0
      ? `## Proposal Registry\n\n${sections.join('\n')}`
      : '';
  }

  private logMessage(
    executionId: string,
    from: AgentType | 'coordinator',
    to: AgentType | 'coordinator',
    type: 'task' | 'result' | 'error',
    payload: AgentMessage['payload']
  ): void {
    const message: AgentMessage = {
      id: crypto.randomUUID(),
      executionId,
      fromAgent: from as AgentType,
      toAgent: to,
      messageType: type,
      payload,
      timestamp: new Date(),
    };
    addMessage(executionId, message);
  }
}

// ── Async context helpers ───────────────────────────────────────────────

/** Build design-system context. Gracefully degrades to empty string on failure. */
async function buildDesignContext(projectId: string): Promise<string> {
  try {
    return await designContextProvider.getDesignContext(projectId);
  } catch {
    return '';
  }
}

/** Build file grouping context (related files that form components). */
async function buildFileGroupContext(files: FileContext[]): Promise<string> {
  try {
    const groups = generateFileGroups(files.map((f) => ({
      id: f.fileId,
      name: f.fileName,
      path: f.path ?? f.fileName,
      content: f.content,
    })));
    if (groups.length > 0) {
      const lines = groups
        .filter((g) => g.fileIds.length > 1)
        .slice(0, 20)
        .map((g) => {
          const names = g.fileIds
            .map((id) => files.find((f) => f.fileId === id)?.fileName)
            .filter(Boolean);
          return `  ${g.label}: ${names.join(', ')}`;
        });
      if (lines.length > 0) {
        return `\nRelated file groups (files that form a component):\n${lines.join('\n')}`;
      }
    }
    return '';
  } catch {
    return '';
  }
}
