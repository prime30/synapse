import { describe, it, expect } from 'vitest';
import { getAIProvider } from '@/lib/ai/get-provider';

describe('AI Provider Integration', () => {
  it('should create OpenAI provider with unified interface', () => {
    const provider = getAIProvider('openai');
    expect(provider.name).toBe('openai');
    expect(typeof provider.complete).toBe('function');
    expect(typeof provider.stream).toBe('function');
  });

  it('should create Anthropic provider with unified interface', () => {
    const provider = getAIProvider('anthropic');
    expect(provider.name).toBe('anthropic');
    expect(typeof provider.complete).toBe('function');
    expect(typeof provider.stream).toBe('function');
  });

  it('should default to OpenAI when no provider specified', () => {
    const provider = getAIProvider();
    expect(provider.name).toBe('openai');
  });

  it('should throw for unknown providers', () => {
    expect(() => getAIProvider('unknown' as 'openai' | 'anthropic')).toThrow(
      'Unknown AI provider: unknown'
    );
  });

  it('should return same instance for repeated calls (singleton)', () => {
    const provider1 = getAIProvider('openai');
    const provider2 = getAIProvider('openai');
    expect(provider1).toBe(provider2);
  });
});
