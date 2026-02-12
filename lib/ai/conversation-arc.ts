/**
 * ConversationArc tracks conversation turns and detects patterns
 * to enable progressive disclosure of suggestions.
 *
 * Gating rules:
 * - Turns 1-2: simple suggestions only
 * - Turns 3-4: intermediate suggestions
 * - Turns 5+: advanced suggestions
 *
 * Loop detection: if the same action type repeats 3+ times,
 * trigger escalation.
 */

export type SuggestionTier = 'simple' | 'intermediate' | 'advanced';

export interface EscalationTrigger {
  type: 'loop_detected' | 'error_cascade' | 'scope_expansion';
  turnNumber: number;
  details: string;
}

export class ConversationArc {
  private turns: Array<{
    role: 'user' | 'assistant';
    actionType?: string;
    timestamp: number;
  }> = [];
  private escalations: EscalationTrigger[] = [];

  /** Record a new turn in the conversation. */
  addTurn(role: 'user' | 'assistant', actionType?: string): void {
    this.turns.push({ role, actionType, timestamp: Date.now() });

    // Check for escalation triggers after each turn
    const loop = this.detectLoop();
    if (loop && !this.escalations.some((e) => e.type === 'loop_detected' && e.turnNumber === loop.turnNumber)) {
      this.escalations.push(loop);
    }

    const cascade = this.detectErrorCascade();
    if (cascade && !this.escalations.some((e) => e.type === 'error_cascade' && e.turnNumber === cascade.turnNumber)) {
      this.escalations.push(cascade);
    }
  }

  /** Get the current turn count. */
  get turnCount(): number {
    return this.turns.length;
  }

  /** Get the current suggestion tier based on turn count. */
  get currentTier(): SuggestionTier {
    const count = this.turnCount;
    if (count <= 2) return 'simple';
    if (count <= 4) return 'intermediate';
    return 'advanced';
  }

  /**
   * Get the escalation multiplier (1.0 = normal, higher = more complex suggestions).
   * Escalation happens when loops are detected or errors cascade.
   */
  get escalationFactor(): number {
    const hasErrorCascade = this.escalations.some((e) => e.type === 'error_cascade');
    if (hasErrorCascade) return 2.0;

    const hasLoop = this.escalations.some((e) => e.type === 'loop_detected');
    if (hasLoop) return 1.5;

    return 1.0;
  }

  /** Check if a loop has been detected (same action type 3+ times in a row). */
  detectLoop(): EscalationTrigger | null {
    if (this.turns.length < 3) return null;

    const lastThree = this.turns.slice(-3);
    const actionTypes = lastThree.map((t) => t.actionType).filter(Boolean);

    // Need all 3 turns to have an action type and all must match
    if (actionTypes.length < 3) return null;
    if (actionTypes[0] === actionTypes[1] && actionTypes[1] === actionTypes[2]) {
      return {
        type: 'loop_detected',
        turnNumber: this.turnCount,
        details: `Action "${actionTypes[0]}" repeated ${actionTypes.length} times consecutively`,
      };
    }

    return null;
  }

  /** Check if errors are cascading (2+ error/fix actions in last 4 turns). */
  detectErrorCascade(): EscalationTrigger | null {
    if (this.turns.length < 2) return null;

    const recentTurns = this.turns.slice(-4);
    const errorActions = recentTurns.filter(
      (t) => t.actionType && (t.actionType.includes('error') || t.actionType.includes('fix'))
    );

    if (errorActions.length >= 2) {
      return {
        type: 'error_cascade',
        turnNumber: this.turnCount,
        details: `${errorActions.length} error/fix actions detected in last ${recentTurns.length} turns`,
      };
    }

    return null;
  }

  /** Get all active escalation triggers. */
  getEscalations(): EscalationTrigger[] {
    return [...this.escalations];
  }

  /** Reset the arc (e.g., on chat clear). */
  reset(): void {
    this.turns = [];
    this.escalations = [];
  }
}
