import type { AIMessage } from '@/lib/ai/types';
import type { AgentResult, CodeChange, ReviewResult, AgentError } from '@/lib/types/agent';
import { trimHistory } from '@/lib/ai/history-window';

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

  // Trim history to prevent context overflow
  const { messages: trimmedHistory, summary: historySummary } = trimHistory(history);

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
  if (result.analysis && !(result as unknown as Record<string, unknown>).needsClarification) {
    sections.push(`Analysis: ${result.analysis}`);
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
