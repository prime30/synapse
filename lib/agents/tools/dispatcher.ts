import type { ToolCall, ToolResult } from '@/lib/ai/types';
import { executeToolCall, type ToolExecutorContext } from './tool-executor';
import { executeV2Tool, type V2ToolExecutorContext } from './v2-tool-executor';

const V2_TOOLS = new Set([
  'run_specialist',
  'run_review',
  'get_second_opinion',
  'refresh_memory_anchor',
  'recall_role_memory',
  'create_plan',
  'update_plan',
  'read_plan',
]);

export interface UnifiedToolContext {
  io: ToolExecutorContext;
  orchestration: V2ToolExecutorContext;
}

/**
 * Unified entry point for all tool execution.
 * Routes to the correct executor based on tool name:
 *   - V2 tools (specialists, review, plans) -> executeV2Tool
 *   - Everything else (file I/O, search, edits) -> executeToolCall
 */
export async function dispatchToolCall(
  toolCall: ToolCall,
  ctx: UnifiedToolContext,
): Promise<ToolResult> {
  if (V2_TOOLS.has(toolCall.name)) {
    return executeV2Tool(toolCall, ctx.orchestration);
  }
  return executeToolCall(toolCall, ctx.io);
}
