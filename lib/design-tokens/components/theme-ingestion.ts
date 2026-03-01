/**
 * REQ-52: Theme Ingestion Service
 * Runs after a theme is uploaded: extracts tokens, detects components,
 * and persists both to the design system tables.
 */

import { TokenExtractor } from '../token-extractor';
import { inferTokens } from '../inference';
import {
  generateColorRamp,
  identifyBrandColors,
} from '../inference/color-ramp-generator';
import { detectComponents, type DetectedComponent } from './component-detector';
import {
  createToken,
  createUsage,
  deleteUsagesByToken,
  listByProject,
  updateToken,
} from '../models/token-model';
import type { ExtractedToken, TokenCategory } from '../types';
import { parseColorSchemes } from '../parsers/color-scheme-parser';

/** Extract token name from var(--name) or var(--name, fallback). */
const VAR_REF = /var\s*\(\s*--([\w-]+)/;

/** Infer usage role from category and component (Phase 10e). */
function inferUsageRole(
  category: string,
  tokenName: string,
  component?: string,
): string | null {
  if (!component) return null;
  const compBase = component.toLowerCase().replace(/\s+/g, '-');
  if (category === 'spacing') return `${compBase}-padding`;
  if (category === 'color') return `${compBase}-color`;
  if (category === 'typography') return `${compBase}-typography`;
  if (category === 'border') return `${compBase}-border`;
  return null;
}

/** Build usage context: JSON with role/component when available (Phase 10e). Exported for scan route. */
export function buildUsageContext(
  t: ExtractedToken,
  fileToComponent: Map<string, string>,
  category: string,
  name: string,
): string {
  const component = fileToComponent.get(t.filePath);
  const role = inferUsageRole(category, name, component);
  if (!role && !component) return t.context;
  const obj: Record<string, unknown> = { source: t.context };
  if (role) obj.role = role;
  if (component) obj.component = component;
  return JSON.stringify(obj);
}

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
 * All supported file types are processed: config/settings_schema.json (JSON),
 * assets/*.css (CSS), sections/*.liquid (Liquid with inline <style> blocks).
 * Callers must ensure these files are included in the `files` array.
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

  // 2b. Identify brand colors for ramp generation
  const brandColors = identifyBrandColors(
    inferred.map((t) => ({
      name: t.suggestedName || t.name || t.value,
      value: t.value,
      source: t.filePath,
    })),
  );
  const brandColorsByName = new Map(brandColors.map((b) => [b.name, b]));

  // 3. Detect components (with content for button detection)
  const components = detectComponents(
    files.map((f) => ({ path: f.path, content: f.content })),
  );

  // 3b. Build file → component map for usage context (Phase 10e)
  const fileToComponent = new Map<string, string>();
  for (const comp of components) {
    for (const fp of comp.files) {
      fileToComponent.set(fp, comp.name);
    }
  }

  // 4. Persist tokens to DB
  const existing = await listByProject(projectId);
  const existingByName = new Map(existing.map((t) => [t.name, t]));
  const nameToId = new Map(existing.map((t) => [t.name, t.id]));
  const pendingAliases: { tokenId: string; parentName: string }[] = [];

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
    const value = representative.value;

    if (existingByName.has(name)) {
      // Token already exists — update usages
      const existingToken = existingByName.get(name)!;
      await deleteUsagesByToken(existingToken.id);
      for (const t of tokens) {
        const usageContext = buildUsageContext(t, fileToComponent, category, name);
        await createUsage({
          token_id: existingToken.id,
          file_path: t.filePath,
          line_number: t.lineNumber,
          context: usageContext,
        });
      }
      tokensUpdated++;
      const match = value.match(VAR_REF);
      if (match) pendingAliases.push({ tokenId: existingToken.id, parentName: match[1] });
      // Persist ramp tokens for brand colors (may already exist; duplicates skipped)
      const brand = brandColorsByName.get(name);
      if (brand && category === 'color') {
        tokensCreated += await persistRampTokens(
          projectId,
          existingToken.id,
          name,
          value,
          deriveParentColor(name),
        );
      }
    } else {
      // Create new token + usages
      try {
        const created = await createToken({
          project_id: projectId,
          name,
          category,
          value,
          description: `Auto-extracted from theme ingestion`,
          metadata: representative.metadata,
        });
        if (created) {
          nameToId.set(name, created.id);
          for (const t of tokens) {
            const usageContext = buildUsageContext(t, fileToComponent, category, name);
            await createUsage({
              token_id: created.id,
              file_path: t.filePath,
              line_number: t.lineNumber,
              context: usageContext,
            });
          }
          tokensCreated++;
          const match = value.match(VAR_REF);
          if (match) pendingAliases.push({ tokenId: created.id, parentName: match[1] });
          // Persist ramp tokens for brand colors
          const brand = brandColorsByName.get(name);
          if (brand && category === 'color') {
            tokensCreated += await persistRampTokens(
              projectId,
              created.id,
              name,
              value,
              deriveParentColor(name),
            );
          }
        }
      } catch {
        // Duplicate name or other DB error — skip
      }
    }
  }

  // Resolve var(--X) references: set semantic_parent_id for alias tokens
  for (const { tokenId, parentName } of pendingAliases) {
    const parentId = nameToId.get(parentName);
    if (parentId) {
      try {
        await updateToken(tokenId, { semantic_parent_id: parentId });
      } catch {
        // Ignore update failures
      }
    }
  }

  // 4b. Shopify color schemes: parse settings_data.json and persist scheme tokens
  const settingsDataFile = files.find(
    (f) => f.path === 'config/settings_data.json' || f.path.endsWith('/settings_data.json'),
  );
  if (settingsDataFile) {
    const schemeData = parseColorSchemes(settingsDataFile.content);
    if (schemeData) {
      for (const st of schemeData.schemeTokens) {
        const name = `color-scheme-${st.scheme}-${st.role}`;
        try {
          if (existingByName.has(name)) {
            const existing = existingByName.get(name)!;
            await updateToken(existing.id, { metadata: { ...existing.metadata, ...st.metadata } });
          } else {
            const created = await createToken({
              project_id: projectId,
              name,
              category: 'color',
              value: st.value,
              description: `Color scheme ${st.scheme} ${st.role}`,
              metadata: st.metadata,
            });
            if (created) tokensCreated++;
          }
        } catch {
          // Duplicate or DB error — skip
        }
      }
    }
  }

  // 5. Build a map of file paths → token IDs for component-token linking
  const allPersistedTokens = await listByProject(projectId);
  const tokenIdByName = new Map(allPersistedTokens.map((t) => [t.name, t.id]));

  // Build file → token names map from extracted tokens
  const fileToTokenNames = new Map<string, Set<string>>();
  for (const [name, tokens] of tokensByName) {
    for (const t of tokens) {
      if (!fileToTokenNames.has(t.filePath)) {
        fileToTokenNames.set(t.filePath, new Set());
      }
      fileToTokenNames.get(t.filePath)!.add(name);
    }
  }

  // 6. Persist components to DB
  // (Using service-role client directly for the design_components table)
  try {
    const { getClient } = await import('./component-persistence');
    const supabase = await getClient();

    // Clear existing components for this project
    await supabase.from('design_components').delete().eq('project_id', projectId);

    // Insert detected components with tokens_used populated
    for (const comp of components) {
      // Collect token IDs from all files belonging to this component
      const tokenIds = new Set<string>();
      for (const filePath of comp.files) {
        const names = fileToTokenNames.get(filePath);
        if (names) {
          for (const name of names) {
            const id = tokenIdByName.get(name);
            if (id) tokenIds.add(id);
          }
        }
      }

      const previewData: Record<string, unknown> = { files: comp.files };
      if (comp.buttonTokenSet && Object.keys(comp.buttonTokenSet).length > 0) {
        previewData.buttonTokenSet = comp.buttonTokenSet;
      }
      if (comp.semanticType) {
        previewData.semanticType = comp.semanticType;
        if (comp.semanticTokenSet) previewData.semanticTokenSet = comp.semanticTokenSet;
      }
      if (comp.iconMetadata) previewData.iconMetadata = comp.iconMetadata;

      await supabase.from('design_components').insert({
        project_id: projectId,
        name: comp.name,
        file_path: comp.primaryFile,
        component_type: comp.type,
        tokens_used: Array.from(tokenIds),
        variants: comp.variants ?? [],
        usage_frequency: comp.files.length,
        preview_data: previewData,
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

/** Derive a short parentColor for ramp metadata from a token name. */
function deriveParentColor(name: string): string {
  const lower = name.toLowerCase();
  const keywords = ['primary', 'accent', 'secondary', 'brand', 'button', 'cta'];
  for (const k of keywords) {
    if (lower.includes(k)) return k;
  }
  const parts = name.split(/[._]/);
  return parts[parts.length - 1] || name;
}

/** Create ramp tokens for a brand color and link via semantic_parent_id. */
async function persistRampTokens(
  projectId: string,
  baseTokenId: string,
  baseName: string,
  baseValue: string,
  parentColor: string,
): Promise<number> {
  const ramp = generateColorRamp(baseValue);
  if (ramp.length === 0) return 0;

  let created = 0;
  for (const entry of ramp) {
    const rampName = `${baseName}-${entry.step}`;
    try {
      await createToken({
        project_id: projectId,
        name: rampName,
        category: 'color',
        value: entry.hex,
        description: `Ramp step ${entry.step} for ${parentColor}`,
        metadata: { ramp: true, parentColor, step: entry.step },
        semantic_parent_id: baseTokenId,
      });
      created++;
    } catch {
      // Duplicate name or other DB error — skip
    }
  }
  return created;
}
