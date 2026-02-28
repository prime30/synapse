/**
 * Developer Memory — persistent storage for codebase conventions, decisions,
 * and preferences learned across AI sessions.
 *
 * EPIC 14: AI remembers your coding patterns across sessions.
 */

// ── Types ─────────────────────────────────────────────────────────────

export type MemoryType = 'convention' | 'decision' | 'preference';
export type MemoryFeedback = 'correct' | 'wrong' | null;

/**
 * A detected codebase convention (naming, schema, color approach, etc.).
 */
export interface Convention {
  /** Human-readable pattern description, e.g. "BEM class naming" */
  pattern: string;
  /** Confidence score 0-1 from the detector */
  confidence: number;
  /** Concrete code examples where this convention appears */
  examples: string[];
  /** Where this convention was detected from */
  source: 'naming' | 'schema' | 'color' | 'spacing' | 'structure' | 'custom';
}

/**
 * An explicit decision extracted from agent logs or chat history.
 */
export interface Decision {
  /** What situation prompted this decision */
  context: string;
  /** What was chosen */
  choice: string;
  /** Why it was chosen */
  reasoning: string;
  /** When the decision was made */
  timestamp: string;
}

/**
 * A learned preference from user accept/reject/edit patterns.
 */
export interface Preference {
  /** Category of the preference */
  category: 'style' | 'structure' | 'naming' | 'tooling' | 'workflow';
  /** What the user prefers */
  preference: string;
  /** What the user avoids or rejects */
  antiPattern?: string;
  /** Number of times this preference was observed */
  observationCount: number;
}

/**
 * Union content type stored in the JSONB content column.
 */
export type MemoryContent = Convention | Decision | Preference;

/**
 * A persisted memory entry as returned from the database.
 */
export interface MemoryEntry {
  id: string;
  projectId: string;
  userId: string;
  type: MemoryType;
  content: MemoryContent;
  confidence: number;
  feedback: MemoryFeedback;
  sourceRole?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Shape for creating a new memory entry.
 */
export interface CreateMemoryInput {
  projectId: string;
  userId: string;
  type: MemoryType;
  content: MemoryContent;
  confidence: number;
}

/**
 * Shape for updating a memory entry (partial).
 */
export interface UpdateMemoryInput {
  content?: MemoryContent;
  confidence?: number;
  feedback?: MemoryFeedback;
}

/**
 * User-facing preferences for the memory system.
 */
export interface MemoryPreferences {
  /** Whether the memory system is enabled */
  enabled: boolean;
  /** Whether to auto-detect conventions from theme files */
  autoDetectConventions: boolean;
  /** Whether to extract decisions from chat history */
  extractDecisions: boolean;
  /** Whether to learn from accept/reject actions */
  learnPreferences: boolean;
  /** Minimum confidence threshold for injecting into agent context (0-1) */
  minConfidenceThreshold: number;
}

export const DEFAULT_MEMORY_PREFERENCES: MemoryPreferences = {
  enabled: true,
  autoDetectConventions: true,
  extractDecisions: true,
  learnPreferences: true,
  minConfidenceThreshold: 0.6,
};

// ── Database row mapping ──────────────────────────────────────────────

/** Raw database row shape (snake_case). */
export interface MemoryRow {
  id: string;
  project_id: string;
  user_id: string;
  type: MemoryType;
  content: MemoryContent;
  confidence: number;
  feedback: MemoryFeedback;
  source_role?: string;
  created_at: string;
  updated_at: string;
}

/** Convert a database row to a MemoryEntry. */
export function rowToMemoryEntry(row: MemoryRow): MemoryEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    type: row.type,
    content: row.content,
    confidence: row.confidence,
    feedback: row.feedback,
    sourceRole: row.source_role ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Role-scoped memory loading ────────────────────────────────────────

/**
 * Load developer memories tagged with a specific specialist role.
 * Returns up to 10 most recent entries for the given role.
 */
export async function loadMemoriesByRole(
  supabase: { from: (table: string) => unknown },
  projectId: string,
  userId: string,
  role: string,
): Promise<MemoryEntry[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('developer_memory') as any)
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .eq('source_role', role)
      .order('created_at', { ascending: false })
      .limit(10);
    return (data ?? []).map((row: MemoryRow) => rowToMemoryEntry(row));
  } catch {
    return [];
  }
}

// ── Context injection helpers ─────────────────────────────────────────

/**
 * Format memory entries for injection into agent system prompts (Layer 8).
 * Groups by type and formats as a concise text block.
 */
export function formatMemoryForPrompt(entries: MemoryEntry[]): string {
  if (entries.length === 0) return '';

  const conventions = entries.filter((e) => e.type === 'convention');
  const decisions = entries.filter((e) => e.type === 'decision');
  const preferences = entries.filter((e) => e.type === 'preference');

  const sections: string[] = [];

  if (conventions.length > 0) {
    const lines = conventions.map((e) => {
      const c = e.content as Convention;
      return `- ${c.pattern} (confidence: ${(c.confidence * 100).toFixed(0)}%, source: ${c.source})`;
    });
    sections.push(`## Detected Conventions\n${lines.join('\n')}`);
  }

  if (decisions.length > 0) {
    const lines = decisions.map((e) => {
      const d = e.content as Decision;
      return `- ${d.choice}: ${d.reasoning}`;
    });
    sections.push(`## Past Decisions\n${lines.join('\n')}`);
  }

  if (preferences.length > 0) {
    const lines = preferences.map((e) => {
      const p = e.content as Preference;
      const avoid = p.antiPattern ? ` (avoid: ${p.antiPattern})` : '';
      return `- ${p.preference}${avoid}`;
    });
    sections.push(`## User Preferences\n${lines.join('\n')}`);
  }

  return `\n--- Developer Memory ---\nThe following conventions, decisions, and preferences have been learned from this project. Follow them when generating code.\n\n${sections.join('\n\n')}\n--- End Developer Memory ---\n`;
}

/**
 * Filter memories to only include high-confidence, non-rejected entries.
 */
export function filterActiveMemories(
  entries: MemoryEntry[],
  minConfidence = 0.6
): MemoryEntry[] {
  return entries.filter(
    (e) => e.feedback !== 'wrong' && e.confidence >= minConfidence
  );
}
