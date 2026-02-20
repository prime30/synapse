/**
 * Schema for manual Cursor agent captures.
 *
 * To add a capture:
 * 1. Open the same theme files (from theme-workspace/) in Cursor
 * 2. Run the exact scenario prompt in Cursor's agent mode
 * 3. Copy the full output into a JSON file matching CursorCapture
 * 4. Save as {scenario}-cursor.json (e.g., ask-cursor.json)
 */

export interface CursorCapture {
  /** Scenario key matching the test: 'ask' | 'code' | 'debug' */
  scenario: string;
  /** Exact prompt used (should match the test prompt) */
  prompt: string;
  /** ISO timestamp of when the capture was made */
  capturedAt: string;
  /** Model shown in Cursor UI (e.g., 'claude-3.5-sonnet', 'cursor-small') */
  cursorModel: string;
  /** Full agent response text */
  responseText: string;
  /** Code edits proposed by Cursor's agent */
  codeChanges?: Array<{
    fileName: string;
    content: string;
  }>;
  /** Approximate total time in ms (manual stopwatch) */
  totalTimeMs?: number;
  /** Tools observed in Cursor's UI (file reads, searches, etc.) */
  toolsObserved?: string[];
  /** Any qualitative observations */
  notes?: string;
}
