/**
 * Creates a shareable link for an agent chat session summary.
 * POST /api/projects/[projectId]/agent-chat/sessions/[sessionId]/share-summary
 */

export async function shareSessionSummary(
  projectId: string,
  sessionId: string
): Promise<{ url: string; token: string }> {
  const res = await fetch(
    `/api/projects/${projectId}/agent-chat/sessions/${sessionId}/share-summary`,
    { method: 'POST' }
  );
  if (!res.ok) throw new Error('Failed to create share link');
  const data = await res.json();
  return { url: data.url ?? `/s/${data.token}`, token: data.token };
}
