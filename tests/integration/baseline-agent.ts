/**
 * Baseline Agent: a minimal multi-turn agent loop using raw Anthropic API.
 *
 * Represents what a developer gets from "raw Claude with tools" — no
 * orchestration layer, no signal-based file loading, no domain knowledge
 * injection. Used as the control group in head-to-head comparisons
 * against Synapse's orchestrated `streamAgentLoop`.
 */

import { createAnthropicProvider } from '@/lib/ai/providers/anthropic';
import { executeToolCall, type ToolExecutorContext } from '@/lib/agents/tools/tool-executor';
import { ContextEngine } from '@/lib/ai/context-engine';
import type {
  AIMessage,
  AIToolProviderInterface,
  ToolDefinition,
  ToolCall,
  ToolStreamEvent,
} from '@/lib/ai/types';
import type { FileContext } from '@/lib/types/agent';

// ── Types ────────────────────────────────────────────────────────────────────

export interface BaselineRunParams {
  prompt: string;
  files: FileContext[];
  tools: ToolDefinition[];
  intentMode: 'ask' | 'code' | 'debug';
  model?: string;
  maxIterations?: number;
  timeoutMs?: number;
  onContentChunk?: (chunk: string) => void;
  onToolEvent?: (event: BaselineToolEvent) => void;
}

export interface BaselineToolEvent {
  type: 'tool_start' | 'tool_call' | 'tool_result';
  name: string;
  id?: string;
  input?: Record<string, unknown>;
  result?: string;
  is_error?: boolean;
}

export interface BaselineResult {
  success: boolean;
  responseText: string;
  codeChanges: BaselineCodeChange[];
  metrics: BaselineMetrics;
  error?: string;
}

export interface BaselineCodeChange {
  fileName: string;
  newContent: string;
  reasoning?: string;
}

export interface BaselineMetrics {
  totalTimeMs: number;
  timeToFirstChunkMs: number;
  contentLength: number;
  toolCallCount: number;
  toolsUsed: string[];
  toolSequence: string[];
  inputTokens: number;
  outputTokens: number;
  iterationCount: number;
  changesProduced: number;
}

// ── System Prompts ───────────────────────────────────────────────────────────

const BASELINE_SYSTEM_PROMPT = `You are a Shopify Liquid theme expert. You help developers analyze, debug, and modify Shopify theme files.

You have access to tools to read files, search across the codebase, and propose code edits. Use them when needed.

Guidelines:
- Think step by step before making changes
- Read relevant files before proposing edits
- Explain your reasoning clearly
- For code changes, provide the complete new file content
- Validate your changes make sense in the Shopify Liquid context`;

// ── Baseline Agent ───────────────────────────────────────────────────────────

export class BaselineAgent {
  private provider: AIToolProviderInterface;

  constructor() {
    this.provider = createAnthropicProvider() as AIToolProviderInterface;
  }

  async run(params: BaselineRunParams): Promise<BaselineResult> {
    const {
      prompt,
      files,
      tools,
      intentMode,
      model = 'claude-sonnet-4-6',
      maxIterations = 8,
      timeoutMs = 180_000,
      onContentChunk,
      onToolEvent,
    } = params;

    const t0 = Date.now();
    let firstChunkAt = 0;
    const contentParts: string[] = [];
    const codeChanges: BaselineCodeChange[] = [];
    const toolSequence: string[] = [];
    const toolsUsedSet = new Set<string>();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let iterationCount = 0;

    // Build tool executor context (in-memory only, no Supabase/Shopify)
    const contextEngine = new ContextEngine();
    contextEngine.indexFiles(files);

    const toolCtx: ToolExecutorContext = {
      files,
      contextEngine,
      projectId: 'baseline-test',
      userId: 'baseline-user',
    };

    // Build initial messages: system + user with files
    const fileContext = files
      .map(f => `### ${f.path || f.fileName}\n\`\`\`${f.fileType}\n${f.content}\n\`\`\``)
      .join('\n\n');

    const userMessage = [
      prompt,
      '',
      `## Mode: ${intentMode}`,
      '',
      '## Theme Files:',
      fileContext,
    ].join('\n');

    const messages: AIMessage[] = [
      { role: 'system', content: BASELINE_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ];

    const deadline = t0 + timeoutMs;

    try {
      // Multi-turn loop
      for (let iter = 0; iter < maxIterations; iter++) {
        if (Date.now() > deadline) {
          return this.buildResult(false, contentParts, codeChanges, toolSequence, toolsUsedSet, totalInputTokens, totalOutputTokens, iterationCount, t0, firstChunkAt, 'Timeout exceeded');
        }

        iterationCount++;

        // Try streaming first, fall back to completeWithTools if stream hangs
        let toolCalls: ToolCall[] = [];
        let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' = 'end_turn';
        let assistantContent = '';
        const STREAM_TIMEOUT_MS = 15_000; // 15s first-byte timeout

        const streamOk = await (async () => {
          try {
            const streamResult = await this.provider.streamWithTools(messages, tools, {
              model,
              maxTokens: 8192,
              temperature: 0.7,
            });

            // Race stream consumption against a first-byte timeout
            const consumed = await Promise.race([
              this.consumeStream(
                streamResult.stream,
                (chunk) => {
                  if (contentParts.length === 0 && !firstChunkAt) {
                    firstChunkAt = Date.now() - t0;
                  }
                  contentParts.push(chunk);
                  onContentChunk?.(chunk);
                },
                (event) => { onToolEvent?.(event); },
              ),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), STREAM_TIMEOUT_MS)),
            ]);

            if (!consumed) return false; // Stream hung — fall back

            toolCalls = consumed.toolCalls;
            const usage = await streamResult.getUsage();
            totalInputTokens += usage.inputTokens;
            totalOutputTokens += usage.outputTokens;
            const rawBlocks = await streamResult.getRawContentBlocks();
            assistantContent = this.blocksToAssistantContent(rawBlocks);
            stopReason = await streamResult.getStopReason();
            return true;
          } catch {
            return false;
          }
        })();

        // Fallback: completeWithTools (non-streaming)
        if (!streamOk) {
          console.log('    [baseline] Stream timeout, falling back to completeWithTools');
          const result = await this.provider.completeWithTools(messages, tools, {
            model,
            maxTokens: 8192,
            temperature: 0.7,
          });

          totalInputTokens += result.inputTokens ?? 0;
          totalOutputTokens += result.outputTokens ?? 0;

          if (result.content) {
            if (!firstChunkAt) firstChunkAt = Date.now() - t0;
            contentParts.push(result.content);
            onContentChunk?.(result.content);
          }

          toolCalls = result.toolCalls ?? [];
          stopReason = result.stopReason;

          // Build assistant content from raw blocks for multi-turn
          const rawBlocks = (result as unknown as Record<string, unknown>).__rawContentBlocks as unknown[] | undefined;
          assistantContent = rawBlocks
            ? this.blocksToAssistantContent(rawBlocks)
            : result.content ?? '';

          // Emit tool events for any tools in the fallback result
          for (const tc of toolCalls) {
            onToolEvent?.({ type: 'tool_call', name: tc.name, id: tc.id, input: tc.input });
          }
        }

        messages.push({ role: 'assistant', content: assistantContent });

        if (toolCalls.length === 0 || stopReason === 'end_turn') {
          break;
        }

        // Execute tools and build tool results message
        const toolResultParts: string[] = [];
        for (const tc of toolCalls) {
          toolSequence.push(tc.name);
          toolsUsedSet.add(tc.name);

          onToolEvent?.({ type: 'tool_start', name: tc.name, id: tc.id, input: tc.input });

          // Handle client-side tools (code edits)
          if (tc.name === 'propose_code_edit') {
            const filePath = String(tc.input.filePath ?? '');
            const newContent = String(tc.input.newContent ?? '');
            const reasoning = String(tc.input.reasoning ?? '');
            codeChanges.push({ fileName: filePath, newContent, reasoning });
            toolResultParts.push(`[tool_result tool_use_id="${tc.id}"]\nCode edit proposed for ${filePath}. The user will review the diff.\n[/tool_result]`);
            onToolEvent?.({ type: 'tool_result', name: tc.name, result: `Proposed edit to ${filePath}` });
            continue;
          }

          if (tc.name === 'search_replace') {
            const filePath = String(tc.input.filePath ?? '');
            const oldText = String(tc.input.old_text ?? '');
            const newText = String(tc.input.new_text ?? '');
            const reasoning = String(tc.input.reasoning ?? '');
            codeChanges.push({ fileName: filePath, newContent: `[search_replace] ${oldText} → ${newText}`, reasoning });
            toolResultParts.push(`[tool_result tool_use_id="${tc.id}"]\nSearch-replace applied to ${filePath}.\n[/tool_result]`);
            onToolEvent?.({ type: 'tool_result', name: tc.name, result: `Applied search-replace to ${filePath}` });
            continue;
          }

          if (tc.name === 'create_file') {
            const fileName = String(tc.input.fileName ?? '');
            const content = String(tc.input.content ?? '');
            const reasoning = String(tc.input.reasoning ?? '');
            codeChanges.push({ fileName, newContent: content, reasoning });
            toolResultParts.push(`[tool_result tool_use_id="${tc.id}"]\nFile ${fileName} created.\n[/tool_result]`);
            onToolEvent?.({ type: 'tool_result', name: tc.name, result: `Created ${fileName}` });
            continue;
          }

          // Server-side tools — execute via shared tool executor
          const result = await executeToolCall(tc, toolCtx);
          const truncated = result.content.length > 8000
            ? result.content.slice(0, 8000) + '\n... (truncated)'
            : result.content;
          toolResultParts.push(`[tool_result tool_use_id="${tc.id}"]\n${truncated}\n[/tool_result]`);
          onToolEvent?.({
            type: 'tool_result',
            name: tc.name,
            result: truncated.slice(0, 200),
            is_error: result.is_error,
          });
        }

        // Append tool results as a user message for the next turn
        messages.push({ role: 'user', content: toolResultParts.join('\n\n') });
      }

      return this.buildResult(true, contentParts, codeChanges, toolSequence, toolsUsedSet, totalInputTokens, totalOutputTokens, iterationCount, t0, firstChunkAt);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return this.buildResult(false, contentParts, codeChanges, toolSequence, toolsUsedSet, totalInputTokens, totalOutputTokens, iterationCount, t0, firstChunkAt, errorMsg);
    }
  }

  /** Consume a ToolStreamEvent stream, returning accumulated text and tool calls. */
  private async consumeStream(
    stream: ReadableStream<ToolStreamEvent>,
    onTextChunk: (text: string) => void,
    onToolEvent: (event: BaselineToolEvent) => void,
  ): Promise<{ text: string; toolCalls: ToolCall[] }> {
    const reader = stream.getReader();
    let fullText = '';
    const toolCalls: ToolCall[] = [];
    const pendingTools = new Map<string, { name: string; jsonParts: string[] }>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        switch (value.type) {
          case 'text_delta':
            fullText += value.text;
            onTextChunk(value.text);
            break;

          case 'tool_start':
            pendingTools.set(value.id, { name: value.name, jsonParts: [] });
            onToolEvent({ type: 'tool_start', name: value.name, id: value.id });
            break;

          case 'tool_delta':
            pendingTools.get(value.id)?.jsonParts.push(value.partialJson);
            break;

          case 'tool_end':
            toolCalls.push({
              id: value.id,
              name: value.name,
              input: value.input,
            });
            pendingTools.delete(value.id);
            onToolEvent({ type: 'tool_call', name: value.name, id: value.id, input: value.input });
            break;
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { text: fullText, toolCalls };
  }

  /**
   * Convert raw Anthropic content blocks into a stringified assistant message
   * for multi-turn conversation continuation.
   */
  private blocksToAssistantContent(blocks: unknown[]): string {
    const parts: string[] = [];
    for (const block of blocks) {
      const b = block as Record<string, unknown>;
      if (b.type === 'text') {
        parts.push(String(b.text ?? ''));
      } else if (b.type === 'tool_use') {
        parts.push(`[tool_use id="${b.id}" name="${b.name}"]\n${JSON.stringify(b.input)}\n[/tool_use]`);
      }
    }
    return parts.join('\n');
  }

  private buildResult(
    success: boolean,
    contentParts: string[],
    codeChanges: BaselineCodeChange[],
    toolSequence: string[],
    toolsUsedSet: Set<string>,
    inputTokens: number,
    outputTokens: number,
    iterationCount: number,
    startTime: number,
    firstChunkAt: number,
    error?: string,
  ): BaselineResult {
    const responseText = contentParts.join('');
    return {
      success,
      responseText,
      codeChanges,
      error,
      metrics: {
        totalTimeMs: Date.now() - startTime,
        timeToFirstChunkMs: firstChunkAt || 0,
        contentLength: responseText.length,
        toolCallCount: toolSequence.length,
        toolsUsed: [...toolsUsedSet],
        toolSequence,
        inputTokens,
        outputTokens,
        iterationCount,
        changesProduced: codeChanges.length,
      },
    };
  }
}
