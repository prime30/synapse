/**
 * Theme file grouping utility.
 *
 * Parses Liquid files for references (render, include, section, snippet)
 * and derives related CSS/JS assets to build grouped "worksets" of
 * files that should be opened together in the IDE.
 */

export interface FileInfo {
  id: string;
  name: string;
  path: string;
  content?: string;
}

export interface FileGroup {
  id: string;
  label: string;
  /** The root file that anchors this group (e.g. a section or template) */
  rootFileId: string;
  /** All file IDs in the group, including the root */
  fileIds: string[];
}

// ── Reference extraction ────────────────────────────────────────────────────

const RENDER_RE = /\{%-?\s*render\s+['"]([^'"]+)['"]/g;
const INCLUDE_RE = /\{%-?\s*include\s+['"]([^'"]+)['"]/g;
const SECTION_RE = /\{%-?\s*section\s+['"]([^'"]+)['"]/g;
const STYLESHEET_RE = /\{%-?\s*stylesheet\s/g;
const JAVASCRIPT_RE = /\{%-?\s*javascript\s/g;
const ASSET_URL_RE = /['"]([^'"]+)['"]\s*\|\s*asset_url/g;

/**
 * Extract referenced snippet/section/asset names from a Liquid file's content.
 */
export function extractLiquidReferences(content: string): {
  renders: string[];
  includes: string[];
  sections: string[];
  assetUrls: string[];
  hasInlineStylesheet: boolean;
  hasInlineJavascript: boolean;
} {
  const renders: string[] = [];
  const includes: string[] = [];
  const sections: string[] = [];
  const assetUrls: string[] = [];

  let match: RegExpExecArray | null;

  RENDER_RE.lastIndex = 0;
  while ((match = RENDER_RE.exec(content)) !== null) {
    renders.push(match[1]);
  }

  INCLUDE_RE.lastIndex = 0;
  while ((match = INCLUDE_RE.exec(content)) !== null) {
    includes.push(match[1]);
  }

  SECTION_RE.lastIndex = 0;
  while ((match = SECTION_RE.exec(content)) !== null) {
    sections.push(match[1]);
  }

  ASSET_URL_RE.lastIndex = 0;
  while ((match = ASSET_URL_RE.exec(content)) !== null) {
    assetUrls.push(match[1]);
  }

  STYLESHEET_RE.lastIndex = 0;
  const hasInlineStylesheet = STYLESHEET_RE.test(content);

  JAVASCRIPT_RE.lastIndex = 0;
  const hasInlineJavascript = JAVASCRIPT_RE.test(content);

  return { renders, includes, sections, assetUrls, hasInlineStylesheet, hasInlineJavascript };
}

// ── Path matching helpers ───────────────────────────────────────────────────

function buildPathIndex(files: FileInfo[]): Map<string, FileInfo> {
  const index = new Map<string, FileInfo>();
  for (const f of files) {
    index.set(f.path, f);
    // Also index by filename without extension for snippet/section lookups
    const name = f.name.replace(/\.liquid$/, '');
    if (!index.has(name)) {
      index.set(name, f);
    }
  }
  return index;
}

function findFileByReference(
  ref: string,
  prefix: string,
  pathIndex: Map<string, FileInfo>,
): FileInfo | undefined {
  // Try exact path first
  const exactPath = `${prefix}/${ref}.liquid`;
  if (pathIndex.has(exactPath)) return pathIndex.get(exactPath);

  // Try with just the ref name
  const withExt = `${ref}.liquid`;
  if (pathIndex.has(withExt)) return pathIndex.get(withExt);

  // Try bare name (already indexed without extension)
  return pathIndex.get(ref);
}

function findAssetFile(
  assetName: string,
  pathIndex: Map<string, FileInfo>,
): FileInfo | undefined {
  const assetPath = `assets/${assetName}`;
  return pathIndex.get(assetPath) ?? pathIndex.get(assetName);
}

// ── Group generation ────────────────────────────────────────────────────────

/**
 * Generate file groups from imported theme files.
 *
 * Groups are anchored on section and template Liquid files,
 * and include referenced snippets, sections, and CSS/JS assets.
 */
export function generateFileGroups(files: FileInfo[]): FileGroup[] {
  const pathIndex = buildPathIndex(files);
  const groups: FileGroup[] = [];
  const usedFileIds = new Set<string>();

  // Focus on Liquid files that may have matching CSS/JS assets as group roots
  const rootCandidates = files.filter(
    (f) =>
      f.path.startsWith('sections/') ||
      f.path.startsWith('snippets/') ||
      f.path.startsWith('templates/') ||
      f.path.startsWith('layout/')
  );

  for (const root of rootCandidates) {
    const groupFileIds = new Set<string>([root.id]);

    // If content is available, extract Liquid references
    if (root.content) {
      const refs = extractLiquidReferences(root.content);

      // Add rendered/included snippets
      for (const snippetName of [...refs.renders, ...refs.includes]) {
        const found = findFileByReference(snippetName, 'snippets', pathIndex);
        if (found) groupFileIds.add(found.id);
      }

      // Add referenced sections
      for (const sectionName of refs.sections) {
        const found = findFileByReference(sectionName, 'sections', pathIndex);
        if (found) groupFileIds.add(found.id);
      }

      // Add referenced assets (CSS/JS)
      for (const assetName of refs.assetUrls) {
        const found = findAssetFile(assetName, pathIndex);
        if (found) groupFileIds.add(found.id);
      }
    }

    // Always look for CSS/JS with same base name as the root (doesn't need content)
    const rootBase = root.name.replace(/\.liquid$/, '');
    for (const ext of ['.css', '.scss', '.js', '.ts']) {
      const assetPath = `assets/${rootBase}${ext}`;
      const found = pathIndex.get(assetPath);
      if (found) groupFileIds.add(found.id);
    }

    // Only create a group if it has more than just the root
    if (groupFileIds.size > 1) {
      const label = root.path
        .replace(/\.liquid$/, '')
        .replace(/^(sections|snippets|templates|layout)\//, '');

      groups.push({
        id: `group-${root.id}`,
        label,
        rootFileId: root.id,
        fileIds: Array.from(groupFileIds),
      });

      for (const fid of groupFileIds) usedFileIds.add(fid);
    }
  }

  // If there are ungrouped files, add an "Other files" group
  const ungrouped = files.filter((f) => !usedFileIds.has(f.id));
  if (ungrouped.length > 0) {
    groups.push({
      id: 'group-other',
      label: 'Other files',
      rootFileId: ungrouped[0].id,
      fileIds: ungrouped.map((f) => f.id),
    });
  }

  return groups;
}
