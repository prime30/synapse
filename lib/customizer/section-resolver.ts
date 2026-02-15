/**
 * Section content resolver — enriches TemplateSection[] with Liquid file content.
 *
 * Maps each section.type to `sections/${section.type}.liquid` and fetches the
 * file content from the project files API. Deduplicates requests for the same
 * section type.
 */

import type { TemplateSection } from '@/hooks/useTemplateLayout';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateSectionWithContent extends TemplateSection {
  /** Raw Liquid content for schema parsing. `undefined` if file not found. */
  content?: string;
}

// ---------------------------------------------------------------------------
// Cache (per-session, in-memory)
// ---------------------------------------------------------------------------

const contentCache = new Map<string, { content: string | undefined; ts: number }>();
const CACHE_TTL = 30_000; // 30s

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Enrich an array of TemplateSections with their Liquid file content.
 *
 * For each unique `section.type`, fetches `sections/{type}.liquid` from the
 * project files listing. Returns a new array with `content` populated (or
 * `undefined` if the file doesn't exist).
 */
export async function resolveSectionContent(
  projectId: string,
  sections: TemplateSection[],
): Promise<TemplateSectionWithContent[]> {
  // Collect unique section types to fetch
  const uniqueTypes = [...new Set(sections.map((s) => s.type))];

  // Resolve content for each unique type (deduplicated)
  const contentMap = new Map<string, string | undefined>();

  await Promise.all(
    uniqueTypes.map(async (sectionType) => {
      const cacheKey = `${projectId}:sections/${sectionType}.liquid`;
      const cached = contentCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        contentMap.set(sectionType, cached.content);
        return;
      }

      try {
        // Fetch files listing, search for the section file
        const res = await fetch(
          `/api/projects/${projectId}/files?search=${encodeURIComponent(`${sectionType}.liquid`)}&include_content=true`,
        );
        if (!res.ok) {
          contentMap.set(sectionType, undefined);
          return;
        }
        const json = await res.json();
        const files: Array<{ path: string; content?: string }> =
          json.data ?? json.files ?? json ?? [];

        // Find the exact section file
        const targetPath = `sections/${sectionType}.liquid`;
        const match = files.find((f) => f.path === targetPath);
        const content = match?.content ?? undefined;

        contentCache.set(cacheKey, { content, ts: Date.now() });
        contentMap.set(sectionType, content);
      } catch {
        contentMap.set(sectionType, undefined);
      }
    }),
  );

  // Enrich sections with content
  return sections.map((section) => ({
    ...section,
    content: contentMap.get(section.type),
  }));
}

/**
 * Invalidate the content cache for a specific section type (or all).
 */
export function invalidateSectionCache(projectId?: string, sectionType?: string) {
  if (projectId && sectionType) {
    contentCache.delete(`${projectId}:sections/${sectionType}.liquid`);
  } else {
    contentCache.clear();
  }
}
