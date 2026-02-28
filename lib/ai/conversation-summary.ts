import { getAIProvider } from './get-provider';
import { MODEL_MAP } from '@/lib/agents/model-router';

const SUMMARY_SYSTEM_PROMPT = `You are summarizing a conversation between a user and an AI coding agent for seamless continuation in a new chat session.

Produce a concise summary (under 800 tokens) that includes:

1. **Goal** — What the user is trying to accomplish (one sentence).
2. **Key files** — Files that were read, edited, or discussed, with a one-line note on what happened to each.
3. **Decisions made** — Important architectural or implementation decisions.
4. **Current state** — What was completed, what is in progress, and any open errors or validation issues.
5. **Next steps** — What the user or agent should do next.

Output ONLY the summary. No preamble, no meta-commentary.`;

/**
 * Generates a concise conversation summary for handoff to a new chat session.
 * Uses the cheapest available model (Haiku) since this is a summarization task.
 */
export async function generateConversationSummary(
  messages: { role: string; content: string }[],
): Promise<string> {
  const provider = getAIProvider('anthropic');
  const model = MODEL_MAP.summary;

  const conversationText = messages
    .filter(m => m.content && m.content.length > 0)
    .map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 2000)}`)
    .slice(-40)
    .join('\n\n');

  const result = await provider.complete(
    [
      { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
      { role: 'user', content: `Summarize this conversation:\n\n${conversationText}` },
    ],
    { model, maxTokens: 1024 },
  );

  return result.content?.trim() || 'No summary could be generated.';
}
