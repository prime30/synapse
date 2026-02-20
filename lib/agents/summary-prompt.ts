import type { AIMessage } from '@/lib/ai/types';
import type { AgentResult, CodeChange, ReviewResult, AgentError } from '@/lib/types/agent';
import { estimateTokens } from '@/lib/ai/token-counter';

/** Conversation turn from the frontend (user or assistant). */
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type SummaryMode = 'chat' | 'plan' | 'review' | 'fix' | 'generate' | 'document';

const MODE_INSTRUCTIONS: Record<SummaryMode, string> = {
  chat: 'Respond conversationally. Be natural and concise.',
  plan: `Format your response as a numbered plan:
1. First step
2. Second step
...
Start with "Plan:" and list clear, actionable steps. Include estimated complexity for each step (simple/moderate/complex).`,
  review: `Format your response as a scored review report:
- Start with an overall score (0-100) and verdict (Approved/Needs Changes/Critical Issues)
- Group findings by category: Performance, Accessibility, Best Practices, Liquid Quality
- Each finding should have a severity (error/warning/info) and specific file reference
- End with a summary of top 3 priorities`,
  fix: `Focus on the fix that was applied:
- Explain what the bug/issue was
- Describe the fix clearly
- Note any side effects or things to watch for
- Suggest a way to prevent this in the future`,
  generate: `Focus on the generated code:
- Briefly describe what was generated
- Highlight key design decisions
- Note any settings or customization points
- Suggest next steps (testing, preview, customization)`,
  document: `Format your response as documentation:
- Use clear headings and sections
- Include code examples where relevant
- Add parameter/prop descriptions
- Keep language precise and technical`,
};

const SYSTEM_PROMPT = `
You are an AI coding assistant embedded in a Shopify theme IDE called Synapse.
You just executed a set of code changes on the user's behalf using specialist agents.
Your job is to explain what you did in a clear, conversational way.

Guidelines:
- Be concise and direct — do not be verbose or overly formal.
- Reference specific file names using backticks (e.g. \`assets/theme.css\`).
- Use **bold** for section labels when listing multiple items.
- Use bullet lists for multiple changes or issues.
- When changes were made, explain what was changed and why for each file.
- When the review agent found issues, mention them with their severity.
- If the operation failed, explain the error simply and suggest what the user can try.
- If no changes were needed, explain why.
- When there is conversation history, respond in context — reference prior changes, acknowledge follow-ups, and avoid repeating information the user already knows.
- Never fabricate changes that didn't happen. Only describe what the structured result contains.

## Tool Usage

You have tools available to interact with the user. Use them when appropriate:
- When proposing code changes, use the \`propose_code_edit\` tool for each file. The user will see a diff and can approve or reject.
- When proposing a multi-step plan, use the \`propose_plan\` tool instead of writing numbered steps in plain text.
- When you need clarification, use the \`ask_clarification\` tool with specific options.
- When changes affect a visible page, use the \`navigate_preview\` tool to show the result.
- When creating a new file, use the \`create_file\` tool so the user can confirm.

You can also include regular text alongside tool calls to provide conversational context.
If no tools are relevant, just respond with regular text.
`.trim();

/**
 * Build the AIMessage[] array for the streaming summary call.
 *
 * Structure:
 *   1. System prompt (persona + formatting instructions)
 *   2. Conversation history (prior user/assistant turns)
 *   3. Current user message with structured result injected
 */
export function buildSummaryMessages(
  userRequest: string,
  result: AgentResult,
  history: HistoryMessage[] = [],
  mode: SummaryMode = 'chat'
): AIMessage[] {
  const systemPrompt = `${SYSTEM_PROMPT}\n\n## Output Format\n${MODE_INSTRUCTIONS[mode]}`;

  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // History is already trimmed by the frontend (trimHistory in AgentPromptPanel).
  // Pass through directly to avoid double-trimming.
  const trimmedHistory = history;
  const historySummary = '';

  // Add trimmed conversation history as prior turns
  for (const msg of trimmedHistory) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    });
  }

  // Build the current turn: user request + structured result context
  const contextBlock = formatResultContext(result);
  const contextPrefix = historySummary
    ? `[Context from earlier conversation]:\n${historySummary}\n\n`
    : '';

  messages.push({
    role: 'user',
    content: contextPrefix + [
      `The user asked: "${userRequest}"`,
      '',
      '--- Agent Execution Result ---',
      contextBlock,
      '--- End Result ---',
      '',
      'Now explain to the user what happened in a conversational way. Follow the guidelines in your system prompt.',
    ].join('\n'),
  });

  return messages;
}

/**
 * Build a thin summary prompt that only formats code changes into tool calls.
 * Used when the PM already explored the codebase (user saw reasoning + tool events)
 * and only the specialist changes need formatting.
 */
export function buildThinSummaryMessages(
  userRequest: string,
  result: AgentResult,
  history: HistoryMessage[] = [],
): AIMessage[] {
  const thinPrompt = `
You are an AI coding assistant in a Shopify theme IDE called Synapse.
The user has already seen your analysis. Now you only need to present the code changes.

Rules:
- Be very brief — the user already understands the context.
- For each file change, use the propose_code_edit tool.
- Add 1-2 sentences of summary, no more.
- Do NOT re-explain the analysis — the user saw it in real-time.
`.trim();

  const messages: AIMessage[] = [
    { role: 'system', content: thinPrompt },
  ];

  for (const msg of history) {
    messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
  }

  const changesBlock = result.changes && result.changes.length > 0
    ? formatChanges(result.changes)
    : 'No file changes.';

  messages.push({
    role: 'user',
    content: [
      `User asked: "${userRequest}"`,
      '',
      changesBlock,
      '',
      'Present these changes to the user using the propose_code_edit tool for each file.',
    ].join('\n'),
  });

  return messages;
}

/** Format the structured AgentResult into a readable context block for the summary model. */
function formatResultContext(result: AgentResult): string {
  const sections: string[] = [];

  // Success / failure status
  sections.push(`Success: ${result.success}`);

  // Clarification needed
  if ((result as unknown as Record<string, unknown>).needsClarification) {
    sections.push('Needs clarification: true');
    if (result.analysis) {
      sections.push(`Clarification question: ${result.analysis}`);
    }
  }

  // Error (if failed)
  if (!result.success && result.error) {
    sections.push(formatError(result.error));
  }

  // PM analysis (skip if already used for clarification)
  // Truncate to 2000 tokens max to prevent summary calls from overflowing
  if (result.analysis && !(result as unknown as Record<string, unknown>).needsClarification) {
    const MAX_ANALYSIS_TOKENS = 2_000;
    let analysis = result.analysis;
    if (estimateTokens(analysis) > MAX_ANALYSIS_TOKENS) {
      // Keep the beginning (most important context) and truncate
      const lines = analysis.split('\n');
      let kept = '';
      let tokens = 0;
      for (const line of lines) {
        const lineTokens = estimateTokens(line);
        if (tokens + lineTokens > MAX_ANALYSIS_TOKENS) break;
        kept += (kept ? '\n' : '') + line;
        tokens += lineTokens;
      }
      analysis = kept + '\n[... analysis truncated for budget ...]';
    }
    sections.push(`Analysis: ${analysis}`);
  }

  // Code changes
  if (result.changes && result.changes.length > 0) {
    sections.push(formatChanges(result.changes));
  } else if (result.success) {
    sections.push('No file changes were made.');
  }

  // Review result
  if (result.reviewResult) {
    sections.push(formatReview(result.reviewResult));
  }

  return sections.join('\n\n');
}

function formatError(error: AgentError): string {
  return [
    'Error:',
    `  Code: ${error.code}`,
    `  Message: ${error.message}`,
    `  Agent: ${error.agentType}`,
    `  Recoverable: ${error.recoverable}`,
  ].join('\n');
}

function formatChanges(changes: CodeChange[]): string {
  const lines = [`Changes (${changes.length}):`];
  for (const c of changes) {
    lines.push(`  - File: ${c.fileName}`);
    lines.push(`    Agent: ${c.agentType}`);
    lines.push(`    Reasoning: ${c.reasoning}`);
  }
  return lines.join('\n');
}

function formatReview(review: ReviewResult): string {
  const lines = [
    `Review: ${review.approved ? 'Approved' : 'Not approved'}`,
    `Summary: ${review.summary}`,
  ];

  if (review.issues.length > 0) {
    lines.push(`Issues (${review.issues.length}):`);
    for (const issue of review.issues) {
      lines.push(`  - [${issue.severity}] ${issue.file}: ${issue.description}`);
      if (issue.suggestion) {
        lines.push(`    Suggestion: ${issue.suggestion}`);
      }
    }
  }

  return lines.join('\n');
}
