import type { AgentType, AgentTask, AgentResult, AgentError } from '@/lib/types/agent';
import type { AIProviderInterface, AIMessage } from '@/lib/ai/types';
import { getAIProvider } from '@/lib/ai/get-provider';
import { AIProviderError, isRetryable } from '@/lib/ai/errors';
import {
  resolveModel,
  getProviderForModel,
  type AIAction,
  type AgentRole,
  type ProviderName,
} from './model-router';

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
function toAIProvider(provider: ProviderName): 'anthropic' | 'openai' | 'google' {
  return provider; // ProviderName and AIProvider are now the same union
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
  private currentModel: string | undefined;

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

    // Resolve model and set up the correct provider
    const model = resolveModel({
      action: options?.action,
      userOverride: options?.model,
      agentRole: this.agentRole,
    });

    const providerName = getProviderForModel(model);
    this.provider = getAIProvider(toAIProvider(providerName));
    this.currentModel = model;

    try {
      return await this.executeWithRetry(task);
    } catch {
      // Fallback to alternative provider
      const fallbackProvider = this.getFallbackProvider(providerName);
      this.provider = getAIProvider(toAIProvider(fallbackProvider));
      this.currentModel = undefined; // let the provider use its default model

      try {
        return await this.executeSingle(task);
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

  private async executeWithRetry(task: AgentTask): Promise<AgentResult> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await this.executeSingle(task);
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

    // Convert to the AIMessage[] format expected by the unified provider
    const messages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];

    const result = await this.withTimeout(
      this.provider.complete(messages, {
        model: this.currentModel,
        maxTokens: 4096,
      }),
      this.retryConfig.timeoutMs
    );

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
