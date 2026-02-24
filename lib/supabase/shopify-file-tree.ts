import { createServiceClient } from '@/lib/supabase/admin';

// ── Types ─────────────────────────────────────────────────────────────

export interface ShopifyFileTreeEntry {
  name: string;
  path: string;
  type: string;
  lines: number;
  renders?: string[];
  schemaSettingCount?: number;
  usedBy?: string[];
}

export interface ShopifyFileTree {
  directories: Record<string, { files: ShopifyFileTreeEntry[] }>;
  totalFiles: number;
  generatedAt: string;
}

// ── Shopify directory buckets (canonical order) ───────────────────────

const SHOPIFY_DIRS = [
  'layout',
  'templates',
  'sections',
  'blocks',
  'snippets',
  'assets',
  'config',
  'locales',
] as const;

// ── Regex patterns ────────────────────────────────────────────────────

const RENDER_INCLUDE_RE = /\{%[-\s]*(?:render|include)\s+'([^']+)'/g;
const SECTION_TYPE_RE = /"type"\s*:\s*"([^"]+)"/g;
const SCHEMA_BLOCK_RE = /\{%[-\s]*schema\s*[-]?%\}([\s\S]*?)\{%[-\s]*endschema\s*[-]?%\}/;

// ── Helpers ───────────────────────────────────────────────────────────

function countLines(content: string | undefined, sizeBytes?: number): number {
  if (content) return content.split('\n').length;
  if (sizeBytes && sizeBytes > 0) return Math.max(1, Math.round(sizeBytes / 40));
  return 0;
}

function extractRenderTargets(content: string): string[] {
  const targets: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(RENDER_INCLUDE_RE.source, RENDER_INCLUDE_RE.flags);
  while ((m = re.exec(content)) !== null) {
    targets.push(m[1]);
  }
  return [...new Set(targets)];
}

function extractSectionTypesFromJson(content: string): string[] {
  const types: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(SECTION_TYPE_RE.source, SECTION_TYPE_RE.flags);
  while ((m = re.exec(content)) !== null) {
    types.push(m[1]);
  }
  return [...new Set(types)];
}

function countSchemaSettings(content: string): number {
  const match = SCHEMA_BLOCK_RE.exec(content);
  if (!match) return 0;
  try {
    const schema = JSON.parse(match[1]) as { settings?: unknown[] };
    return Array.isArray(schema.settings) ? schema.settings.length : 0;
  } catch {
    return 0;
  }
}

function dirBucket(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  for (const dir of SHOPIFY_DIRS) {
    if (normalized.startsWith(`${dir}/`) || normalized === dir) return dir;
  }
  const firstSlash = normalized.indexOf('/');
  return firstSlash > 0 ? normalized.slice(0, firstSlash) : 'other';
}

// ── Core generation ───────────────────────────────────────────────────

export interface FileInput {
  fileId: string;
  fileName: string;
  path?: string;
  fileType: string;
  content?: string;
  size_bytes?: number;
}

export async function generateShopifyFileTree(
  _projectId: string,
  files: FileInput[],
): Promise<ShopifyFileTree> {
  const directories: Record<string, { files: ShopifyFileTreeEntry[] }> = {};
  const reverseMap = new Map<string, Set<string>>();

  for (const file of files) {
    const filePath = file.path ?? file.fileName;
    const dir = dirBucket(filePath);
    const content = file.content ?? '';
    const isLiquid = file.fileType === 'liquid' || file.fileName.endsWith('.liquid');
    const isJson = file.fileName.endsWith('.json');

    const entry: ShopifyFileTreeEntry = {
      name: file.fileName,
      path: filePath,
      type: file.fileType,
      lines: countLines(file.content, file.size_bytes),
    };

    let renderTargets: string[] = [];

    if (isLiquid && content) {
      renderTargets = extractRenderTargets(content);
      if (renderTargets.length > 0) entry.renders = renderTargets;

      const settingCount = countSchemaSettings(content);
      if (settingCount > 0) entry.schemaSettingCount = settingCount;
    }

    if (isJson && content && filePath.startsWith('templates/')) {
      const sectionTypes = extractSectionTypesFromJson(content);
      if (sectionTypes.length > 0) entry.renders = sectionTypes;
      renderTargets = sectionTypes;
    }

    for (const target of renderTargets) {
      const existing = reverseMap.get(target) ?? new Set();
      existing.add(file.fileName);
      reverseMap.set(target, existing);
    }

    if (!directories[dir]) directories[dir] = { files: [] };
    directories[dir].files.push(entry);
  }

  for (const dir of Object.values(directories)) {
    for (const entry of dir.files) {
      const baseName = entry.name.replace(/\.liquid$/, '').replace(/\.json$/, '');
      const users = reverseMap.get(baseName);
      if (users && users.size > 0) {
        entry.usedBy = [...users].filter((u) => u !== entry.name);
        if (entry.usedBy.length === 0) delete entry.usedBy;
      }
    }
  }

  return {
    directories,
    totalFiles: files.length,
    generatedAt: new Date().toISOString(),
  };
}

// ── Compact prompt formatter ──────────────────────────────────────────

export function formatFileTreeForPrompt(tree: ShopifyFileTree): string {
  const lines: string[] = [];

  for (const dir of SHOPIFY_DIRS) {
    const bucket = tree.directories[dir];
    if (!bucket || bucket.files.length === 0) continue;

    lines.push(`${dir}/`);
    const sorted = [...bucket.files].sort((a, b) => a.name.localeCompare(b.name));

    for (const f of sorted) {
      const parts: string[] = [];
      if (f.lines > 0) parts.push(`${f.lines}L`);
      if (f.schemaSettingCount) parts.push(`schema:${f.schemaSettingCount}`);
      if (f.renders?.length) parts.push(`→ ${f.renders.join(', ')}`);
      if (f.usedBy?.length) parts.push(`← ${f.usedBy.join(', ')}`);

      const meta = parts.length > 0 ? ` (${parts.join(', ')})` : '';
      lines.push(`  ${f.name}${meta}`);
    }
  }

  const otherDirs = Object.keys(tree.directories).filter(
    (d) => !(SHOPIFY_DIRS as readonly string[]).includes(d),
  );
  for (const dir of otherDirs.sort()) {
    const bucket = tree.directories[dir];
    if (!bucket || bucket.files.length === 0) continue;
    lines.push(`${dir}/`);
    for (const f of bucket.files.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`  ${f.name}`);
    }
  }

  return lines.join('\n');
}

// ── Persistence ───────────────────────────────────────────────────────

export async function storeFileTree(projectId: string, tree: ShopifyFileTree): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('projects')
    .update({
      theme_file_tree: tree,
      theme_file_tree_generated_at: tree.generatedAt,
    })
    .eq('id', projectId);

  if (error) {
    console.warn('[shopify-file-tree] Failed to store file tree:', error.message);
  }
}

export async function getFileTree(projectId: string): Promise<ShopifyFileTree | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('projects')
    .select('theme_file_tree, theme_file_tree_generated_at')
    .eq('id', projectId)
    .single();

  if (error || !data?.theme_file_tree) return null;
  return data.theme_file_tree as ShopifyFileTree;
}

// ── Staleness check + non-blocking regeneration ───────────────────────

const FILE_TREE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if the file tree is stale and regenerate if needed.
 * Loads content from DB for liquid/json files to extract references.
 * Designed to be called fire-and-forget (non-blocking).
 */
export async function ensureFileTreeFresh(
  projectId: string,
  currentFileCount: number,
  files: FileInput[],
): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('projects')
      .select('theme_file_tree, theme_file_tree_generated_at')
      .eq('id', projectId)
      .single();

    const existing = data?.theme_file_tree as ShopifyFileTree | null;
    const generatedAt = data?.theme_file_tree_generated_at
      ? new Date(data.theme_file_tree_generated_at).getTime()
      : 0;

    const isStale = Date.now() - generatedAt > FILE_TREE_MAX_AGE_MS;
    const countMismatch = existing?.totalFiles !== currentFileCount;

    if (!isStale && !countMismatch) return;

    const needsContent = files.filter(
      (f) =>
        !f.content &&
        (f.fileType === 'liquid' ||
          f.fileName.endsWith('.liquid') ||
          (f.fileName.endsWith('.json') && (f.path ?? f.fileName).startsWith('templates/'))),
    );

    let enrichedFiles = files;
    if (needsContent.length > 0) {
      const ids = needsContent.map((f) => f.fileId);
      const { data: rows } = await supabase
        .from('files')
        .select('id, content')
        .in('id', ids);

      if (rows?.length) {
        const contentMap = new Map(rows.map((r: { id: string; content: string }) => [r.id, r.content]));
        enrichedFiles = files.map((f) => {
          const c = contentMap.get(f.fileId);
          return c ? { ...f, content: c } : f;
        });
      }
    }

    const tree = await generateShopifyFileTree(projectId, enrichedFiles);
    await storeFileTree(projectId, tree);
    console.log(
      `[shopify-file-tree] Regenerated tree for ${projectId}: ${tree.totalFiles} files` +
        (isStale ? ' (stale)' : '') +
        (countMismatch ? ` (count ${existing?.totalFiles ?? 0}→${currentFileCount})` : ''),
    );
  } catch (err) {
    console.warn('[shopify-file-tree] ensureFileTreeFresh failed:', err);
  }
}
