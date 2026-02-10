/**
 * REQ-52: Theme Ingestion Service
 * Runs after a theme is uploaded: extracts tokens, detects components,
 * and persists both to the design system tables.
 */

import { TokenExtractor } from '../token-extractor';
import { inferTokens } from '../inference';
import { detectComponents, type DetectedComponent } from './component-detector';
import {
  createToken,
  createUsage,
  deleteUsagesByToken,
  listByProject,
} from '../models/token-model';
import type { ExtractedToken, TokenCategory } from '../types';

interface ThemeFile {
  id: string;
  path: string;
  content: string;
}

export interface IngestionResult {
  tokensCreated: number;
  tokensUpdated: number;
  componentsDetected: number;
  components: DetectedComponent[];
  totalFilesAnalyzed: number;
}

/**
 * Ingest a project's theme files: extract tokens, detect components,
 * persist to DB.
 *
 * @param projectId  The project UUID.
 * @param files      Array of theme files with content.
 */
export async function ingestTheme(
  projectId: string,
  files: ThemeFile[],
): Promise<IngestionResult> {
  const extractor = new TokenExtractor();

  // 1. Extract tokens from all files
  const extractedTokens = extractor.extractFromFiles(
    files.map((f) => ({ content: f.content, filePath: f.path })),
  );

  // 2. Infer names and grouping
  const inferred = inferTokens(extractedTokens);

  // 3. Detect components
  const components = detectComponents(
    files.map((f) => ({ path: f.path, name: f.path.split('/').pop() ?? f.path })),
  );

  // 4. Persist tokens to DB
  const existing = await listByProject(projectId);
  const existingByName = new Map(existing.map((t) => [t.name, t]));

  let tokensCreated = 0;
  let tokensUpdated = 0;

  // Group inferred tokens by suggested name to avoid duplicates
  const tokensByName = new Map<string, ExtractedToken[]>();
  for (const token of inferred) {
    const name = token.suggestedName || token.name || token.value;
    if (!tokensByName.has(name)) {
      tokensByName.set(name, []);
    }
    tokensByName.get(name)!.push(token);
  }

  for (const [name, tokens] of tokensByName) {
    const representative = tokens[0];
    const category = representative.category as TokenCategory;

    if (existingByName.has(name)) {
      // Token already exists — update usages
      const existingToken = existingByName.get(name)!;
      await deleteUsagesByToken(existingToken.id);
      for (const t of tokens) {
        await createUsage({
          token_id: existingToken.id,
          file_path: t.filePath,
          line_number: t.lineNumber,
          context: t.context,
        });
      }
      tokensUpdated++;
    } else {
      // Create new token + usages
      try {
        const created = await createToken({
          project_id: projectId,
          name,
          category,
          value: representative.value,
          description: `Auto-extracted from theme ingestion`,
        });
        if (created) {
          for (const t of tokens) {
            await createUsage({
              token_id: created.id,
              file_path: t.filePath,
              line_number: t.lineNumber,
              context: t.context,
            });
          }
          tokensCreated++;
        }
      } catch {
        // Duplicate name or other DB error — skip
      }
    }
  }

  // 5. Persist components to DB
  // (Using service-role client directly for the design_components table)
  try {
    const { getClient } = await import('./component-persistence');
    const supabase = await getClient();

    // Clear existing components for this project
    await supabase.from('design_components').delete().eq('project_id', projectId);

    // Insert detected components
    for (const comp of components) {
      await supabase.from('design_components').insert({
        project_id: projectId,
        name: comp.name,
        file_path: comp.primaryFile,
        component_type: comp.type,
        tokens_used: [],
        variants: [],
        usage_frequency: comp.files.length,
        preview_data: { files: comp.files },
      });
    }
  } catch {
    // If design_components table doesn't exist yet (migration not applied), skip
  }

  return {
    tokensCreated,
    tokensUpdated,
    componentsDetected: components.length,
    components,
    totalFilesAnalyzed: files.length,
  };
}
