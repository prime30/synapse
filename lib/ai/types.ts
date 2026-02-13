export type AIProvider = 'openai' | 'anthropic' | 'google';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionOptions {
  provider?: AIProvider;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface AICompletionResult {
  content: string;
  provider: AIProvider;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

/** Returned by stream() — provides both the text stream and a way to get usage after completion. */
export interface StreamResult {
  stream: ReadableStream<string>;
  /** Resolves when the stream closes with accumulated token usage. */
  getUsage: () => Promise<{ inputTokens: number; outputTokens: number }>;
}

export interface AIProviderInterface {
  readonly name: AIProvider;
  complete(
    messages: AIMessage[],
    options?: Partial<AICompletionOptions>
  ): Promise<AICompletionResult>;
  stream(
    messages: AIMessage[],
    options?: Partial<AICompletionOptions>
  ): Promise<StreamResult>;
}
