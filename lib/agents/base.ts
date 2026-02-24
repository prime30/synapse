import type { AgentType, AgentTask, AgentResult, AgentError } from '@/lib/types/agent';
import type { AIProvider, AIProviderInterface, AIMessage, ToolDefinition, ToolResult as AIToolResult, AIToolCompletionResult, AICompletionOptions, AIToolProviderInterface } from '@/lib/ai/types';
import { getAIProvider } from '@/lib/ai/get-provider';
import { AIProviderError, isRetryable } from '@/lib/ai/errors';
import { AI_FEATURES } from '@/lib/ai/feature-flags';
import { canMakeRequest, recordSuccess, recordFailure } from '@/lib/ai/circuit-breaker';
import {
  resolveModel,
  getProviderForModel,
  ACTION_EFFORT,
  THINKING_ACTIONS,
  type AIAction,
  type AgentRole,
  type ProviderName,
} from './model-router';

/** Type guard: does this provider support completeWithTools? */
export function isToolProvider(provider: AIProviderInterface): provider is AIToolProviderInterface {
  return 'completeWithTools' in provider && typeof (provider as AIToolProviderInterface).completeWithTools === 'function';
}
import { enforceRequestBudget, getAgentBudget } from '@/lib/ai/request-budget';
import { estimateTokens } from '@/lib/ai/token-counter';
import { AGENT_TOOLS } from './tools/definitions';
import { executeToolCall, type ToolExecutorContext } from './tools/tool-executor';

export interface RetryConfig {
  maxRetries: number;
  timeoutMs: number;
  retryDelayMs: number;
  rateLimitDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 1,
  timeoutMs: 120_000,        // 2 minutes (up from 30s)
  retryDelayMs: 1000,
  rateLimitDelayMs: 15_000,  // 15s wait on rate limit (down from 60s)
};

/** Options passed to Agent.execute() to control model selection. */
export interface AgentExecuteOptions {
  /** The AI action being performed. */
  action?: AIAction;
  /** User's preferred model override. */
  model?: string;
  /** JSON Schema for structured output (Phase 5). */
  outputSchema?: Record<string, unknown>;
  /** Routing tier for adaptive budget/model escalation (EPIC V5). */
  tier?: 'TRIVIAL' | 'SIMPLE' | 'COMPLEX' | 'ARCHITECTURAL';
  /**
   * When provided, the agent streams LLM output token-by-token instead of
   * waiting for the full response. Each chunk is forwarded to the callback.
   */
  onReasoningChunk?: (chunk: string) => void;
}

/** Accumulated token usage from the last AI call. */
export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/**
 * Maps a ProviderName (from model-router) to the AIProvider type used by get-provider.
 * The new provider system supports 'anthropic' | 'openai' | 'google'.
 */
function toAIProvider(provider: ProviderName): AIProvider {
  return provider;
}

/**
 * Base agent class with retry logic, timeout handling, and multi-provider support.
 * All specialized agents extend this class.
 *
 * B0a changes:
 * - Migrated from old AIProviderClient to unified AIProviderInterface
 * - Token usage tracking via lastUsage
 * - Uses getAIProvider() factory for provider instantiation
 */
export abstract class Agent {
  readonly type: AgentType;
  readonly agentRole: AgentRole;
  readonly defaultProvider: ProviderName;
  protected provider: AIProviderInterface;
  protected retryConfig: RetryConfig;

  /** The model string to use for the current request. */
  protected currentModel: string | undefined;

  /** The current action (for thinking/effort routing). */
  protected currentAction: AIAction | undefined;

  /** The current output schema (for structured outputs). */
  protected currentOutputSchema: Record<string, unknown> | undefined;

  /** Streaming reasoning callback set per-execute. */
  private _onReasoningChunk: ((chunk: string) => void) | undefined;

  /** Token usage from the most recent AI call. */
  private _lastUsage: AgentUsage | null = null;

  constructor(
    type: AgentType,
    provider: ProviderName,
    retryConfig?: Partial<RetryConfig>
  ) {
    this.type = type;
    this.agentRole = type as AgentRole;
    this.defaultProvider = provider;
    this.provider = getAIProvider(toAIProvider(provider));
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /** Return the system prompt for this agent */
  abstract getSystemPrompt(): string;

  /** Format the task into a prompt string for the AI provider */
  abstract formatPrompt(task: AgentTask): string;

  /** Parse the raw AI response into an AgentResult */
  abstract parseResponse(raw: string, task: AgentTask): AgentResult;

  /**
   * Execute the agent with retry and fallback logic.
   *
   * Model resolution:
   *   1. options.action → MODEL_MAP[action]
   *   2. options.model  → user preference
   *   3. this.agentRole → AGENT_DEFAULTS[role]
   *   4. SYSTEM_DEFAULT_MODEL
   */
  async execute(task: AgentTask, options?: AgentExecuteOptions): Promise<AgentResult> {
    const startTime = Date.now();

    // Resolve model and set up the correct provider (with tier-aware escalation)
    const model = resolveModel({
      action: options?.action,
      userOverride: options?.model,
      agentRole: this.agentRole,
      tier: options?.tier,
    });

    const providerName = getProviderForModel(model);
    this.provider = getAIProvider(toAIProvider(providerName));
    this.currentModel = model;
    this.currentAction = options?.action;
    this.currentOutputSchema = options?.outputSchema;
    this._onReasoningChunk = options?.onReasoningChunk;

    try {
      return await this.executeWithRetry(task);
    } catch {
      // Fallback to alternative provider
      const fallbackProvider = this.getFallbackProvider(providerName);
      this.provider = getAIProvider(toAIProvider(fallbackProvider));
      this.currentModel = undefined; // let the provider use its default model

      try {
        return this._onReasoningChunk
          ? await this.executeSingleStreaming(task, this._onReasoningChunk)
          : await this.executeSingle(task);
      } catch (fallbackError) {
        const elapsed = Date.now() - startTime;
        const isProviderErr = fallbackError instanceof AIProviderError;
        const agentError: AgentError = {
          code: isProviderErr ? fallbackError.code : 'AGENT_FAILED',
          message: isProviderErr
            ? fallbackError.userMessage
            : `Agent ${this.type} failed after retry and fallback (${elapsed}ms): ${String(fallbackError)}`,
          agentType: this.type,
          recoverable: isProviderErr ? fallbackError.retryable : false,
        };
        return {
          agentType: this.type,
          success: false,
          error: agentError,
        };
      }
    }
  }

  /** Get token usage from the most recent AI call. */
  getLastUsage(): AgentUsage | null {
    return this._lastUsage;
  }

  /**
   * Execute with explicit user and system prompts (for solo mode).
   * Handles model resolution, budget enforcement, usage tracking, and
   * empty-response validation — matching the full `executeSingle` contract.
   * When `options.onReasoningChunk` is set, streams tokens via the callback.
   */
  async executeDirectPrompt(
    userPrompt: string,
    systemPrompt: string,
    options?: AgentExecuteOptions
  ): Promise<string> {
    const model = resolveModel({
      action: options?.action,
      userOverride: options?.model,
      agentRole: this.agentRole,
      tier: options?.tier,
    });
    const providerName = getProviderForModel(model);
    this.provider = getAIProvider(toAIProvider(providerName));
    this.currentModel = model;

    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const agentBudget = getAgentBudget(this.type);
    const budgeted = enforceRequestBudget(messages, agentBudget.total);
    const completionOpts: Partial<AICompletionOptions> = { model: this.currentModel, maxTokens: 4096 };

    // Stream path: forward tokens to the callback as they arrive
    if (options?.onReasoningChunk) {
      const onChunk = options.onReasoningChunk;
      const streamResult = await this.withTimeout(
        this.provider.stream(budgeted.messages, completionOpts),
        this.retryConfig.timeoutMs
      );

      let fullText = '';
      const reader = streamResult.stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += value;
          onChunk(value);
        }
      } finally {
        reader.releaseLock();
      }

      const usage = await streamResult.getUsage();
      this._lastUsage = {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        model: this.currentModel || providerName,
      };

      if (!fullText || fullText.trim().length === 0) {
        throw new AIProviderError('EMPTY_RESPONSE', `Agent ${this.type} received empty streaming response from ${providerName}`, providerName);
      }
      return fullText;
    }

    // Non-streaming path (original)
    const result = await this.withTimeout(
      this.provider.complete(budgeted.messages, completionOpts),
      this.retryConfig.timeoutMs
    );

    this._lastUsage = {
      inputTokens: result.inputTokens ?? 0,
      outputTokens: result.outputTokens ?? 0,
      model: result.model,
    };

    if (!result.content || result.content.trim().length === 0) {
      throw new AIProviderError(
        'EMPTY_RESPONSE',
        `Agent ${this.type} received empty response from ${result.provider}`,
        result.provider
      );
    }

    return result.content;
  }

  /**
   * Execute the agent with tool-calling loop support.
   * The agent can request tools (read_file, search_files, etc.) and iterate
   * up to maxIterations times before producing a final response.
   */
  async executeWithTools(
    task: AgentTask,
    toolContext: ToolExecutorContext,
    options?: AgentExecuteOptions & { maxIterations?: number; onToolUse?: (toolName: string) => void },
  ): Promise<AgentResult> {
    const maxIterations = options?.maxIterations ?? 10;

    // If provider doesn't support tools, fall back to regular execution
    if (!isToolProvider(this.provider)) {
      console.log(`[Agent:${this.agentType}] Provider doesn't support tools (pre-resolve), falling back to execute()`);
      return this.execute(task, options);
    }

    // Resolve model and set up the correct provider (with tier-aware escalation)
    const model = resolveModel({
      action: options?.action,
      userOverride: options?.model,
      agentRole: this.agentRole,
      tier: options?.tier,
    });
    const providerName = getProviderForModel(model);
    this.provider = getAIProvider(toAIProvider(providerName));
    this.currentModel = model;

    // Re-check after provider swap
    if (!isToolProvider(this.provider)) {
      console.log(`[Agent:${this.agentType}] Provider doesn't support tools (post-resolve, model=${model}), falling back to execute()`);
      return this.execute(task, options);
    }
    console.log(`[Agent:${this.agentType}] Using executeWithTools with model=${model}, maxIterations=${maxIterations}`);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d09cca'},body:JSON.stringify({sessionId:'d09cca',location:'base.ts:executeWithTools-start',message:'executeWithTools active',data:{agentType:this.agentType,model,maxIterations,providerType:this.provider?.constructor?.name},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion

    const toolProvider = this.provider;

    const prompt = this.formatPrompt(task);
    const systemPrompt = this.getSystemPrompt();

    const systemMsg: AIMessage = { role: 'system', content: systemPrompt };
    if (AI_FEATURES.promptCaching) {
      systemMsg.cacheControl = { type: 'ephemeral' };
    }
    const messages: AIMessage[] = [
      systemMsg,
      { role: 'user', content: prompt },
    ];

    for (let i = 0; i < maxIterations; i++) {
      const result = await toolProvider.completeWithTools(
        messages,
        AGENT_TOOLS,
        { model: this.currentModel, maxTokens: 4096 },
      );

      if (result.stopReason === 'end_turn' || !result.toolCalls?.length) {
        console.log(`[Agent:${this.agentType}] Loop ended at iteration ${i}: stopReason=${result.stopReason}, toolCalls=${result.toolCalls?.length??0}, contentLen=${result.content?.length??0}`);
        return this.parseResponse(result.content, task);
      }

      // Execute tool calls
      const toolResults: AIToolResult[] = [];
      for (const toolCall of result.toolCalls) {
        console.log(`[Agent:${this.agentType}] iter=${i} tool=${toolCall.name} input_keys=${Object.keys(toolCall.input??{}).join(',')}`);
        options?.onToolUse?.(toolCall.name);
        const toolResult = await Promise.resolve(executeToolCall(toolCall, toolContext));
        console.log(`[Agent:${this.agentType}] iter=${i} tool=${toolCall.name} error=${toolResult.is_error??false} result=${(toolResult.content??'').slice(0,150)}`);
        toolResults.push(toolResult);
      }

      // Append assistant message with tool calls and tool results
      messages.push({
        role: 'assistant',
        content: result.content || '',
        __toolCalls: (result as AIToolCompletionResult & { __rawContentBlocks?: unknown }).__rawContentBlocks,
      } as AIMessage & { __toolCalls: unknown });

      messages.push({
        role: 'user',
        content: '',
        __toolResults: toolResults.map(r => ({
          type: 'tool_result',
          tool_use_id: r.tool_use_id,
          content: r.content,
          is_error: r.is_error,
        })),
      } as AIMessage & { __toolResults: unknown });
    }

    // Max iterations reached -- try to parse whatever we have
    console.warn(`[Agent:${this.type}] Tool loop reached max iterations (${maxIterations})`);
    const lastAssistant = messages.filter(m => m.role === 'assistant').pop();
    if (lastAssistant?.content) {
      return this.parseResponse(lastAssistant.content, task);
    }

    return {
      agentType: this.type,
      success: false,
      error: {
        code: 'MAX_ITERATIONS',
        message: `Agent reached maximum tool iterations (${maxIterations})`,
        agentType: this.type,
        recoverable: false,
      },
    };
  }

  private async executeWithRetry(task: AgentTask): Promise<AgentResult> {
    let lastError: unknown;
    const runOnce = (t: AgentTask) =>
      this._onReasoningChunk
        ? this.executeSingleStreaming(t, this._onReasoningChunk)
        : this.executeSingle(t);

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await runOnce(task);
      } catch (error) {
        lastError = error;

        // Structured retry decisions based on error code
        if (error instanceof AIProviderError) {
          // Don't retry non-retryable errors (AUTH, CONTENT_FILTERED, etc.)
          if (!isRetryable(error.code)) {
            throw error;
          }

          // Rate limited: longer wait
          if (error.code === 'RATE_LIMITED') {
            await this.delay(this.retryConfig.rateLimitDelayMs);
            continue;
          }

          // Retryable: short wait (NETWORK_ERROR, PROVIDER_ERROR, EMPTY_RESPONSE)
          if (attempt < this.retryConfig.maxRetries) {
            await this.delay(this.retryConfig.retryDelayMs);
            continue;
          }
        } else {
          // Legacy string-based fallback for non-AIProviderError
          const message = String(error);
          if (message.includes('RATE_LIMITED')) {
            await this.delay(this.retryConfig.rateLimitDelayMs);
            continue;
          }
          if (attempt < this.retryConfig.maxRetries) {
            await this.delay(this.retryConfig.retryDelayMs);
            continue;
          }
        }
      }
    }

    throw lastError;
  }

  private async executeSingle(task: AgentTask): Promise<AgentResult> {
    const prompt = this.formatPrompt(task);
    const systemPrompt = this.getSystemPrompt();

    // ── Circuit breaker check ──────────────────────────────────────────
    // If the provider's circuit is open, skip directly to throw so the
    // caller falls back to an alternative provider without waiting for
    // a timeout.
    const providerName = this.provider.name;
    const circuitStatus = await canMakeRequest(providerName);
    if (circuitStatus === 'blocked') {
      throw new AIProviderError(
        'PROVIDER_ERROR',
        `Circuit breaker open for ${providerName} — skipping to fallback`,
        providerName
      );
    }

    // Convert to the AIMessage[] format expected by the unified provider
    const systemMsg: AIMessage = { role: 'system', content: systemPrompt };
    if (AI_FEATURES.promptCaching) {
      systemMsg.cacheControl = { type: 'ephemeral' };
    }
    const messages: AIMessage[] = [
      systemMsg,
      { role: 'user', content: prompt },
    ];

    // Safety net: enforce total budget before sending to provider
    const agentBudget = getAgentBudget(this.type);
    const beforeTokens = estimateTokens(messages.map(m => m.content).join(''));
    const budgeted = enforceRequestBudget(messages, agentBudget.total);
    console.log(
      `[Agent:${this.type}] Budget: before=${beforeTokens}, after=${budgeted.totalTokens}, ` +
      `truncated=${budgeted.truncated}, truncatedCount=${budgeted.truncatedCount}, ` +
      `budgetTruncated=${budgeted.budgetTruncated}, limit=${agentBudget.total}`
    );

    // Build completion options with thinking/effort when applicable
    const completionOpts: Partial<AICompletionOptions> = {
      model: this.currentModel,
      maxTokens: 4096,
    };

    // Enable thinking for actions that benefit from deep reasoning
    if (AI_FEATURES.adaptiveThinking && this.currentAction && THINKING_ACTIONS.has(this.currentAction)) {
      completionOpts.thinking = { type: 'adaptive' };
      completionOpts.effort = ACTION_EFFORT[this.currentAction];
    }

    // Add structured output schema if provided
    if (AI_FEATURES.structuredOutputs && this.currentOutputSchema) {
      completionOpts.outputConfig = {
        format: { type: 'json_schema', schema: this.currentOutputSchema },
      };
    }

    try {
      const result = await this.withTimeout(
        this.provider.complete(budgeted.messages, completionOpts),
        this.retryConfig.timeoutMs
      );

      // Record success with circuit breaker
      recordSuccess(providerName).catch(() => {});

      // Store token usage
      this._lastUsage = {
        inputTokens: result.inputTokens ?? 0,
        outputTokens: result.outputTokens ?? 0,
        model: result.model,
      };

      // Validate non-empty response
      if (!result.content || result.content.trim().length === 0) {
        throw new AIProviderError(
          'EMPTY_RESPONSE',
          `Agent ${this.type} received empty response from ${result.provider}`,
          result.provider
        );
      }

      return this.parseResponse(result.content, task);
    } catch (error) {
      // Record failure with circuit breaker
      if (error instanceof AIProviderError) {
        recordFailure(providerName, error.code).catch(() => {});
      }
      throw error;
    }
  }

  /**
   * Streaming variant of executeSingle: uses provider.stream() to forward
   * LLM output tokens in real time via onChunk, then parses the full text.
   */
  private async executeSingleStreaming(
    task: AgentTask,
    onChunk: (chunk: string) => void,
  ): Promise<AgentResult> {
    const prompt = this.formatPrompt(task);
    const systemPrompt = this.getSystemPrompt();

    const providerName = this.provider.name;
    const circuitStatus = await canMakeRequest(providerName);
    if (circuitStatus === 'blocked') {
      throw new AIProviderError(
        'PROVIDER_ERROR',
        `Circuit breaker open for ${providerName} — skipping to fallback`,
        providerName
      );
    }

    const systemMsg: AIMessage = { role: 'system', content: systemPrompt };
    if (AI_FEATURES.promptCaching) {
      systemMsg.cacheControl = { type: 'ephemeral' };
    }
    const messages: AIMessage[] = [systemMsg, { role: 'user', content: prompt }];

    const agentBudget = getAgentBudget(this.type);
    const budgeted = enforceRequestBudget(messages, agentBudget.total);

    const completionOpts: Partial<AICompletionOptions> = {
      model: this.currentModel,
      maxTokens: 4096,
    };
    if (AI_FEATURES.adaptiveThinking && this.currentAction && THINKING_ACTIONS.has(this.currentAction)) {
      completionOpts.thinking = { type: 'adaptive' };
      completionOpts.effort = ACTION_EFFORT[this.currentAction];
    }
    if (AI_FEATURES.structuredOutputs && this.currentOutputSchema) {
      completionOpts.outputConfig = {
        format: { type: 'json_schema', schema: this.currentOutputSchema },
      };
    }

    try {
      const streamResult = await this.withTimeout(
        this.provider.stream(budgeted.messages, completionOpts),
        this.retryConfig.timeoutMs
      );

      let fullText = '';
      const reader = streamResult.stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += value;
          onChunk(value);
        }
      } finally {
        reader.releaseLock();
      }

      recordSuccess(providerName).catch(() => {});

      const usage = await streamResult.getUsage();
      this._lastUsage = {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        model: this.currentModel || providerName,
      };

      if (!fullText || fullText.trim().length === 0) {
        throw new AIProviderError(
          'EMPTY_RESPONSE',
          `Agent ${this.type} received empty streaming response from ${providerName}`,
          providerName
        );
      }

      return this.parseResponse(fullText, task);
    } catch (error) {
      if (error instanceof AIProviderError) {
        recordFailure(providerName, error.code).catch(() => {});
      }
      throw error;
    }
  }

  /** Get a fallback provider when the primary fails. */
  private getFallbackProvider(primary: ProviderName): ProviderName {
    switch (primary) {
      case 'anthropic': return 'openai';
      case 'openai': return 'anthropic';
      case 'google': return 'anthropic';
      default: return 'anthropic';
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new AIProviderError(
          'TIMEOUT',
          `Agent ${this.type} timed out after ${ms}ms`,
          this.provider.name
        )),
        ms
      );
      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
