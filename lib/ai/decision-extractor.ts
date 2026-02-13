/**
 * Decision Extractor — parses agent execution logs and chat history
 * for explicit decisions.
 *
 * EPIC 14: Extracts "I chose X because Y" and "Let's use Z approach"
 * patterns from conversation histories to persist as developer memory.
 */

import type { Decision, CreateMemoryInput } from './developer-memory';

// ── Types ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface AgentLogEntry {
  agentType: string;
  action: string;
  input?: string;
  output?: string;
  timestamp: string;
}

export interface ExtractedDecision {
  decision: Decision;
  /** Confidence that this is a genuine decision (0-1) */
  confidence: number;
  /** The raw text that was parsed to extract this decision */
  sourceText: string;
}

// ── Decision patterns ─────────────────────────────────────────────────

/**
 * Regex patterns that indicate an explicit decision in text.
 * Each pattern captures: (1) what was chosen, (2) reasoning (optional).
 */
const DECISION_PATTERNS: Array<{
  pattern: RegExp;
  extract: (match: RegExpExecArray) => { choice: string; reasoning: string };
  confidence: number;
}> = [
  {
    // "I chose X because Y"
    pattern: /I (?:chose|choose|selected|picked|went with)\s+(.+?)\s+because\s+(.+?)(?:\.|$)/gi,
    extract: (m) => ({ choice: m[1].trim(), reasoning: m[2].trim() }),
    confidence: 0.9,
  },
  {
    // "Let's use X approach" / "Let's go with X"
    pattern: /[Ll]et['']?s (?:use|go with|try|adopt|implement)\s+(.+?)(?:\s+(?:because|since|as|for)\s+(.+?))?(?:\.|$)/gi,
    extract: (m) => ({
      choice: m[1].trim(),
      reasoning: m[2]?.trim() ?? 'Explicitly chosen approach',
    }),
    confidence: 0.85,
  },
  {
    // "We should use X" / "We'll use X"
    pattern: /[Ww]e (?:should|will|'ll|must|need to)\s+(?:use|go with|adopt|implement)\s+(.+?)(?:\s+(?:because|since|as|for)\s+(.+?))?(?:\.|$)/gi,
    extract: (m) => ({
      choice: m[1].trim(),
      reasoning: m[2]?.trim() ?? 'Team decision',
    }),
    confidence: 0.8,
  },
  {
    // "I recommend X over Y"
    pattern: /I (?:recommend|suggest|prefer)\s+(.+?)\s+over\s+(.+?)(?:\.|$)/gi,
    extract: (m) => ({
      choice: m[1].trim(),
      reasoning: `Preferred over ${m[2].trim()}`,
    }),
    confidence: 0.85,
  },
  {
    // "Decision: X" or "Decided: X"
    pattern: /(?:Decision|Decided|Conclusion):\s*(.+?)(?:\.\s+(?:Reason|Because):\s*(.+?))?(?:\.|$)/gi,
    extract: (m) => ({
      choice: m[1].trim(),
      reasoning: m[2]?.trim() ?? 'Explicit decision',
    }),
    confidence: 0.9,
  },
  {
    // "The best approach is X"
    pattern: /[Tt]he (?:best|right|correct|recommended|optimal)\s+(?:approach|way|method|solution|strategy)\s+(?:is|would be)\s+(.+?)(?:\s+(?:because|since)\s+(.+?))?(?:\.|$)/gi,
    extract: (m) => ({
      choice: m[1].trim(),
      reasoning: m[2]?.trim() ?? 'Recommended approach',
    }),
    confidence: 0.75,
  },
];

/**
 * Minimum length for a valid choice/decision text to avoid false positives.
 */
const MIN_CHOICE_LENGTH = 5;
const MAX_CHOICE_LENGTH = 200;

// ── Extraction functions ──────────────────────────────────────────────

/**
 * Extract decisions from a single text block (chat message or log entry).
 */
function extractFromText(
  text: string,
  timestamp: string,
  contextPrefix = ''
): ExtractedDecision[] {
  const results: ExtractedDecision[] = [];

  for (const { pattern, extract, confidence } of DECISION_PATTERNS) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const { choice, reasoning } = extract(match);

      // Filter out too-short or too-long matches
      if (choice.length < MIN_CHOICE_LENGTH || choice.length > MAX_CHOICE_LENGTH) {
        continue;
      }

      // Build context from surrounding text
      const matchStart = Math.max(0, match.index - 50);
      const matchEnd = Math.min(text.length, match.index + match[0].length + 50);
      const context = contextPrefix
        ? `${contextPrefix}: ${text.slice(matchStart, matchEnd).trim()}`
        : text.slice(matchStart, matchEnd).trim();

      results.push({
        decision: {
          context: context.slice(0, 300),
          choice,
          reasoning,
          timestamp,
        },
        confidence,
        sourceText: match[0],
      });
    }
  }

  return results;
}

/**
 * De-duplicate decisions based on similar choice text.
 * Keeps the highest-confidence version when duplicates are found.
 */
function deduplicateDecisions(
  decisions: ExtractedDecision[]
): ExtractedDecision[] {
  const seen = new Map<string, ExtractedDecision>();

  for (const d of decisions) {
    // Normalize choice text for comparison
    const key = d.decision.choice.toLowerCase().replace(/\s+/g, ' ').trim();

    const existing = seen.get(key);
    if (!existing || d.confidence > existing.confidence) {
      seen.set(key, d);
    }
  }

  return [...seen.values()];
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Extract decisions from a chat conversation history.
 */
export function extractDecisionsFromChat(
  messages: ChatMessage[]
): ExtractedDecision[] {
  const results: ExtractedDecision[] = [];

  for (const msg of messages) {
    // Only extract from user and assistant messages (not system)
    if (msg.role === 'system') continue;

    const timestamp =
      msg.timestamp ?? new Date().toISOString();
    const prefix = msg.role === 'user' ? 'User stated' : 'AI recommended';

    results.push(...extractFromText(msg.content, timestamp, prefix));
  }

  return deduplicateDecisions(results);
}

/**
 * Extract decisions from agent execution logs.
 */
export function extractDecisionsFromLogs(
  logs: AgentLogEntry[]
): ExtractedDecision[] {
  const results: ExtractedDecision[] = [];

  for (const log of logs) {
    // Check the agent's output for decisions
    if (log.output) {
      const prefix = `Agent (${log.agentType}) during ${log.action}`;
      results.push(...extractFromText(log.output, log.timestamp, prefix));
    }

    // Check input for user-stated decisions
    if (log.input) {
      results.push(
        ...extractFromText(log.input, log.timestamp, 'User instruction')
      );
    }
  }

  return deduplicateDecisions(results);
}

/**
 * Convert extracted decisions into memory entries ready for persistence.
 */
export function decisionsToMemoryInputs(
  decisions: ExtractedDecision[],
  projectId: string,
  userId: string
): CreateMemoryInput[] {
  return decisions.map((ed) => ({
    projectId,
    userId,
    type: 'decision' as const,
    content: ed.decision,
    confidence: ed.confidence,
  }));
}
