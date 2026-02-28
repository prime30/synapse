export type AIProvider = 'openai' | 'anthropic' | 'google' | (string & {});

export interface AIMessageImage {
  base64: string;
  mimeType: string;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** Attached images for multimodal input (user messages only). */
  images?: AIMessageImage[];
  /** Mark this message for Anthropic prompt caching with optional TTL. */
  cacheControl?: { type: 'ephemeral'; ttl?: '5m' | '1h' };
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
  /** PTC: reuse a sandbox container across requests. */
  container?: string;
  /** Server-side context editing: automatically clear old tool results and thinking blocks. */
  contextManagement?: {
    edits: Array<ContextEditStrategy>;
  };
  /** Force the model to use a tool. 'any' = must use some tool, string = must use that specific tool. */
  toolChoice?: 'auto' | 'any' | { type: 'tool'; name: string };
}

// ── Context editing strategy types ──────────────────────────────────

export type ContextEditStrategy =
  | {
      type: 'clear_tool_uses_20250919';
      trigger?: { type: 'input_tokens'; value: number };
      keep?: { type: 'tool_uses'; value: number };
      clear_at_least?: { type: 'input_tokens'; value: number };
      exclude_tools?: string[];
      clear_tool_inputs?: boolean;
    }
  | {
      type: 'clear_thinking_20251015';
      keep?: 'all' | { type: 'thinking_turns'; value: number };
    };

/** Result of an applied context edit from the API response. */
export interface ContextEditResult {
  type: string;
  cleared_input_tokens?: number;
  cleared_tool_uses?: number;
  cleared_thinking_turns?: number;
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
  /** PTC: which contexts can invoke this tool. */
  allowed_callers?: ('direct' | 'code_execution_20250825')[];
  /** PTC: tool type. Omit for standard tools; set for server-managed tools like code_execution. */
  type?: string;
  /** Stream tool input params without buffering for JSON validation — reduces TTFB on large params. */
  eager_input_streaming?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** PTC: how this tool was invoked. */
  caller?: { type: 'direct' } | { type: 'code_execution_20250825'; tool_id: string };
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
  /** Attached plan data for rendering PlanCard in chat. */
  planData?: unknown;
}

/** Extended completion result that may include tool calls. */
export interface AIToolCompletionResult extends AICompletionResult {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
  toolCalls?: ToolCall[];
  /** PTC: container info for sandbox reuse across requests. */
  container?: { id: string; expires_at: string };
}

// ── Streaming tool-use types ────────────────────────────────────────

/** Provider-level events emitted by streamWithTools() from Anthropic SSE. */
export type ToolStreamEvent =
  | { type: 'stream_start' }
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'tool_start'; id: string; name: string }
  | { type: 'tool_delta'; id: string; partialJson: string }
  | { type: 'tool_end'; id: string; name: string; input: Record<string, unknown>; caller?: ToolCall['caller'] }
  | { type: 'server_tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'code_execution_result'; toolUseId: string; stdout: string; stderr: string; returnCode: number };

/** Result of streamWithTools() — a stream of ToolStreamEvents plus usage. */
export interface ToolStreamResult {
  stream: ReadableStream<ToolStreamEvent>;
  /** Resolves when the stream closes with accumulated token usage. */
  getUsage: () => Promise<UsageInfo>;
  /** Resolves when the stream closes with the stop reason (end_turn, tool_use, or max_tokens). */
  getStopReason: () => Promise<'end_turn' | 'tool_use' | 'max_tokens'>;
  /** Resolves when the stream closes with the raw Anthropic content blocks (text + tool_use). */
  getRawContentBlocks: () => Promise<unknown[]>;
  /** Resolves with a terminal stream error when provider stream failed mid-flight. */
  getTerminalError?: () => Promise<Error | null>;
  /** PTC: container info for sandbox reuse across requests. */
  getContainer?: () => Promise<{ id: string; expires_at: string } | null>;
  /** Context editing: applied edits from the API response. */
  getContextEdits?: () => Promise<ContextEditResult[]>;
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
