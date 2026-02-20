/**
 * Theme Term Extractor — Prong 1 of learned term mappings.
 *
 * Auto-generates term-to-file mappings from theme file structure on import.
 * Extracts terms from section schema names, file name decomposition, and
 * synonym expansion. Stores results in developer_memory as conventions
 * with kind='term_mapping'.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────

export interface TermMapping {
  term: string;
  filePaths: string[];
  source: 'schema' | 'filename' | 'synonym' | 'execution';
  usageCount: number;
  lastUsed: string;
}

export interface TermMappingContent {
  kind: 'term_mapping';
  term: string;
  filePaths: string[];
  source: 'schema' | 'filename' | 'synonym' | 'execution';
  usageCount: number;
  lastUsed: string;
}

interface ExtractedTerm {
  term: string;
  filePath: string;
  source: 'schema' | 'filename' | 'synonym';
  confidence: number;
}

interface ThemeFile {
  id: string;
  name: string;
  path: string;
  content: string;
  file_type: string;
}

// ── Constants ─────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'this', 'that', 'with', 'from', 'have', 'been', 'should',
  'would', 'could', 'when', 'what', 'where', 'which', 'their',
  'about', 'after', 'before', 'between', 'each', 'every', 'into',
  'through', 'during', 'using', 'make', 'like', 'also', 'just',
  'only', 'some', 'them', 'than', 'then', 'very', 'well', 'here',
  'there', 'does', 'show', 'create', 'adding', 'find', 'main',
  'default', 'custom', 'index', 'page', 'new', 'old',
]);

const STRUCTURAL_TERMS = new Set([
  'section', 'snippet', 'template', 'layout', 'asset', 'block',
  'liquid', 'json', 'css', 'scss', 'javascript',
]);

const MIN_TERM_LENGTH = 3;
const MAX_MAPPINGS_PER_PROJECT = 200;

/**
 * Shopify-specific synonym dictionary. Maps canonical file-name segments
 * to informal terms users commonly use to refer to them.
 */
const SYNONYM_MAP: Record<string, string[]> = {
  'banner': ['hero', 'promo', 'headline'],
  'image-banner': ['hero', 'hero-banner', 'hero-image'],
  'slideshow': ['slider', 'carousel', 'gallery'],
  'header': ['navigation', 'nav', 'navbar', 'topbar', 'menu'],
  'footer': ['bottom', 'footbar'],
  'cart': ['basket', 'bag', 'shopping-cart'],
  'collection': ['catalog', 'category', 'listing'],
  'product': ['item', 'pdp', 'merchandise'],
  'thumbnail': ['thumb', 'preview'],
  'announcement': ['marquee', 'ticker', 'notice', 'alert-bar'],
  'newsletter': ['subscribe', 'signup', 'mailing-list', 'email-signup'],
  'featured': ['spotlight', 'highlight', 'promoted'],
  'testimonial': ['review', 'quote', 'social-proof'],
  'rich-text': ['text-block', 'content-block', 'paragraph'],
  'collapsible': ['accordion', 'faq', 'dropdown'],
  'multicolumn': ['columns', 'multi-column', 'grid-columns'],
  'video': ['media', 'embed', 'player'],
  'contact': ['form', 'inquiry', 'reach-out'],
  'search': ['find', 'lookup', 'search-bar'],
  'password': ['gate', 'storefront-lock', 'coming-soon'],
  'popup': ['modal', 'dialog', 'overlay', 'lightbox'],
  'drawer': ['sidebar', 'slide-out', 'offcanvas'],
  'breadcrumb': ['trail', 'path', 'crumbs'],
  'pagination': ['pager', 'page-nav', 'page-numbers'],
  'quick-view': ['quicklook', 'peek', 'preview-modal'],
  'color-swatch': ['swatch', 'variant-picker', 'option-selector'],
  'price': ['cost', 'amount', 'pricing'],
  'quantity': ['qty', 'amount-selector', 'counter'],
  'badge': ['tag', 'label', 'pill', 'chip'],
  'social': ['share', 'social-media', 'follow'],
};

// ── Extraction strategies ─────────────────────────────────────────────

const SCHEMA_REGEX = /\{%[-\s]*schema\s*[-]?%\}([\s\S]*?)\{%[-\s]*endschema\s*[-]?%\}/;

function extractFromSectionSchema(content: string, filePath: string): ExtractedTerm[] {
  const match = content.match(SCHEMA_REGEX);
  if (!match) return [];

  try {
    const schema = JSON.parse(match[1]);
    const name: string | undefined = schema.name;
    if (!name) return [];

    const terms = name
      .toLowerCase()
      .split(/[\s\-_]+/)
      .filter((t: string) => t.length >= MIN_TERM_LENGTH && !STOP_WORDS.has(t) && !STRUCTURAL_TERMS.has(t));

    return terms.map((term: string) => ({
      term,
      filePath,
      source: 'schema' as const,
      confidence: 0.85,
    }));
  } catch {
    return [];
  }
}

function extractFromFilename(filePath: string): ExtractedTerm[] {
  const segments = filePath
    .toLowerCase()
    .split(/[/\\\-_.]+/)
    .filter(
      (s) =>
        s.length >= MIN_TERM_LENGTH &&
        !STOP_WORDS.has(s) &&
        !STRUCTURAL_TERMS.has(s),
    );

  return segments.map((term) => ({
    term,
    filePath,
    source: 'filename' as const,
    confidence: 0.75,
  }));
}

function expandSynonyms(extracted: ExtractedTerm[]): ExtractedTerm[] {
  const synonymTerms: ExtractedTerm[] = [];

  for (const entry of extracted) {
    const synonyms = SYNONYM_MAP[entry.term];
    if (synonyms) {
      for (const syn of synonyms) {
        synonymTerms.push({
          term: syn,
          filePath: entry.filePath,
          source: 'synonym',
          confidence: 0.65,
        });
      }
    }
  }

  // Also check compound file-name segments (e.g., "image-banner" as a key)
  const fileNames = new Set(extracted.map((e) => e.filePath));
  for (const fp of fileNames) {
    const baseName = fp.split('/').pop()?.replace(/\.\w+$/, '') ?? '';
    const synonyms = SYNONYM_MAP[baseName];
    if (synonyms) {
      for (const syn of synonyms) {
        synonymTerms.push({
          term: syn,
          filePath: fp,
          source: 'synonym',
          confidence: 0.65,
        });
      }
    }
  }

  return synonymTerms;
}

// ── Main extractor ────────────────────────────────────────────────────

function adminClient(): ReturnType<typeof createServiceClient> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !serviceKey) throw new Error('Supabase config missing');
  return createServiceClient(url, serviceKey);
}

/**
 * Extract term mappings from theme files and store them in developer_memory.
 * Called after theme import/sync completes.
 */
export async function extractAndStoreTermMappings(
  projectId: string,
  userId: string,
  files: ThemeFile[],
): Promise<{ stored: number; skipped: number }> {
  const allExtracted: ExtractedTerm[] = [];

  for (const file of files) {
    // Section schema extraction (sections/*.liquid)
    if (file.path.startsWith('sections/') && file.path.endsWith('.liquid') && file.content) {
      allExtracted.push(...extractFromSectionSchema(file.content, file.path));
    }

    // File name decomposition (all files)
    allExtracted.push(...extractFromFilename(file.path));
  }

  // Synonym expansion
  const synonyms = expandSynonyms(allExtracted);
  allExtracted.push(...synonyms);

  // Deduplicate: group by term, merge file paths
  const termMap = new Map<string, { filePaths: Set<string>; source: ExtractedTerm['source']; confidence: number }>();

  for (const entry of allExtracted) {
    const existing = termMap.get(entry.term);
    if (existing) {
      existing.filePaths.add(entry.filePath);
      if (entry.confidence > existing.confidence) {
        existing.confidence = entry.confidence;
        existing.source = entry.source;
      }
    } else {
      termMap.set(entry.term, {
        filePaths: new Set([entry.filePath]),
        source: entry.source,
        confidence: entry.confidence,
      });
    }
  }

  const supabase = adminClient();
  const now = new Date().toISOString();

  // Bulk-invalidate old auto-extracted mappings for this project
  await supabase
    .from('developer_memory')
    .delete()
    .eq('project_id', projectId)
    .eq('type', 'convention')
    .filter('content->>kind', 'eq', 'term_mapping')
    .in('content->>source', ['schema', 'filename', 'synonym'] as unknown as string[])
    .then(() => {});

  // Cap mappings: keep only the top entries by confidence
  const sorted = [...termMap.entries()]
    .sort((a, b) => b[1].confidence - a[1].confidence)
    .slice(0, MAX_MAPPINGS_PER_PROJECT);

  let stored = 0;
  let skipped = 0;

  // Batch insert
  const rows = sorted.map(([term, data]) => ({
    project_id: projectId,
    user_id: userId,
    type: 'convention' as const,
    content: {
      kind: 'term_mapping',
      term,
      filePaths: [...data.filePaths],
      source: data.source,
      usageCount: 0,
      lastUsed: now,
    } satisfies TermMappingContent,
    confidence: data.confidence,
  }));

  if (rows.length > 0) {
    // Insert in batches of 50 to avoid payload limits
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('developer_memory') as any).insert(batch);
      if (error) {
        console.warn('[theme-term-extractor] Batch insert error:', error.message);
        skipped += batch.length;
      } else {
        stored += batch.length;
      }
    }
  }

  console.log(`[theme-term-extractor] Stored ${stored} term mappings for project ${projectId} (${skipped} skipped)`);
  return { stored, skipped };
}

/**
 * Remove all auto-extracted term mappings for a project.
 * Used before re-running extraction on theme re-import.
 */
export async function clearAutoExtractedMappings(projectId: string): Promise<void> {
  try {
    const supabase = adminClient();
    await supabase
      .from('developer_memory')
      .delete()
      .eq('project_id', projectId)
      .eq('type', 'convention')
      .filter('content->>kind', 'eq', 'term_mapping')
      .in('content->>source', ['schema', 'filename', 'synonym'] as unknown as string[]);
  } catch (err) {
    console.warn('[theme-term-extractor] Clear failed:', err);
  }
}

/**
 * Remove term mappings that reference a specific file path.
 * Called on file delete/rename.
 */
export async function invalidateMappingsForFile(
  projectId: string,
  filePath: string,
): Promise<void> {
  try {
    const supabase = adminClient();

    // Fetch all term_mapping entries for this project
    const { data } = await supabase
      .from('developer_memory')
      .select('id, content')
      .eq('project_id', projectId)
      .eq('type', 'convention')
      .filter('content->>kind', 'eq', 'term_mapping');

    if (!data || data.length === 0) return;

    type DevMemoryRow = { id: string; content: unknown };
    const idsToDelete: string[] = [];
    const idsToUpdate: Array<{ id: string; content: TermMappingContent }> = [];

    for (const row of data as DevMemoryRow[]) {
      const content = row.content as TermMappingContent;
      if (!content.filePaths?.includes(filePath)) continue;

      const remaining = content.filePaths.filter((fp: string) => fp !== filePath);
      if (remaining.length === 0) {
        idsToDelete.push(row.id);
      } else {
        idsToUpdate.push({ id: row.id, content: { ...content, filePaths: remaining } });
      }
    }

    if (idsToDelete.length > 0) {
      await supabase
        .from('developer_memory')
        .delete()
        .in('id', idsToDelete);
    }

    for (const { id, content } of idsToUpdate) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('developer_memory') as any)
        .update({ content })
        .eq('id', id);
    }
  } catch (err) {
    console.warn('[theme-term-extractor] Invalidate failed:', err);
  }
}
