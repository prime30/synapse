/**
 * Scratchpad tool — agent memory that gets rewritten (not appended)
 * to maintain focus across long conversations.
 */

const scratchpads = new Map<string, string>();

export function executeScratchpadRead(sessionId: string): { content: string } {
  return { content: scratchpads.get(sessionId) || '(empty scratchpad)' };
}

export function executeScratchpadWrite(sessionId: string, content: string): { success: boolean } {
  scratchpads.set(sessionId, content);
  return { success: true };
}
