/**
 * Preview DOM interaction tools for AI agents.
 *
 * Read tools call the server-side preview inspect API which checks
 * the in-memory DOM cache (populated by the frontend synapse-bridge).
 * Write tools (inject_css, inject_html) post actions to the same API.
 */

const PREVIEW_API_BASE = '/api/projects';
const MAX_WAIT_MS = 5_000;
const POLL_INTERVAL_MS = 500;

export interface PreviewInspectResult {
  success: boolean;
  data?: unknown;
  error?: string;
  cached?: boolean;
}

/**
 * Call the preview inspect API with retry/wait for cache population.
 * Returns structured result or error.
 */
export async function callPreviewAPI(
  projectId: string,
  action: string,
  params: Record<string, unknown> = {},
  baseUrl?: string,
): Promise<PreviewInspectResult> {
  const url = `${baseUrl || ''}${PREVIEW_API_BASE}/${projectId}/preview/inspect`;

  const startTime = Date.now();
  let lastResult: PreviewInspectResult | null = null;

  // Poll with retry for cache availability
  while (Date.now() - startTime < MAX_WAIT_MS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params }),
      });

      if (response.status === 202) {
        // Cache not populated yet — preview may not be active
        lastResult = { success: false, error: 'Preview not active — DOM cache not populated yet' };
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }

      if (!response.ok) {
        return { success: false, error: `Preview API returned ${response.status}` };
      }

      const data = await response.json();
      return { success: true, data, cached: !!data?.cached };
    } catch (err) {
      lastResult = { success: false, error: `Preview API error: ${err instanceof Error ? err.message : String(err)}` };
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  return lastResult || { success: false, error: 'Preview not active — timed out waiting for DOM cache' };
}

/**
 * Format preview DOM data for LLM consumption.
 * Truncates to stay within token budget.
 */
export function formatPreviewResult(data: unknown, maxChars: number = 2000): string {
  const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  if (str.length <= maxChars) return str;
  return str.slice(0, maxChars) + '\n... (truncated)';
}
