/**
 * Structural stuck detection for the V2 coordinator loop.
 *
 * Modeled on OpenHands' StuckDetector: detects 5 patterns of unproductive
 * behavior by comparing tool call signatures and content hashes, not just
 * simple counters.
 *
 * @see .cursor/plans/agent_engine_complete_plan_b75fc3a2.plan.md — W3-A
 */

import { createHash } from 'crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ToolCallRecord {
  name: string;
  inputSignature: string;
  contentHash: string;
  isError: boolean;
  isEdit: boolean;
}

export type StuckPattern =
  | 'same_action_observation'
  | 'same_action_error'
  | 'monologue'
  | 'alternating'
  | 'compaction_loop';

export interface StuckDetection {
  isStuck: boolean;
  pattern: StuckPattern | null;
  loopStartIndex: number;
  details: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hashContent(content: string): string {
  return createHash('md5').update(content).digest('hex').slice(0, 12);
}

function buildInputSignature(name: string, input: Record<string, unknown> | undefined): string {
  if (!input) return name;
  const keys = ['filePath', 'file_path', 'path', 'fileId', 'old_text', 'query', 'pattern', 'scope'];
  const parts = [name];
  for (const k of keys) {
    if (input[k] != null) parts.push(`${k}=${String(input[k]).slice(0, 100)}`);
  }
  return parts.join('|');
}

// ── StuckDetector ────────────────────────────────────────────────────────────

const SAME_ACTION_OBS_THRESHOLD = 4;
const SAME_ACTION_ERROR_THRESHOLD = 3;
const MONOLOGUE_THRESHOLD = 3;
const ALTERNATING_WINDOW = 12;
const COMPACTION_LOOP_THRESHOLD = 10;

export class StuckDetector {
  private toolHistory: ToolCallRecord[] = [];
  private assistantMessages: string[] = [];
  private consecutiveCompactions = 0;
  private editsAfterLastCompaction = 0;

  recordToolCall(
    name: string,
    input: Record<string, unknown> | undefined,
    resultContent: string,
    isError: boolean,
    isEdit: boolean,
  ): void {
    this.toolHistory.push({
      name,
      inputSignature: buildInputSignature(name, input),
      contentHash: hashContent(resultContent),
      isError,
      isEdit,
    });

    if (isEdit && !isError) {
      this.resetSameActionCounterForFile(name);
    }
  }

  recordAssistantMessage(content: string): void {
    this.assistantMessages.push(content.slice(0, 500));
  }

  recordCompaction(editsMadeSinceLastCheck: boolean): void {
    if (editsMadeSinceLastCheck) {
      this.consecutiveCompactions = 0;
      this.editsAfterLastCompaction = 0;
    } else {
      this.consecutiveCompactions++;
    }
  }

  /**
   * After a successful edit to the same file, reset the consecutive same-action
   * counter. This handles legitimate read-edit-read cycles.
   */
  private resetSameActionCounterForFile(_name: string): void {
    this.editsAfterLastCompaction++;
  }

  detect(): StuckDetection {
    const noStuck: StuckDetection = { isStuck: false, pattern: null, loopStartIndex: -1, details: '' };

    // Pattern 1: Same action + same observation 4x
    const p1 = this.detectSameActionObservation();
    if (p1.isStuck) return p1;

    // Pattern 2: Same action + error 3x
    const p2 = this.detectSameActionError();
    if (p2.isStuck) return p2;

    // Pattern 3: Agent monologue 3x (no tools)
    const p3 = this.detectMonologue();
    if (p3.isStuck) return p3;

    // Pattern 4: Alternating A1-O1-A2-O2-A1-O1 pattern
    const p4 = this.detectAlternating();
    if (p4.isStuck) return p4;

    // Pattern 5: Compaction loop (10+ compactions with no edits)
    const p5 = this.detectCompactionLoop();
    if (p5.isStuck) return p5;

    return noStuck;
  }

  private detectSameActionObservation(): StuckDetection {
    const h = this.toolHistory;
    if (h.length < SAME_ACTION_OBS_THRESHOLD) {
      return { isStuck: false, pattern: null, loopStartIndex: -1, details: '' };
    }

    const tail = h.slice(-SAME_ACTION_OBS_THRESHOLD);
    const first = tail[0];
    const allSame = tail.every(
      t => t.inputSignature === first.inputSignature &&
           t.contentHash === first.contentHash &&
           !t.isError,
    );

    if (allSame) {
      return {
        isStuck: true,
        pattern: 'same_action_observation',
        loopStartIndex: h.length - SAME_ACTION_OBS_THRESHOLD,
        details: `Tool "${first.name}" called ${SAME_ACTION_OBS_THRESHOLD}x with identical input and output`,
      };
    }
    return { isStuck: false, pattern: null, loopStartIndex: -1, details: '' };
  }

  private detectSameActionError(): StuckDetection {
    const h = this.toolHistory;
    if (h.length < SAME_ACTION_ERROR_THRESHOLD) {
      return { isStuck: false, pattern: null, loopStartIndex: -1, details: '' };
    }

    const tail = h.slice(-SAME_ACTION_ERROR_THRESHOLD);
    const first = tail[0];
    const allSameError = tail.every(
      t => t.inputSignature === first.inputSignature && t.isError,
    );

    if (allSameError) {
      return {
        isStuck: true,
        pattern: 'same_action_error',
        loopStartIndex: h.length - SAME_ACTION_ERROR_THRESHOLD,
        details: `Tool "${first.name}" errored ${SAME_ACTION_ERROR_THRESHOLD}x with same input`,
      };
    }
    return { isStuck: false, pattern: null, loopStartIndex: -1, details: '' };
  }

  private detectMonologue(): StuckDetection {
    const msgs = this.assistantMessages;
    if (msgs.length < MONOLOGUE_THRESHOLD) {
      return { isStuck: false, pattern: null, loopStartIndex: -1, details: '' };
    }

    const tail = msgs.slice(-MONOLOGUE_THRESHOLD);
    const first = tail[0];
    const allSame = tail.every(m => m === first);

    if (allSame && first.length > 0) {
      return {
        isStuck: true,
        pattern: 'monologue',
        loopStartIndex: this.toolHistory.length - 1,
        details: `Agent repeated same message ${MONOLOGUE_THRESHOLD}x without tools`,
      };
    }
    return { isStuck: false, pattern: null, loopStartIndex: -1, details: '' };
  }

  private detectAlternating(): StuckDetection {
    const h = this.toolHistory;
    if (h.length < ALTERNATING_WINDOW) {
      return { isStuck: false, pattern: null, loopStartIndex: -1, details: '' };
    }

    const window = h.slice(-ALTERNATING_WINDOW);
    const signatures = window.map(t => t.inputSignature + ':' + t.contentHash);

    // Check for A-B-A-B pattern (period 2) repeated 3+ times
    if (signatures.length >= 6) {
      const a = signatures[signatures.length - 6];
      const b = signatures[signatures.length - 5];
      if (a !== b) {
        const isAlternating =
          signatures[signatures.length - 4] === a &&
          signatures[signatures.length - 3] === b &&
          signatures[signatures.length - 2] === a &&
          signatures[signatures.length - 1] === b;
        if (isAlternating) {
          return {
            isStuck: true,
            pattern: 'alternating',
            loopStartIndex: h.length - 6,
            details: 'Detected alternating A-B-A-B pattern over 6 tool calls',
          };
        }
      }
    }

    return { isStuck: false, pattern: null, loopStartIndex: -1, details: '' };
  }

  private detectCompactionLoop(): StuckDetection {
    if (this.consecutiveCompactions >= COMPACTION_LOOP_THRESHOLD && this.editsAfterLastCompaction === 0) {
      return {
        isStuck: true,
        pattern: 'compaction_loop',
        loopStartIndex: Math.max(0, this.toolHistory.length - 10),
        details: `${this.consecutiveCompactions} consecutive compactions with no edits`,
      };
    }
    return { isStuck: false, pattern: null, loopStartIndex: -1, details: '' };
  }
}
