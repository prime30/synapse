/**
 * Structured AI error types for the entire chat pipeline.
 *
 * Every layer (provider -> agent -> coordinator -> API -> frontend) uses
 * these types so errors are classified, retryable, and user-friendly.
 */

// ── Error codes ───────────────────────────────────────────────────────

export type AIErrorCode =
  | 'RATE_LIMITED'       // 429 -- temporary, auto-retry
  | 'CONTEXT_TOO_LONG'  // input exceeds model context window
  | 'CONTEXT_TOO_LARGE' // request payload too large, auto-retry with reduced context
  | 'CONTENT_FILTERED'  // content policy violation
  | 'AUTH_ERROR'         // invalid/missing API key
  | 'MODEL_UNAVAILABLE' // model doesn't exist or is down
  | 'NETWORK_ERROR'     // fetch failed, DNS, timeout
  | 'TIMEOUT'           // our own execution timeout
  | 'EMPTY_RESPONSE'    // AI returned no content
  | 'PARSE_ERROR'       // malformed API response
  | 'PROVIDER_ERROR'    // generic provider error (5xx)
  | 'QUOTA_EXCEEDED'    // billing quota hit
  | 'SOLO_EXECUTION_FAILED' // solo mode agent execution failed
  | 'UNKNOWN';

// ── Retryable codes ───────────────────────────────────────────────────

const RETRYABLE_CODES = new Set<AIErrorCode>([
  'RATE_LIMITED',
  'NETWORK_ERROR',
  'PROVIDER_ERROR',
  'EMPTY_RESPONSE',
  'CONTEXT_TOO_LARGE',
]);

const NON_RETRYABLE_CODES = new Set<AIErrorCode>([
  'AUTH_ERROR',
  'CONTENT_FILTERED',
  'CONTEXT_TOO_LONG',
  'QUOTA_EXCEEDED',
  'MODEL_UNAVAILABLE',
]);

export function isRetryable(code: AIErrorCode): boolean {
  if (RETRYABLE_CODES.has(code)) return true;
  if (NON_RETRYABLE_CODES.has(code)) return false;
  return false; // default: don't retry unknown errors
}

// ── User-friendly messages ────────────────────────────────────────────

const USER_MESSAGES: Record<AIErrorCode, string> = {
  RATE_LIMITED: 'The AI is temporarily busy. Retrying in a moment...',
  CONTEXT_TOO_LONG: 'Your files are too large for this model. Try selecting fewer files or using a model with a larger context window.',
  CONTEXT_TOO_LARGE: 'Request was too large. Retrying with reduced context...',
  CONTENT_FILTERED: 'Your request was filtered by the AI safety system. Try rephrasing your message.',
  AUTH_ERROR: 'AI is not configured. Please ask your admin to add API keys in Settings.',
  MODEL_UNAVAILABLE: 'The selected AI model is currently unavailable. Try switching to a different model.',
  NETWORK_ERROR: 'Connection lost. Check your internet and try again.',
  TIMEOUT: 'The AI took too long to respond. Try a simpler request or try with a single agent (1x).',
  EMPTY_RESPONSE: 'The AI returned an empty response. Retrying...',
  PARSE_ERROR: 'Received an unexpected response from the AI. Please try again.',
  PROVIDER_ERROR: 'The AI service is experiencing issues. Please try again in a moment.',
  QUOTA_EXCEEDED: 'Your AI usage quota has been reached. Please upgrade your plan or wait for the quota to reset.',
  SOLO_EXECUTION_FAILED: 'The AI agent encountered an error. Please try again or try with more agents.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

export function getUserMessage(code: AIErrorCode): string {
  return USER_MESSAGES[code] ?? USER_MESSAGES.UNKNOWN;
}

// ── AIProviderError class ─────────────────────────────────────────────

export class AIProviderError extends Error {
  readonly code: AIErrorCode;
  readonly provider: string;
  readonly statusCode: number | undefined;
  readonly retryable: boolean;
  readonly userMessage: string;

  constructor(
    code: AIErrorCode,
    message: string,
    provider: string,
    statusCode?: number,
    /** When set, used as the user-facing message in toJSON() instead of getUserMessage(code). Use for UNKNOWN to show a truncated actual error. */
    customUserMessage?: string
  ) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code;
    this.provider = provider;
    this.statusCode = statusCode;
    this.retryable = isRetryable(code);
    this.userMessage = customUserMessage ?? getUserMessage(code);
  }

  /** Serialize for SSE transport. */
  toJSON() {
    return {
      type: 'error' as const,
      code: this.code,
      message: this.userMessage,
      provider: this.provider,
      retryable: this.retryable,
    };
  }
}

// ── Provider error classification ─────────────────────────────────────

/**
 * Classify a raw HTTP error response from an AI provider into a
 * structured AIProviderError.
 */
export function classifyProviderError(
  status: number,
  body: string,
  provider: string
): AIProviderError {
  const bodyLower = body.toLowerCase();

  // Parse JSON body for structured error info
  let errorType = '';
  let errorCode = '';
  let errorMessage = '';
  try {
    const parsed = JSON.parse(body);
    errorType = parsed?.error?.type ?? parsed?.type ?? '';
    errorCode = parsed?.error?.code ?? parsed?.code ?? '';
    errorMessage = parsed?.error?.message ?? parsed?.message ?? '';
  } catch {
    errorMessage = body.slice(0, 300);
  }

  // ── 429: Rate limited ──────────────────────────────────────────────
  if (status === 429) {
    return new AIProviderError(
      'RATE_LIMITED',
      `${provider} rate limited: ${errorMessage || body.slice(0, 200)}`,
      provider,
      429
    );
  }

  // ── 401/403: Auth errors ───────────────────────────────────────────
  if (status === 401 || status === 403) {
    // Anthropic: authentication_error
    // OpenAI: invalid_api_key
    return new AIProviderError(
      'AUTH_ERROR',
      `${provider} auth error: ${errorMessage || body.slice(0, 200)}`,
      provider,
      status
    );
  }

  // ── 413: Payload Too Large — retryable with reduced context ────────
  if (status === 413) {
    return new AIProviderError('CONTEXT_TOO_LARGE', `${provider}: request payload too large - ${errorMessage}`, provider, 413);
  }

  // ── 400: Could be context too long, content filtered, etc. ─────────
  if (status === 400) {
    // Check for "request too large" patterns (retryable with reduced context)
    if (
      bodyLower.includes('request too large') ||
      bodyLower.includes('payload too large') ||
      bodyLower.includes('body is too large')
    ) {
      return new AIProviderError('CONTEXT_TOO_LARGE', `${provider}: ${errorMessage}`, provider, 400);
    }

    // Anthropic context length
    if (
      errorType === 'invalid_request_error' &&
      (bodyLower.includes('too many tokens') ||
        bodyLower.includes('maximum context length') ||
        bodyLower.includes('prompt is too long'))
    ) {
      return new AIProviderError('CONTEXT_TOO_LARGE', `${provider}: ${errorMessage}`, provider, 400);
    }

    // OpenAI context length
    if (errorCode === 'context_length_exceeded' || bodyLower.includes('context_length_exceeded')) {
      return new AIProviderError('CONTEXT_TOO_LARGE', `${provider}: ${errorMessage}`, provider, 400);
    }

    // OpenAI content policy
    if (errorCode === 'content_policy_violation' || bodyLower.includes('content_policy')) {
      return new AIProviderError('CONTENT_FILTERED', `${provider}: ${errorMessage}`, provider, 400);
    }

    // Google safety / content filter
    if (bodyLower.includes('safety') || bodyLower.includes('blocked') || bodyLower.includes('harm_category')) {
      return new AIProviderError('CONTENT_FILTERED', `${provider}: ${errorMessage}`, provider, 400);
    }

    // Google context length
    if (bodyLower.includes('resource_exhausted') || bodyLower.includes('token limit')) {
      return new AIProviderError('CONTEXT_TOO_LONG', `${provider}: ${errorMessage}`, provider, 400);
    }
  }

  // ── 402/payment required: Quota exceeded ───────────────────────────
  if (status === 402 || errorCode === 'insufficient_quota' || bodyLower.includes('quota')) {
    return new AIProviderError('QUOTA_EXCEEDED', `${provider}: ${errorMessage}`, provider, status);
  }

  // ── 404: Model not found ───────────────────────────────────────────
  if (status === 404 || errorCode === 'model_not_found') {
    return new AIProviderError('MODEL_UNAVAILABLE', `${provider}: model not found - ${errorMessage}`, provider, status);
  }

  // ── 529 / Anthropic overloaded ─────────────────────────────────────
  if (status === 529 || errorType === 'overloaded_error' || bodyLower.includes('overloaded')) {
    return new AIProviderError('PROVIDER_ERROR', `${provider} is overloaded: ${errorMessage}`, provider, status);
  }

  // ── 5xx: Server errors ─────────────────────────────────────────────
  if (status >= 500) {
    return new AIProviderError('PROVIDER_ERROR', `${provider} server error (${status}): ${errorMessage}`, provider, status);
  }

  // ── Fallback ───────────────────────────────────────────────────────
  return new AIProviderError(
    'UNKNOWN',
    `${provider} error (${status}): ${errorMessage || body.slice(0, 200)}`,
    provider,
    status
  );
}

/**
 * Classify a network/fetch error (no HTTP response available).
 */
export function classifyNetworkError(error: unknown, provider: string): AIProviderError {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('abort') || lower.includes('cancelled')) {
    return new AIProviderError('TIMEOUT', `${provider} request aborted: ${message}`, provider);
  }

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return new AIProviderError('TIMEOUT', `${provider} timed out: ${message}`, provider);
  }

  return new AIProviderError('NETWORK_ERROR', `${provider} network error: ${message}`, provider);
}

/**
 * Format an SSE error event string for streaming.
 */
export function formatSSEError(error: AIProviderError): string {
  return `data: ${JSON.stringify(error.toJSON())}\n\n`;
}

/**
 * Format an SSE done event string.
 */
export function formatSSEDone(): string {
  return `data: ${JSON.stringify({ type: 'done' })}\n\n`;
}
