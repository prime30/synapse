import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/admin';

export interface LedgerArtifact {
  filePath: string;
  newContent: string;
  reasoning?: string;
  capturedAt?: string;
  checksum: string;
  confidence: number;
  sourceExecutionId: string;
}

interface ResolveLedgerInput {
  projectId: string;
  userId: string;
  preferredPaths?: string[];
  maxExecutions?: number;
  maxArtifacts?: number;
}

function computeChecksum(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export async function resolveReferentialArtifactsFromExecutions(
  input: ResolveLedgerInput,
): Promise<LedgerArtifact[]> {
  const supabase = createServiceClient();
  const maxExecutions = input.maxExecutions ?? 16;
  const maxArtifacts = input.maxArtifacts ?? 8;
  const preferred = new Set((input.preferredPaths ?? []).map((p) => p.trim()).filter(Boolean));

  const { data, error } = await supabase
    .from('agent_executions')
    .select('id, started_at, proposed_changes')
    .eq('project_id', input.projectId)
    .eq('user_id', input.userId)
    .order('started_at', { ascending: false })
    .limit(maxExecutions);

  if (error || !data) return [];

  const candidates: LedgerArtifact[] = [];
  for (let execIdx = 0; execIdx < data.length; execIdx++) {
    const row = data[execIdx] as {
      id: string;
      started_at: string;
      proposed_changes: Array<{ fileName?: string; proposedContent?: string; reasoning?: string }> | null;
    };
    const changes = Array.isArray(row.proposed_changes) ? row.proposed_changes : [];
    for (const change of changes) {
      const filePath = String(change.fileName ?? '').trim();
      const newContent = String(change.proposedContent ?? '');
      if (!filePath || !newContent) continue;
      const recencyWeight = Math.max(0.35, 1 - execIdx * 0.08);
      const preferredBoost = preferred.has(filePath) ? 0.1 : 0;
      candidates.push({
        filePath,
        newContent,
        reasoning: change.reasoning,
        capturedAt: row.started_at,
        checksum: computeChecksum(newContent),
        confidence: Math.min(0.99, recencyWeight + preferredBoost),
        sourceExecutionId: row.id,
      });
    }
  }

  const deduped: LedgerArtifact[] = [];
  const seen = new Set<string>();
  for (const artifact of candidates) {
    const key = `${artifact.filePath}:${artifact.checksum}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(artifact);
    if (deduped.length >= maxArtifacts) break;
  }
  return deduped;
}
