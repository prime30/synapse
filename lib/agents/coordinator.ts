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

/**
 * Message queue coordinator for multi-agent orchestration.
 * Routes messages between agents, manages execution lifecycle,
 * and handles parallel specialist execution.
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
   * 2. Specialists execute in parallel
   * 3. Review agent validates all changes
   * 4. Persist execution and return result
   */
  async execute(
    executionId: string,
    projectId: string,
    userId: string,
    userRequest: string,
    files: FileContext[],
    userPreferences: UserPreference[]
  ): Promise<AgentResult> {
    createExecution(executionId, projectId, userId, userRequest);
    updateExecutionStatus(executionId, 'in_progress');

    const context: AgentContext = {
      executionId,
      projectId,
      userId,
      userRequest,
      files,
      userPreferences,
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

      const pmResult = await this.pm.execute(pmTask);
      setAgentCompleted(executionId, 'project_manager');

      this.logMessage(executionId, 'project_manager', 'coordinator', 'result', {
        instruction: pmResult.analysis,
      });

      if (!pmResult.success || !pmResult.delegations?.length) {
        updateExecutionStatus(executionId, 'failed');
        await persistExecution(executionId);
        return pmResult;
      }

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
            userRequest: delegation.task,
          },
        };

        const result = await agent.execute(specialistTask);
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
      const allChanges: CodeChange[] = specialistResults.flatMap(
        (r) => r.changes ?? []
      );

      if (allChanges.length === 0) {
        updateExecutionStatus(executionId, 'completed');
        await persistExecution(executionId);
        return {
          agentType: 'project_manager',
          success: true,
          changes: [],
          analysis: 'No changes needed based on the analysis.',
        };
      }

      // Step 3: Review agent validates all changes
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

      const reviewResult = await this.reviewer.execute(reviewTask);
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
