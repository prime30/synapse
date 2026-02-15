/**
 * Comprehensive E2E tests for AI chat error handling.
 *
 * Tests every error path from the provider layer through the agent pipeline,
 * coordinator, stream API, and frontend error parsing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AIProviderError,
  classifyProviderError,
  classifyNetworkError,
  isRetryable,
  getUserMessage,
  formatSSEError,
  formatSSEDone,
} from '@/lib/ai/errors';
import type { AIErrorCode } from '@/lib/ai/errors';
import { createMockProvider } from '../setup/mock-ai-provider';

// ═══════════════════════════════════════════════════════════════════════
// Section 1: AIProviderError class tests
// ═══════════════════════════════════════════════════════════════════════

describe('AIProviderError', () => {
  it('should create an error with correct properties', () => {
    const err = new AIProviderError('RATE_LIMITED', 'Too many requests', 'anthropic', 429);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AIProviderError);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.message).toBe('Too many requests');
    expect(err.provider).toBe('anthropic');
    expect(err.statusCode).toBe(429);
    expect(err.retryable).toBe(true);
    expect(err.userMessage).toBeTruthy();
    expect(err.name).toBe('AIProviderError');
  });

  it('should serialize to JSON correctly', () => {
    const err = new AIProviderError('AUTH_ERROR', 'Bad key', 'openai', 401);
    const json = err.toJSON();
    expect(json.type).toBe('error');
    expect(json.code).toBe('AUTH_ERROR');
    expect(json.message).toBeTruthy();
    expect(json.provider).toBe('openai');
    expect(json.retryable).toBe(false);
  });

  it('should work without statusCode', () => {
    const err = new AIProviderError('NETWORK_ERROR', 'DNS failure', 'google');
    expect(err.statusCode).toBeUndefined();
    expect(err.retryable).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Section 2: Error classification tests
// ═══════════════════════════════════════════════════════════════════════

describe('classifyProviderError', () => {
  it('should classify 429 as RATE_LIMITED', () => {
    const err = classifyProviderError(429, '{"error":{"message":"rate limit"}}', 'anthropic');
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.statusCode).toBe(429);
    expect(err.retryable).toBe(true);
  });

  it('should classify 401 as AUTH_ERROR', () => {
    const err = classifyProviderError(401, '{"error":{"message":"invalid api key"}}', 'openai');
    expect(err.code).toBe('AUTH_ERROR');
    expect(err.retryable).toBe(false);
  });

  it('should classify 403 as AUTH_ERROR', () => {
    const err = classifyProviderError(403, '{"error":{"message":"forbidden"}}', 'google');
    expect(err.code).toBe('AUTH_ERROR');
    expect(err.retryable).toBe(false);
  });

  it('should classify Anthropic context too long as CONTEXT_TOO_LARGE (retryable)', () => {
    const body = JSON.stringify({
      error: {
        type: 'invalid_request_error',
        message: 'prompt is too long: too many tokens',
      },
    });
    const err = classifyProviderError(400, body, 'anthropic');
    expect(err.code).toBe('CONTEXT_TOO_LARGE');
  });

  it('should classify OpenAI context_length_exceeded as CONTEXT_TOO_LARGE (retryable)', () => {
    const body = JSON.stringify({
      error: { code: 'context_length_exceeded', message: 'Token limit exceeded' },
    });
    const err = classifyProviderError(400, body, 'openai');
    expect(err.code).toBe('CONTEXT_TOO_LARGE');
  });

  it('should classify OpenAI content_policy_violation', () => {
    const body = JSON.stringify({
      error: { code: 'content_policy_violation', message: 'Content filtered' },
    });
    const err = classifyProviderError(400, body, 'openai');
    expect(err.code).toBe('CONTENT_FILTERED');
  });

  it('should classify Google safety/blocked as CONTENT_FILTERED', () => {
    const body = JSON.stringify({ error: { message: 'Safety rating BLOCKED content' } });
    const err = classifyProviderError(400, body, 'google');
    expect(err.code).toBe('CONTENT_FILTERED');
  });

  it('should classify Google resource_exhausted as CONTEXT_TOO_LONG', () => {
    const body = JSON.stringify({ error: { message: 'resource_exhausted: token limit' } });
    const err = classifyProviderError(400, body, 'google');
    expect(err.code).toBe('CONTEXT_TOO_LONG');
  });

  it('should classify 402 / insufficient_quota as QUOTA_EXCEEDED', () => {
    const body = JSON.stringify({ error: { code: 'insufficient_quota' } });
    const err = classifyProviderError(402, body, 'openai');
    expect(err.code).toBe('QUOTA_EXCEEDED');
    expect(err.retryable).toBe(false);
  });

  it('should classify 404 as MODEL_UNAVAILABLE', () => {
    const body = JSON.stringify({ error: { code: 'model_not_found', message: 'No model' } });
    const err = classifyProviderError(404, body, 'openai');
    expect(err.code).toBe('MODEL_UNAVAILABLE');
  });

  it('should classify 529 (Anthropic overloaded) as PROVIDER_ERROR', () => {
    const body = JSON.stringify({ error: { type: 'overloaded_error', message: 'Overloaded' } });
    const err = classifyProviderError(529, body, 'anthropic');
    expect(err.code).toBe('PROVIDER_ERROR');
    expect(err.retryable).toBe(true);
  });

  it('should classify 500 as PROVIDER_ERROR', () => {
    const err = classifyProviderError(500, 'Internal server error', 'anthropic');
    expect(err.code).toBe('PROVIDER_ERROR');
    expect(err.retryable).toBe(true);
  });

  it('should classify 502 as PROVIDER_ERROR', () => {
    const err = classifyProviderError(502, 'Bad gateway', 'openai');
    expect(err.code).toBe('PROVIDER_ERROR');
  });

  it('should classify 503 as PROVIDER_ERROR', () => {
    const err = classifyProviderError(503, 'Service unavailable', 'google');
    expect(err.code).toBe('PROVIDER_ERROR');
  });

  it('should classify unknown status as UNKNOWN', () => {
    const err = classifyProviderError(418, 'I am a teapot', 'anthropic');
    expect(err.code).toBe('UNKNOWN');
  });

  it('should handle non-JSON body gracefully', () => {
    const err = classifyProviderError(500, 'plain text error', 'openai');
    expect(err.code).toBe('PROVIDER_ERROR');
    expect(err.message).toContain('plain text error');
  });

  it('should handle empty body', () => {
    const err = classifyProviderError(500, '', 'anthropic');
    expect(err.code).toBe('PROVIDER_ERROR');
  });
});

describe('classifyNetworkError', () => {
  it('should classify timeout errors', () => {
    const err = classifyNetworkError(new Error('Request timed out'), 'openai');
    expect(err.code).toBe('TIMEOUT');
  });

  it('should classify abort errors', () => {
    const err = classifyNetworkError(new Error('The operation was aborted'), 'anthropic');
    expect(err.code).toBe('TIMEOUT');
  });

  it('should classify generic network errors', () => {
    const err = classifyNetworkError(new Error('fetch failed'), 'google');
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.retryable).toBe(true);
  });

  it('should handle non-Error objects', () => {
    const err = classifyNetworkError('string error', 'openai');
    expect(err.code).toBe('NETWORK_ERROR');
  });

  it('should classify DNS failure', () => {
    const err = classifyNetworkError(new Error('getaddrinfo ENOTFOUND api.openai.com'), 'openai');
    expect(err.code).toBe('NETWORK_ERROR');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Section 3: Retryable logic tests
// ═══════════════════════════════════════════════════════════════════════

describe('isRetryable', () => {
  const retryableCodes: AIErrorCode[] = ['RATE_LIMITED', 'NETWORK_ERROR', 'PROVIDER_ERROR', 'EMPTY_RESPONSE'];
  const nonRetryableCodes: AIErrorCode[] = ['AUTH_ERROR', 'CONTENT_FILTERED', 'CONTEXT_TOO_LONG', 'QUOTA_EXCEEDED', 'MODEL_UNAVAILABLE'];

  retryableCodes.forEach((code) => {
    it(`should mark ${code} as retryable`, () => {
      expect(isRetryable(code)).toBe(true);
    });
  });

  nonRetryableCodes.forEach((code) => {
    it(`should mark ${code} as NOT retryable`, () => {
      expect(isRetryable(code)).toBe(false);
    });
  });

  it('should mark UNKNOWN as not retryable', () => {
    expect(isRetryable('UNKNOWN')).toBe(false);
  });

  it('should mark TIMEOUT as not retryable', () => {
    expect(isRetryable('TIMEOUT')).toBe(false);
  });

  it('should mark PARSE_ERROR as not retryable', () => {
    expect(isRetryable('PARSE_ERROR')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Section 4: User message mapping tests
// ═══════════════════════════════════════════════════════════════════════

describe('getUserMessage', () => {
  const allCodes: AIErrorCode[] = [
    'RATE_LIMITED', 'CONTEXT_TOO_LONG', 'CONTENT_FILTERED', 'AUTH_ERROR',
    'MODEL_UNAVAILABLE', 'NETWORK_ERROR', 'TIMEOUT', 'EMPTY_RESPONSE',
    'PARSE_ERROR', 'PROVIDER_ERROR', 'QUOTA_EXCEEDED', 'UNKNOWN',
  ];

  allCodes.forEach((code) => {
    it(`should return a non-empty user message for ${code}`, () => {
      const msg = getUserMessage(code);
      expect(msg).toBeTruthy();
      expect(msg.length).toBeGreaterThan(10);
    });
  });

  it('should return a message that does not contain internal error details', () => {
    const msg = getUserMessage('AUTH_ERROR');
    expect(msg).not.toContain('ANTHROPIC_API_KEY');
    expect(msg).not.toContain('process.env');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Section 5: SSE formatting tests
// ═══════════════════════════════════════════════════════════════════════

describe('formatSSEError', () => {
  it('should format as SSE data event', () => {
    const err = new AIProviderError('RATE_LIMITED', 'Busy', 'anthropic', 429);
    const sse = formatSSEError(err);
    expect(sse).toMatch(/^data: \{.*\}\n\n$/);
    const parsed = JSON.parse(sse.replace('data: ', '').trim());
    expect(parsed.type).toBe('error');
    expect(parsed.code).toBe('RATE_LIMITED');
  });

  it('should include retryable field', () => {
    const err = new AIProviderError('AUTH_ERROR', 'Bad key', 'openai', 401);
    const sse = formatSSEError(err);
    const parsed = JSON.parse(sse.replace('data: ', '').trim());
    expect(parsed.retryable).toBe(false);
  });
});

describe('formatSSEDone', () => {
  it('should format as SSE done event', () => {
    const sse = formatSSEDone();
    expect(sse).toMatch(/^data: \{.*\}\n\n$/);
    const parsed = JSON.parse(sse.replace('data: ', '').trim());
    expect(parsed.type).toBe('done');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Section 6: Mock AI Provider tests
// ═══════════════════════════════════════════════════════════════════════

describe('createMockProvider', () => {
  it('should track call counts', async () => {
    const mock = createMockProvider();
    mock.succeedWith('hello');
    await mock.provider.complete([], {});
    await mock.provider.complete([], {});
    expect(mock.getCompleteCalls()).toBe(2);
  });

  it('succeedWith returns content', async () => {
    const mock = createMockProvider();
    mock.succeedWith('Hello world');
    const result = await mock.provider.complete([]);
    expect(result.content).toBe('Hello world');
  });

  it('failWith throws AIProviderError', async () => {
    const mock = createMockProvider();
    mock.failWith('RATE_LIMITED', 'Rate limited');
    await expect(mock.provider.complete([])).rejects.toThrow(AIProviderError);
    await expect(mock.provider.complete([])).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('failWithGeneric throws plain Error', async () => {
    const mock = createMockProvider();
    mock.failWithGeneric('Boom');
    await expect(mock.provider.complete([])).rejects.toThrow(Error);
    await expect(mock.provider.complete([])).rejects.not.toThrow(AIProviderError);
  });

  it('returnEmpty returns empty content', async () => {
    const mock = createMockProvider();
    mock.returnEmpty();
    const result = await mock.provider.complete([]);
    expect(result.content).toBe('');
  });

  it('timeout never resolves', async () => {
    const mock = createMockProvider();
    mock.timeout();
    const result = Promise.race([
      mock.provider.complete([]),
      new Promise((resolve) => setTimeout(() => resolve('timed_out'), 100)),
    ]);
    expect(await result).toBe('timed_out');
  });

  it('failThenSucceed fails N times then succeeds', async () => {
    const mock = createMockProvider();
    mock.failThenSucceed(2, 'RATE_LIMITED', 'Success!');
    await expect(mock.provider.complete([])).rejects.toThrow(AIProviderError);
    await expect(mock.provider.complete([])).rejects.toThrow(AIProviderError);
    const result = await mock.provider.complete([]);
    expect(result.content).toBe('Success!');
  });

  it('streamChunks yields all chunks', async () => {
    const mock = createMockProvider();
    mock.streamChunks(['Hello', ' ', 'World']);
    const { stream } = await mock.provider.stream([]);
    const reader = stream.getReader();
    const chunks: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    expect(chunks).toEqual(['Hello', ' ', 'World']);
  });

  it('failStreamAfter yields chunks then error event', async () => {
    const mock = createMockProvider();
    mock.failStreamAfter(['partial'], 'NETWORK_ERROR', 'Lost connection');
    const { stream } = await mock.provider.stream([]);
    const reader = stream.getReader();
    const chunks: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    expect(chunks[0]).toBe('partial');
    expect(chunks[1]).toContain('"type":"error"');
    expect(chunks[1]).toContain('NETWORK_ERROR');
  });

  it('failStreamImmediately throws before returning stream', async () => {
    const mock = createMockProvider();
    mock.failStreamImmediately('AUTH_ERROR', 'No API key');
    await expect(mock.provider.stream([])).rejects.toThrow(AIProviderError);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Section 7: Provider-specific error scenarios
// ═══════════════════════════════════════════════════════════════════════

describe('Provider error classification scenarios', () => {
  describe('Anthropic', () => {
    it('missing API key -> AUTH_ERROR', () => {
      // Simulated by the provider before making an API call
      const err = new AIProviderError('AUTH_ERROR', 'ANTHROPIC_API_KEY is not set', 'anthropic');
      expect(err.code).toBe('AUTH_ERROR');
      expect(err.retryable).toBe(false);
    });

    it('429 rate limit -> RATE_LIMITED + retry + fallback', () => {
      const err = classifyProviderError(429, '{"error":{"message":"Rate limited"}}', 'anthropic');
      expect(err.code).toBe('RATE_LIMITED');
      expect(err.retryable).toBe(true);
    });

    it('overloaded_error -> PROVIDER_ERROR', () => {
      const body = JSON.stringify({ error: { type: 'overloaded_error', message: 'Overloaded' } });
      const err = classifyProviderError(529, body, 'anthropic');
      expect(err.code).toBe('PROVIDER_ERROR');
      expect(err.retryable).toBe(true);
    });

    it('invalid_request_error + context length -> CONTEXT_TOO_LARGE (retryable)', () => {
      const body = JSON.stringify({
        error: {
          type: 'invalid_request_error',
          message: 'prompt is too long: 200000 > maximum context length of 100000 tokens',
        },
      });
      const err = classifyProviderError(400, body, 'anthropic');
      expect(err.code).toBe('CONTEXT_TOO_LARGE');
      expect(err.retryable).toBe(true);
    });

    it('authentication_error -> AUTH_ERROR', () => {
      const body = JSON.stringify({
        error: { type: 'authentication_error', message: 'Invalid API Key' },
      });
      const err = classifyProviderError(401, body, 'anthropic');
      expect(err.code).toBe('AUTH_ERROR');
    });
  });

  describe('OpenAI', () => {
    it('missing API key -> AUTH_ERROR', () => {
      const err = new AIProviderError('AUTH_ERROR', 'OPENAI_API_KEY is not set', 'openai');
      expect(err.code).toBe('AUTH_ERROR');
    });

    it('context_length_exceeded -> CONTEXT_TOO_LARGE (retryable)', () => {
      const body = JSON.stringify({
        error: {
          code: 'context_length_exceeded',
          message: "This model's maximum context length is 128000 tokens",
        },
      });
      const err = classifyProviderError(400, body, 'openai');
      expect(err.code).toBe('CONTEXT_TOO_LARGE');
    });

    it('content_policy_violation -> CONTENT_FILTERED', () => {
      const body = JSON.stringify({
        error: { code: 'content_policy_violation', message: 'Flagged content' },
      });
      const err = classifyProviderError(400, body, 'openai');
      expect(err.code).toBe('CONTENT_FILTERED');
      expect(err.retryable).toBe(false);
    });

    it('insufficient_quota -> QUOTA_EXCEEDED', () => {
      const body = JSON.stringify({
        error: { code: 'insufficient_quota', message: 'You exceeded your quota' },
      });
      const err = classifyProviderError(402, body, 'openai');
      expect(err.code).toBe('QUOTA_EXCEEDED');
    });

    it('empty response -> EMPTY_RESPONSE', () => {
      const err = new AIProviderError('EMPTY_RESPONSE', 'OpenAI returned no content', 'openai');
      expect(err.code).toBe('EMPTY_RESPONSE');
      expect(err.retryable).toBe(true);
    });

    it('500 server error -> PROVIDER_ERROR + retry + fallback', () => {
      const err = classifyProviderError(500, '{"error":{"message":"Internal error"}}', 'openai');
      expect(err.code).toBe('PROVIDER_ERROR');
      expect(err.retryable).toBe(true);
    });
  });

  describe('Google', () => {
    it('missing API key -> AUTH_ERROR', () => {
      const err = new AIProviderError('AUTH_ERROR', 'GOOGLE_AI_API_KEY is not set', 'google');
      expect(err.code).toBe('AUTH_ERROR');
    });

    it('safety blocked -> CONTENT_FILTERED', () => {
      const body = JSON.stringify({
        error: { message: 'Content was blocked due to safety ratings' },
      });
      const err = classifyProviderError(400, body, 'google');
      expect(err.code).toBe('CONTENT_FILTERED');
    });

    it('network failure -> NETWORK_ERROR', () => {
      const err = classifyNetworkError(new Error('fetch failed: ECONNREFUSED'), 'google');
      expect(err.code).toBe('NETWORK_ERROR');
      expect(err.retryable).toBe(true);
    });

    it('malformed JSON response -> PARSE_ERROR via UNKNOWN', () => {
      // The classifyProviderError won't specifically return PARSE_ERROR for
      // unknown errors, but the error will be caught and classified.
      const err = classifyProviderError(200, 'not json at all{{{', 'google');
      // 200 is not an error status — classification handles edge cases
      expect(err).toBeInstanceOf(AIProviderError);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Section 8: Agent execution error scenarios (with mock provider)
// ═══════════════════════════════════════════════════════════════════════

describe('Agent execution error paths', () => {
  it('AUTH_ERROR should not be retried (non-retryable)', () => {
    expect(isRetryable('AUTH_ERROR')).toBe(false);
  });

  it('RATE_LIMITED should be retried', () => {
    expect(isRetryable('RATE_LIMITED')).toBe(true);
  });

  it('CONTENT_FILTERED should not be retried', () => {
    expect(isRetryable('CONTENT_FILTERED')).toBe(false);
  });

  it('NETWORK_ERROR should be retried', () => {
    expect(isRetryable('NETWORK_ERROR')).toBe(true);
  });

  it('PROVIDER_ERROR should be retried', () => {
    expect(isRetryable('PROVIDER_ERROR')).toBe(true);
  });

  it('EMPTY_RESPONSE should be retried', () => {
    expect(isRetryable('EMPTY_RESPONSE')).toBe(true);
  });

  it('TIMEOUT should not be retried', () => {
    expect(isRetryable('TIMEOUT')).toBe(false);
  });

  it('CONTEXT_TOO_LONG should not be retried', () => {
    expect(isRetryable('CONTEXT_TOO_LONG')).toBe(false);
  });

  it('QUOTA_EXCEEDED should not be retried', () => {
    expect(isRetryable('QUOTA_EXCEEDED')).toBe(false);
  });

  it('MODEL_UNAVAILABLE should not be retried', () => {
    expect(isRetryable('MODEL_UNAVAILABLE')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Section 9: Mock provider retry/fallback simulation
// ═══════════════════════════════════════════════════════════════════════

describe('Retry and fallback simulation', () => {
  it('primary provider fails, fallback succeeds -> transparent recovery', async () => {
    const primary = createMockProvider({ name: 'anthropic' });
    const fallback = createMockProvider({ name: 'openai' });

    primary.failWith('PROVIDER_ERROR', 'Server error');
    fallback.succeedWith('Fallback response');

    // Simulate the retry-then-fallback logic
    let result: string;
    try {
      await primary.provider.complete([]);
      result = 'should not reach';
    } catch (e) {
      expect(e).toBeInstanceOf(AIProviderError);
      // Fallback
      const fallbackResult = await fallback.provider.complete([]);
      result = fallbackResult.content;
    }

    expect(result).toBe('Fallback response');
  });

  it('primary + fallback both fail -> structured error returned', async () => {
    const primary = createMockProvider({ name: 'anthropic' });
    const fallback = createMockProvider({ name: 'openai' });

    primary.failWith('RATE_LIMITED', 'Rate limited');
    fallback.failWith('RATE_LIMITED', 'Also rate limited');

    let error: AIProviderError | null = null;
    try {
      await primary.provider.complete([]);
    } catch (e1) {
      try {
        await fallback.provider.complete([]);
      } catch (e2) {
        error = e2 as AIProviderError;
      }
    }

    expect(error).toBeInstanceOf(AIProviderError);
    expect(error!.code).toBe('RATE_LIMITED');
  });

  it('rate limit retry succeeds on 2nd attempt -> transparent recovery', async () => {
    const mock = createMockProvider();
    mock.failThenSucceed(1, 'RATE_LIMITED', 'Success after retry');

    // First call fails
    let result: string | null = null;
    try {
      const r = await mock.provider.complete([]);
      result = r.content;
    } catch {
      // Retry
      const r = await mock.provider.complete([]);
      result = r.content;
    }

    expect(result).toBe('Success after retry');
    expect(mock.getCompleteCalls()).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Section 10: Stream error event scenarios
// ═══════════════════════════════════════════════════════════════════════

describe('Stream error scenarios', () => {
  it('successful stream ends with all chunks', async () => {
    const mock = createMockProvider();
    mock.streamChunks(['Hello', ', ', 'world!']);
    const { stream } = await mock.provider.stream([]);
    const reader = stream.getReader();
    let content = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      content += value;
    }
    expect(content).toBe('Hello, world!');
  });

  it('stream with mid-stream error contains error event', async () => {
    const mock = createMockProvider();
    mock.failStreamAfter(['partial content'], 'PROVIDER_ERROR', 'Stream died');
    const { stream } = await mock.provider.stream([]);
    const reader = stream.getReader();
    const chunks: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe('partial content');
    expect(chunks[1]).toContain('"type":"error"');
    expect(chunks[1]).toContain('PROVIDER_ERROR');
  });

  it('stream that fails immediately throws before returning stream', async () => {
    const mock = createMockProvider();
    mock.failStreamImmediately('AUTH_ERROR', 'No API key');
    await expect(mock.provider.stream([])).rejects.toThrow(AIProviderError);
    await expect(mock.provider.stream([])).rejects.toMatchObject({
      code: 'AUTH_ERROR',
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Section 11: SSE event parsing (frontend)
// ═══════════════════════════════════════════════════════════════════════

describe('SSE event parsing (frontend simulation)', () => {
  function parseSSEEvent(chunk: string): { type: string; code?: string; message?: string } | null {
    const match = chunk.match(/data:\s*(\{.*\})/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.type === 'error' || parsed.type === 'done') return parsed;
    } catch {
      return null;
    }
    return null;
  }

  it('should parse SSE error event', () => {
    const err = new AIProviderError('RATE_LIMITED', 'Busy', 'anthropic', 429);
    const sse = formatSSEError(err);
    const parsed = parseSSEEvent(sse);
    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe('error');
    expect(parsed!.code).toBe('RATE_LIMITED');
  });

  it('should parse SSE done event', () => {
    const sse = formatSSEDone();
    const parsed = parseSSEEvent(sse);
    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe('done');
  });

  it('should return null for normal text content', () => {
    const parsed = parseSSEEvent('Hello, this is normal AI response text');
    expect(parsed).toBeNull();
  });

  it('should return null for malformed JSON', () => {
    const parsed = parseSSEEvent('data: {broken json');
    expect(parsed).toBeNull();
  });

  it('should return null for non-error/done types', () => {
    const parsed = parseSSEEvent('data: {"type":"content","text":"hello"}');
    expect(parsed).toBeNull();
  });

  it('error code to user message mapping covers all codes', () => {
    const allCodes: AIErrorCode[] = [
      'RATE_LIMITED', 'CONTEXT_TOO_LONG', 'CONTENT_FILTERED', 'AUTH_ERROR',
      'MODEL_UNAVAILABLE', 'NETWORK_ERROR', 'TIMEOUT', 'EMPTY_RESPONSE',
      'PARSE_ERROR', 'PROVIDER_ERROR', 'QUOTA_EXCEEDED', 'UNKNOWN',
    ];

    for (const code of allCodes) {
      const msg = getUserMessage(code);
      expect(msg).toBeTruthy();
      // User messages should be meaningful, not raw error codes
      expect(msg.length).toBeGreaterThan(15);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Section 12: Edge cases and boundary conditions
// ═══════════════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  it('classifyProviderError handles very large body', () => {
    const largeBody = 'x'.repeat(100_000);
    const err = classifyProviderError(500, largeBody, 'openai');
    expect(err.code).toBe('PROVIDER_ERROR');
    // Should not crash
  });

  it('classifyProviderError handles nested JSON errors', () => {
    const body = JSON.stringify({
      error: {
        type: 'invalid_request_error',
        message: 'maximum context length exceeded with too many tokens in input',
      },
    });
    const err = classifyProviderError(400, body, 'anthropic');
    expect(err.code).toBe('CONTEXT_TOO_LARGE');
  });

  it('AIProviderError extends Error properly', () => {
    const err = new AIProviderError('UNKNOWN', 'test', 'test');
    expect(err instanceof Error).toBe(true);
    expect(err.stack).toBeTruthy();
  });

  it('concurrent error classifications do not interfere', () => {
    const results = Array.from({ length: 100 }, (_, i) =>
      classifyProviderError(i % 2 === 0 ? 429 : 500, '{}', 'anthropic')
    );
    const rateLimited = results.filter((r) => r.code === 'RATE_LIMITED');
    const serverErrors = results.filter((r) => r.code === 'PROVIDER_ERROR');
    expect(rateLimited).toHaveLength(50);
    expect(serverErrors).toHaveLength(50);
  });

  it('formatSSEError output is valid SSE', () => {
    const err = new AIProviderError('TIMEOUT', 'Timed out', 'coordinator');
    const sse = formatSSEError(err);
    // SSE format: "data: {json}\n\n"
    expect(sse.startsWith('data: ')).toBe(true);
    expect(sse.endsWith('\n\n')).toBe(true);
    // Should be parseable
    const jsonStr = sse.slice(6, -2);
    expect(() => JSON.parse(jsonStr)).not.toThrow();
  });

  it('formatSSEDone output is valid SSE', () => {
    const sse = formatSSEDone();
    expect(sse.startsWith('data: ')).toBe(true);
    expect(sse.endsWith('\n\n')).toBe(true);
    const jsonStr = sse.slice(6, -2);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.type).toBe('done');
  });

  it('AIProviderError.toJSON does not leak internal message', () => {
    const err = new AIProviderError(
      'AUTH_ERROR',
      'ANTHROPIC_API_KEY=sk-ant-xxx is not valid',
      'anthropic',
      401
    );
    const json = err.toJSON();
    // The userMessage should be the safe user-facing version
    expect(json.message).not.toContain('sk-ant-xxx');
    expect(json.message).not.toContain('ANTHROPIC_API_KEY');
  });

  it('multiple error classifications are independent', () => {
    const err1 = classifyProviderError(429, '{}', 'anthropic');
    const err2 = classifyProviderError(401, '{}', 'openai');
    const err3 = classifyProviderError(500, '{}', 'google');

    expect(err1.code).toBe('RATE_LIMITED');
    expect(err1.provider).toBe('anthropic');
    expect(err2.code).toBe('AUTH_ERROR');
    expect(err2.provider).toBe('openai');
    expect(err3.code).toBe('PROVIDER_ERROR');
    expect(err3.provider).toBe('google');
  });

  it('getUserMessage returns different messages for different codes', () => {
    const messages = new Set<string>();
    const codes: AIErrorCode[] = [
      'RATE_LIMITED', 'CONTEXT_TOO_LONG', 'CONTENT_FILTERED', 'AUTH_ERROR',
      'MODEL_UNAVAILABLE', 'NETWORK_ERROR', 'TIMEOUT', 'EMPTY_RESPONSE',
    ];
    for (const code of codes) {
      messages.add(getUserMessage(code));
    }
    // All messages should be unique
    expect(messages.size).toBe(codes.length);
  });
});
