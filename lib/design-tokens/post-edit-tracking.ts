/**
 * Phase 8a: Post-edit token usage tracking.
 * Scans changed file content for token references and upserts/deletes design_token_usages.
 */

import type { CodeChange } from '@/lib/types/agent';
import {
  listByProject,
  findByName,
  upsertTokenUsage,
  deleteUsagesByTokenAndFile,
} from './models/token-model';

const VAR_PATTERN = /var\(--([\w-]+)\)/g;
const SETTINGS_PATTERN = /\{\{\s*settings\.([\w]+)\s*\}\}/g;

function extractTokenRefs(content: string): Set<string> {
  const refs = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = VAR_PATTERN.exec(content)) !== null) {
    refs.add(m[1]);
  }
  while ((m = SETTINGS_PATTERN.exec(content)) !== null) {
    refs.add(m[1]);
  }
  return refs;
}

/**
 * Track token usages after code changes. Fire-and-forget.
 * - Scans new content for var(--name) and {{ settings.name }}
 * - Matches refs against design_tokens by name
 * - Upserts into design_token_usages
 * - For refs that existed in old content but not in new, deletes the usage row
 */
export async function trackTokenUsagesAfterEdit(
  projectId: string,
  changes: CodeChange[],
  allFiles: { fileName: string; path?: string; content?: string }[],
): Promise<void> {
  try {
    const tokens = await listByProject(projectId);
    const tokenByName = new Map(tokens.map((t) => [t.name.toLowerCase(), t]));

    for (const change of changes) {
      const filePath = change.fileName;
      const newContent = change.proposedContent ?? '';
      const oldFile = allFiles.find(
        (f) => f.fileName === filePath || (f.path ?? '') === filePath,
      );
      const oldContent = oldFile?.content ?? '';

      const oldRefs = extractTokenRefs(oldContent);
      const newRefs = extractTokenRefs(newContent);

      // Delete usages for refs removed from the file
      for (const ref of oldRefs) {
        if (!newRefs.has(ref)) {
          const token = tokenByName.get(ref.toLowerCase()) ?? (await findByName(projectId, ref));
          if (token) {
            await deleteUsagesByTokenAndFile(token.id, filePath);
          }
        }
      }

      // Upsert usages for refs in new content
      const lines = newContent.split('\n');
      for (const ref of newRefs) {
        const token = tokenByName.get(ref.toLowerCase()) ?? (await findByName(projectId, ref));
        if (!token) continue;

        let lineNumber = 1;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes(`var(--${ref})`) || line.includes(`settings.${ref}`)) {
            lineNumber = i + 1;
            break;
          }
        }
        const context = lines[lineNumber - 1]?.trim().slice(0, 200) ?? null;
        await upsertTokenUsage(token.id, filePath, lineNumber, context);
      }
    }
  } catch (err) {
    console.warn('[trackTokenUsagesAfterEdit] Failed:', err);
  }
}
