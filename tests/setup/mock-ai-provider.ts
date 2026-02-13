/**
 * Mock AI Provider for testing.
 *
 * Configurable mock that implements AIProviderInterface with programmable
 * behavior for testing every error path in the AI chat pipeline.
 */

import type {
  AIProviderInterface,
  AIMessage,
  AICompletionOptions,
  AICompletionResult,
  StreamResult,
} from '@/lib/ai/types';
import { AIProviderError, formatSSEError } from '@/lib/ai/errors';
import type { AIErrorCode } from '@/lib/ai/errors';

type CompleteHandler = (
  messages: AIMessage[],
  options?: Partial<AICompletionOptions>
) => Promise<AICompletionResult>;

type StreamHandler = (
  messages: AIMessage[],
  options?: Partial<AICompletionOptions>
) => Promise<StreamResult>;

export interface MockAIProviderConfig {
  name?: string;
}

/**
 * Create a configurable mock AI provider for testing.
 *
 * Usage:
 *   const mock = createMockProvider();
 *   mock.succeedWith('Hello world');
 *   const result = await mock.provider.complete(messages);
 *   // result.content === 'Hello world'
 */
export function createMockProvider(config?: MockAIProviderConfig) {
  const providerName = config?.name ?? 'mock';

  let completeHandler: CompleteHandler;
  let streamHandler: StreamHandler;
  let completeCalls = 0;
  let streamCalls = 0;

  // Default: succeed with empty
  completeHandler = async () => ({
    content: '',
    provider: providerName as 'anthropic',
    model: 'mock-model',
    inputTokens: 10,
    outputTokens: 5,
  });

  streamHandler = async () => ({
    stream: new ReadableStream<string>({ start(c) { c.close(); } }),
    getUsage: async () => ({ inputTokens: 0, outputTokens: 0 }),
  });

  const provider: AIProviderInterface = {
    name: providerName as 'anthropic',

    async complete(messages, options) {
      completeCalls++;
      return completeHandler(messages, options);
    },

    async stream(messages, options) {
      streamCalls++;
      return streamHandler(messages, options);
    },
  };

  return {
    provider,

    /** Return the number of times complete() was called. */
    getCompleteCalls: () => completeCalls,

    /** Return the number of times stream() was called. */
    getStreamCalls: () => streamCalls,

    /** Reset call counters. */
    resetCalls: () => {
      completeCalls = 0;
      streamCalls = 0;
    },

    // ── Configuration methods ──────────────────────────────────────────

    /** Configure complete() to return the given content. */
    succeedWith(content: string, model = 'mock-model') {
      completeHandler = async () => ({
        content,
        provider: providerName as 'anthropic',
        model,
        inputTokens: 10,
        outputTokens: Math.ceil(content.length / 4),
      });
    },

    /** Configure complete() to throw an AIProviderError with the given code. */
    failWith(code: AIErrorCode, message = 'Mock error') {
      completeHandler = async () => {
        throw new AIProviderError(code, message, providerName);
      };
    },

    /** Configure complete() to throw a generic Error (non-AIProviderError). */
    failWithGeneric(message = 'Generic mock error') {
      completeHandler = async () => {
        throw new Error(message);
      };
    },

    /** Configure complete() to return an empty string (empty response). */
    returnEmpty() {
      completeHandler = async () => ({
        content: '',
        provider: providerName as 'anthropic',
        model: 'mock-model',
        inputTokens: 10,
        outputTokens: 0,
      });
    },

    /** Configure complete() to never resolve (for timeout testing). */
    timeout() {
      completeHandler = () =>
        new Promise<AICompletionResult>(() => {
          // Never resolves — simulates a hung request
        });
    },

    /**
     * Configure complete() to fail N times then succeed.
     * Useful for testing retry logic.
     */
    failThenSucceed(
      failCount: number,
      failCode: AIErrorCode,
      successContent: string
    ) {
      let callCount = 0;
      completeHandler = async () => {
        callCount++;
        if (callCount <= failCount) {
          throw new AIProviderError(failCode, `Fail #${callCount}`, providerName);
        }
        return {
          content: successContent,
          provider: providerName as 'anthropic',
          model: 'mock-model',
          inputTokens: 10,
          outputTokens: Math.ceil(successContent.length / 4),
        };
      };
    },

    /** Configure stream() to yield the given chunks. */
    streamChunks(chunks: string[]) {
      streamHandler = async () => {
        const stream = new ReadableStream<string>({
          async start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(chunk);
            }
            controller.close();
          },
        });
        const totalContent = chunks.join('');
        return {
          stream,
          getUsage: async () => ({
            inputTokens: 10,
            outputTokens: Math.ceil(totalContent.length / 4),
          }),
        };
      };
    },

    /** Configure stream() to yield some chunks then inject an error. */
    failStreamAfter(chunks: string[], errorCode: AIErrorCode, errorMessage = 'Stream error') {
      streamHandler = async () => {
        const stream = new ReadableStream<string>({
          async start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(chunk);
            }
            // Inject SSE-formatted error event
            const err = new AIProviderError(errorCode, errorMessage, providerName);
            controller.enqueue(formatSSEError(err));
            controller.close();
          },
        });
        return {
          stream,
          getUsage: async () => ({ inputTokens: 10, outputTokens: 5 }),
        };
      };
    },

    /** Configure stream() to throw before returning the stream. */
    failStreamImmediately(code: AIErrorCode, message = 'Stream failed to start') {
      streamHandler = async () => {
        throw new AIProviderError(code, message, providerName);
      };
    },

    /** Set a custom complete handler. */
    setCompleteHandler(handler: CompleteHandler) {
      completeHandler = handler;
    },

    /** Set a custom stream handler. */
    setStreamHandler(handler: StreamHandler) {
      streamHandler = handler;
    },
  };
}
