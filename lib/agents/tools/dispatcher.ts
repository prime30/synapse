import type { ToolCall, ToolResult } from '@/lib/ai/types';
import { executeToolCall, type ToolExecutorContext } from './tool-executor';
import { executeV2Tool, type V2ToolExecutorContext } from './v2-tool-executor';

const V2_TOOLS = new Set([
  'run_specialist',
  'run_review',
  'get_second_opinion',
  'refresh_memory_anchor',
  'recall_role_memory',
  'get_design_tokens',
  'get_knowledge',
  'create_plan',
  'update_plan',
  'read_plan',
]);

const LONG_RUNNING_TOOLS = new Set(['run_specialist', 'run_review', 'theme_check']);
const DEFAULT_TOOL_TIMEOUT_MS = 60_000;
const LONG_TOOL_TIMEOUT_MS = 120_000;

export interface UnifiedToolContext {
  io: ToolExecutorContext;
  orchestration: V2ToolExecutorContext;
}

function getToolTimeout(toolName: string): number {
  return LONG_RUNNING_TOOLS.has(toolName) ? LONG_TOOL_TIMEOUT_MS : DEFAULT_TOOL_TIMEOUT_MS;
}

/**
 * Unified entry point for all tool execution.
 * Routes to the correct executor based on tool name:
 *   - V2 tools (specialists, review, plans) -> executeV2Tool
 *   - Everything else (file I/O, search, edits) -> executeToolCall
 *
 * Wraps execution in a timeout to prevent tools from hanging forever.
 * Pass signal to abort on client disconnect.
 */
export async function dispatchToolCall(
  toolCall: ToolCall,
  ctx: UnifiedToolContext,
  signal?: AbortSignal,
): Promise<ToolResult> {
  const timeoutMs = getToolTimeout(toolCall.name);

  const execPromise = V2_TOOLS.has(toolCall.name)
    ? executeV2Tool(toolCall, ctx.orchestration)
    : executeToolCall(toolCall, ctx.io);

  const timeoutPromise = new Promise<ToolResult>((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        tool_use_id: toolCall.id,
        content: `Tool ${toolCall.name} timed out after ${timeoutMs / 1000}s. The operation may still be running in the background.`,
        is_error: true,
      });
    }, timeoutMs);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve({
          tool_use_id: toolCall.id,
          content: 'Aborted: client disconnected.',
          is_error: true,
        });
      }, { once: true });
    }
    execPromise.then(() => clearTimeout(timer), () => clearTimeout(timer));
  });

  return Promise.race([execPromise, timeoutPromise]);
}
