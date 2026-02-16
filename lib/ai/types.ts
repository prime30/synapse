export type AIProvider = 'openai' | 'anthropic' | 'google' | (string & {});

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** Mark this message for Anthropic prompt caching. */
  cacheControl?: { type: 'ephemeral' };
  /** Enable citations on document-source messages. */
  citations?: { enabled: boolean };
}

export interface AICompletionOptions {
  provider?: AIProvider;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  /** Enable Claude adaptive thinking (internal reasoning scratchpad). */
  thinking?: { type: 'adaptive' };
  /** Control reasoning effort depth. Only used when thinking is enabled. */
  effort?: 'low' | 'medium' | 'high' | 'max';
  /** Force Claude to return JSON matching a JSON Schema (Anthropic only). */
  outputConfig?: {
    format: { type: 'json_schema'; schema: Record<string, unknown> };
  };
  /** Enable prompt caching for this request. */
  cacheEnabled?: boolean;
  /** Enable citations for this request. */
  citationsEnabled?: boolean;
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
  getUsage: () => Promise<UsageInfo>;
}

/** Standard usage info returned by AI providers. */
export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  /** Tokens used by Claude's internal thinking (if adaptive thinking enabled). */
  thinkingTokens?: number;
  /** Tokens written to prompt cache on this request. */
  cacheCreationInputTokens?: number;
  /** Tokens read from prompt cache on this request. */
  cacheReadInputTokens?: number;
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

// ── Tool-use types ──────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/** Extended completion result that may include tool calls. */
export interface AIToolCompletionResult extends AICompletionResult {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
  toolCalls?: ToolCall[];
}

// ── Streaming tool-use types ────────────────────────────────────────

/** Provider-level events emitted by streamWithTools() from Anthropic SSE. */
export type ToolStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; id: string; name: string }
  | { type: 'tool_delta'; id: string; partialJson: string }
  | { type: 'tool_end'; id: string; name: string; input: Record<string, unknown> };

/** Result of streamWithTools() — a stream of ToolStreamEvents plus usage. */
export interface ToolStreamResult {
  stream: ReadableStream<ToolStreamEvent>;
  /** Resolves when the stream closes with accumulated token usage. */
  getUsage: () => Promise<UsageInfo>;
}

// ── Citation types ──────────────────────────────────────────────────

/** A citation referencing a specific passage in a source document. */
export interface CitationBlock {
  type: 'citation';
  /** The cited text passage. */
  citedText: string;
  /** Source document title (typically the file path). */
  documentTitle: string;
  /** Start index within the source document. */
  startIndex?: number;
  /** End index within the source document. */
  endIndex?: number;
}

/** A document source block for the Anthropic citations API. */
export interface DocumentSource {
  type: 'document';
  source: {
    type: 'text';
    media_type: 'text/plain';
    data: string;
  };
  title: string;
  context?: string;
  citations?: { enabled: boolean };
}

// ── Thinking types ──────────────────────────────────────────────────

/** A thinking content block from Claude's adaptive thinking. */
export interface ThinkingContentBlock {
  type: 'thinking';
  thinking: string;
}

// ── Cache metrics ───────────────────────────────────────────────────

/** Prompt caching metrics from an Anthropic response. */
export interface CacheUsageMetrics {
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  /** True if any tokens were read from cache. */
  cacheHit: boolean;
  /** Estimated tokens saved (cache reads vs re-processing). */
  savedTokens: number;
}

// ── Provider interfaces ─────────────────────────────────────────────

/** Extended provider with tool-use support. */
export interface AIToolProviderInterface extends AIProviderInterface {
  completeWithTools(
    messages: AIMessage[],
    tools: ToolDefinition[],
    options?: Partial<AICompletionOptions>,
  ): Promise<AIToolCompletionResult>;

  /** Stream a completion with tool use, returning events as they arrive. */
  streamWithTools(
    messages: AIMessage[],
    tools: ToolDefinition[],
    options?: Partial<AICompletionOptions>,
  ): Promise<ToolStreamResult>;
}
