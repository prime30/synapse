/**
 * Multi-provider AI infrastructure for REQ-1.
 * Provides abstraction over OpenAI, Anthropic, and other AI providers.
 * Extend by implementing AIProviderInterface for new providers.
 */

export type {
  AIProvider,
  AIMessage,
  AICompletionOptions,
  AICompletionResult,
  AIProviderInterface,
} from './types';

export { getAIProvider } from './get-provider';
