import type { AgentType, AgentTask, AgentResult, AgentError } from '@/lib/types/agent';
import type { AIProviderClient } from './providers';
import { createAnthropicClient, createOpenAIClient } from './providers';

export interface RetryConfig {
  maxRetries: number;
  timeoutMs: number;
  retryDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 1,
  timeoutMs: 30000,
  retryDelayMs: 1000,
};

/**
 * Base agent class with retry logic, timeout handling, and provider fallback.
 * All specialized agents extend this class.
 */
export abstract class Agent {
  readonly type: AgentType;
  readonly provider: 'anthropic' | 'openai';
  protected client: AIProviderClient;
  protected retryConfig: RetryConfig;

  constructor(
    type: AgentType,
    provider: 'anthropic' | 'openai',
    retryConfig?: Partial<RetryConfig>
  ) {
    this.type = type;
    this.provider = provider;
    this.client = provider === 'anthropic'
      ? createAnthropicClient()
      : createOpenAIClient();
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /** Return the system prompt for this agent */
  abstract getSystemPrompt(): string;

  /** Format the task into a prompt string for the AI provider */
  abstract formatPrompt(task: AgentTask): string;

  /** Parse the raw AI response into an AgentResult */
  abstract parseResponse(raw: string, task: AgentTask): AgentResult;

  /** Execute the agent with retry and fallback logic */
  async execute(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      return await this.executeWithRetry(task);
    } catch {
      // Fallback to alternative provider
      const fallbackProvider = this.provider === 'anthropic' ? 'openai' : 'anthropic';
      this.client = fallbackProvider === 'anthropic'
        ? createAnthropicClient()
        : createOpenAIClient();

      try {
        return await this.executeSingle(task);
      } catch (fallbackError) {
        const elapsed = Date.now() - startTime;
        const agentError: AgentError = {
          code: 'AGENT_FAILED',
          message: `Agent ${this.type} failed after retry and fallback (${elapsed}ms): ${String(fallbackError)}`,
          agentType: this.type,
          recoverable: false,
        };
        return {
          agentType: this.type,
          success: false,
          error: agentError,
        };
      }
    }
  }

  private async executeWithRetry(task: AgentTask): Promise<AgentResult> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await this.executeSingle(task);
      } catch (error) {
        lastError = error;
        const message = String(error);

        // Wait before retry on rate limit
        if (message.includes('RATE_LIMITED')) {
          await this.delay(60000);
        } else if (attempt < this.retryConfig.maxRetries) {
          await this.delay(this.retryConfig.retryDelayMs);
        }
      }
    }

    throw lastError;
  }

  private async executeSingle(task: AgentTask): Promise<AgentResult> {
    const prompt = this.formatPrompt(task);
    const systemPrompt = this.getSystemPrompt();

    const raw = await this.withTimeout(
      this.client.generateResponse(prompt, systemPrompt, task.context),
      this.retryConfig.timeoutMs
    );

    return this.parseResponse(raw, task);
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Agent ${this.type} timed out after ${ms}ms`)),
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
