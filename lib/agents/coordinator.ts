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
import { ReviewAgent } from './review';
import type { AgentExecuteOptions } from './base';
import type { AIAction } from './model-router';
import { DependencyDetector, ContextCache } from '@/lib/context';
import type {
  FileContext as ContextFileContext,
  ProjectContext,
  FileDependency,
} from '@/lib/context/types';
import { DesignSystemContextProvider } from '@/lib/design-tokens/agent-integration';
import { generateFileGroups } from '@/lib/shopify/theme-grouping';
import { ContextEngine } from '@/lib/ai/context-engine';

// ── Cross-file context helpers (REQ-5) ────────────────────────────────

/** Module-level singletons so cache persists across requests within the same process. */
const contextCache = new ContextCache();
const dependencyDetector = new DependencyDetector();
const designContextProvider = new DesignSystemContextProvider();
const contextEngine = new ContextEngine(16_000);

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

/** Format dependency list using file names (not IDs) for AI readability. */
function formatDependencies(
  dependencies: FileDependency[],
  files: ContextFileContext[],
): string {
  if (dependencies.length === 0) return '';

  const nameMap = new Map(files.map((f) => [f.fileId, f.fileName]));
  const lines: string[] = ['## Cross-File Dependencies\n'];

  for (const dep of dependencies) {
    const source = nameMap.get(dep.sourceFileId) ?? dep.sourceFileId;
    const target = nameMap.get(dep.targetFileId) ?? dep.targetFileId;
    const refs = dep.references.map((r) => r.symbol).join(', ');
    lines.push(`- ${source} → ${target} (${dep.dependencyType}): ${refs}`);
  }

  return lines.join('\n');
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
  private specialists: Record<string, LiquidAgent | JavaScriptAgent | CSSAgent>;
  private reviewer: ReviewAgent;

  constructor() {
    this.pm = new ProjectManagerAgent();
    this.specialists = {
      liquid: new LiquidAgent(),
      javascript: new JavaScriptAgent(),
      css: new CSSAgent(),
    };
    this.reviewer = new ReviewAgent();
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
    };

    try {
      // Step 1: Project Manager analyzes and delegates
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

        setAgentActive(executionId, delegation.agent);

        this.logMessage(executionId, 'coordinator', delegation.agent, 'task', {
          instruction: delegation.task,
        });

        const specialistTask: AgentTask = {
          executionId,
          instruction: delegation.task,
          context: {
            ...context,
            files: enrichedFiles,
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

      // ── p0: Verification First-Class ────────────────────────────────
      // Review agent is mandatory in orchestrated mode.
      setAgentActive(executionId, 'review');

      this.logMessage(executionId, 'coordinator', 'review', 'task', {
        instruction: 'Review all proposed changes',
        changes: allChanges,
      });

      const reviewTask: AgentTask = {
        executionId,
        instruction: `Review the following ${allChanges.length} proposed changes for: ${userRequest}`,
        context: {
          ...context,
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

      // Step 4: Persist and return
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

      return {
        agentType: 'project_manager',
        success: false,
        error: {
          code: 'EXECUTION_FAILED',
          message: String(error),
          agentType: 'project_manager',
          recoverable: false,
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
    domContext?: string
  ): Promise<AgentResult> {
    createExecution(executionId, projectId, userId, userRequest);
    updateExecutionStatus(executionId, 'in_progress');

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
      domContext: domContext || undefined,
    };

    try {
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

      return {
        agentType: 'project_manager',
        success: false,
        error: {
          code: 'SOLO_EXECUTION_FAILED',
          message: String(error),
          agentType: 'project_manager',
          recoverable: false,
        },
      };
    }
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
