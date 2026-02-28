/**
 * Transcript Capture — structures raw SSE events from the V2 agent stream
 * into an analyzable transcript with tool sequences, thinking blocks,
 * decision points, and outcome data.
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface CanaryTranscript {
  runId: string;
  scenario: string;

  decisions: Array<{
    phase: string;
    label: string;
    detail?: string;
    timestamp: number;
  }>;

  toolSequence: Array<{
    name: string;
    id: string;
    input?: Record<string, unknown>;
    result?: string;
    isError: boolean;
    reasoning?: string;
    elapsedMs: number;
  }>;

  reasoningBlocks: Array<{
    agent: string;
    text: string;
  }>;

  responseText: string;

  outcome: {
    status: 'applied' | 'no-change' | 'blocked-policy' | 'needs-input';
    changedFiles: number;
    changeSummary?: string;
    failureReason?: string;
    suggestedAction?: string;
    failedTool?: string;
    failedFilePath?: string;
    validationIssues?: Array<{ gate: string; errors: string[]; changesKept: boolean }>;
  };

  executionLog?: unknown[];
  proposedChanges?: Array<{
    fileName: string;
    originalContent?: string;
    proposedContent?: string;
    reasoning?: string;
  }>;

  metrics: {
    totalToolCalls: number;
    editToolCalls: number;
    readToolCalls: number;
    searchToolCalls: number;
    elapsedMs: number;
    costCents: number;
    inputTokens: number;
    outputTokens: number;
  };
}

interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

interface ExecutionData {
  execution_log?: unknown[];
  proposed_changes?: Array<{
    fileName: string;
    originalContent?: string;
    proposedContent?: string;
    reasoning?: string;
  }>;
}

interface UsageData {
  costCents: number;
  inputTokens: number;
  outputTokens: number;
}

// ── Tool classification ──────────────────────────────────────────────────

const EDIT_TOOL_NAMES = new Set([
  'search_replace', 'propose_code_edit', 'edit_lines',
  'write_file', 'create_file', 'run_specialist',
]);

const READ_TOOL_NAMES = new Set([
  'read_file', 'read_lines', 'read_chunk', 'extract_region',
  'parallel_batch_read', 'get_schema_settings',
]);

const SEARCH_TOOL_NAMES = new Set([
  'search_files', 'grep_content', 'semantic_search',
  'find_references',
]);

function classifyTool(name: string): 'edit' | 'read' | 'search' | 'other' {
  if (EDIT_TOOL_NAMES.has(name)) return 'edit';
  if (READ_TOOL_NAMES.has(name)) return 'read';
  if (SEARCH_TOOL_NAMES.has(name)) return 'search';
  return 'other';
}

const MAX_RESULT_LENGTH = 2000;

function truncateResult(text: string): string {
  if (text.length <= MAX_RESULT_LENGTH) return text;
  return text.slice(0, MAX_RESULT_LENGTH) + `\n... [truncated ${text.length - MAX_RESULT_LENGTH} chars]`;
}

// ── Main structuring function ────────────────────────────────────────────

export function structureTranscript(
  events: SSEEvent[],
  runId: string,
  scenario: string,
  elapsedMs: number,
  executionData?: ExecutionData,
  usageData?: UsageData,
): CanaryTranscript {
  const decisions: CanaryTranscript['decisions'] = [];
  const toolSequence: CanaryTranscript['toolSequence'] = [];
  const reasoningBlocks: CanaryTranscript['reasoningBlocks'] = [];
  let responseText = '';

  // Pending tool calls (waiting for result)
  const pendingToolCalls = new Map<string, {
    name: string;
    input?: Record<string, unknown>;
    reasoning?: string;
    startTime: number;
  }>();

  let lastReasoning = '';
  const startTime = Date.now();

  for (const evt of events) {
    switch (evt.type) {
      case 'thinking': {
        const phase = String(evt.phase ?? '');
        const label = String(evt.label ?? '');
        const detail = evt.detail ? String(evt.detail) : undefined;
        const metadata = evt.metadata as Record<string, unknown> | undefined;
        const metaStr = metadata
          ? Object.entries(metadata).map(([k, v]) => `${k}=${v}`).join(', ')
          : undefined;
        decisions.push({
          phase,
          label,
          detail: detail || metaStr,
          timestamp: Date.now() - startTime,
        });
        break;
      }

      case 'reasoning': {
        const text = String(evt.text ?? '');
        const agent = String(evt.agent ?? 'pm');
        if (text) {
          reasoningBlocks.push({ agent, text });
          lastReasoning = text;
        }
        break;
      }

      case 'tool_call': {
        const toolId = String(evt.id ?? evt.toolCallId ?? '');
        const name = String(evt.name ?? '');
        const input = (evt.input ?? evt.arguments) as Record<string, unknown> | undefined;
        pendingToolCalls.set(toolId, {
          name,
          input,
          reasoning: lastReasoning || undefined,
          startTime: Date.now(),
        });
        lastReasoning = '';
        break;
      }

      case 'tool_result': {
        const toolId = String(evt.id ?? evt.tool_use_id ?? evt.toolCallId ?? '');
        const content = String(evt.content ?? evt.result ?? '');
        const isError = Boolean(evt.is_error ?? evt.isError ?? false);
        const pending = pendingToolCalls.get(toolId);

        toolSequence.push({
          name: pending?.name ?? 'unknown',
          id: toolId,
          input: pending?.input,
          result: truncateResult(content),
          isError,
          reasoning: pending?.reasoning,
          elapsedMs: pending ? Date.now() - pending.startTime : 0,
        });
        pendingToolCalls.delete(toolId);
        break;
      }

      case 'text_chunk':
      case 'content_chunk': {
        responseText += String(evt.text ?? evt.content ?? '');
        break;
      }

      case 'execution_outcome': {
        // Outcome event is handled below when building the outcome object
        break;
      }
    }
  }

  // Flush any pending tool calls that never received results
  for (const [id, pending] of pendingToolCalls) {
    toolSequence.push({
      name: pending.name,
      id,
      input: pending.input,
      result: '(no result received)',
      isError: true,
      reasoning: pending.reasoning,
      elapsedMs: Date.now() - pending.startTime,
    });
  }

  // Build outcome from execution_outcome SSE event
  const outcomeEvent = events.find(e => e.type === 'execution_outcome');
  const outcome: CanaryTranscript['outcome'] = {
    status: 'no-change',
    changedFiles: 0,
  };

  if (outcomeEvent) {
    const status = String(outcomeEvent.outcome ?? outcomeEvent.status ?? 'no-change');
    outcome.status = (['applied', 'no-change', 'blocked-policy', 'needs-input'].includes(status)
      ? status
      : 'no-change') as CanaryTranscript['outcome']['status'];
    outcome.changedFiles = Number(outcomeEvent.changedFiles ?? outcomeEvent.changeCount ?? 0);
    outcome.changeSummary = outcomeEvent.changeSummary ? String(outcomeEvent.changeSummary) : undefined;
    outcome.failureReason = outcomeEvent.failureReason ? String(outcomeEvent.failureReason) : undefined;
    outcome.suggestedAction = outcomeEvent.suggestedAction ? String(outcomeEvent.suggestedAction) : undefined;
    outcome.failedTool = outcomeEvent.failedTool ? String(outcomeEvent.failedTool) : undefined;
    outcome.failedFilePath = outcomeEvent.failedFilePath ? String(outcomeEvent.failedFilePath) : undefined;
    outcome.validationIssues = outcomeEvent.validationIssues as CanaryTranscript['outcome']['validationIssues'];
  }

  // Compute metrics
  const editToolCalls = toolSequence.filter(t => classifyTool(t.name) === 'edit').length;
  const readToolCalls = toolSequence.filter(t => classifyTool(t.name) === 'read').length;
  const searchToolCalls = toolSequence.filter(t => classifyTool(t.name) === 'search').length;

  return {
    runId,
    scenario,
    decisions,
    toolSequence,
    reasoningBlocks,
    responseText,
    outcome,
    executionLog: executionData?.execution_log,
    proposedChanges: executionData?.proposed_changes,
    metrics: {
      totalToolCalls: toolSequence.length,
      editToolCalls,
      readToolCalls,
      searchToolCalls,
      elapsedMs,
      costCents: usageData?.costCents ?? 0,
      inputTokens: usageData?.inputTokens ?? 0,
      outputTokens: usageData?.outputTokens ?? 0,
    },
  };
}
