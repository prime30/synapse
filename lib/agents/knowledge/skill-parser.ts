/**
 * Skill parser — parses SKILL.md files with YAML frontmatter.
 */

export interface ParsedSkill {
  name: string;
  description: string;
  keywords: string[];
  version?: string;
  content: string;
  tokenEstimate: number;
  sourcePath: string;
}

function extractYamlField(yaml: string, field: string): string | null {
  const match = yaml.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
}

export function parseSkillFile(content: string, sourcePath: string): ParsedSkill | null {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) return null;

  const frontmatter = frontmatterMatch[1];
  const body = frontmatterMatch[2].trim();

  const name = extractYamlField(frontmatter, 'name');
  const description = extractYamlField(frontmatter, 'description');
  const version = extractYamlField(frontmatter, 'version');
  const keywordsRaw = extractYamlField(frontmatter, 'keywords');

  if (!name || !description) return null;

  const keywords = keywordsRaw
    ? keywordsRaw.replace(/[\[\]]/g, '').split(',').map((k) => k.trim()).filter(Boolean)
    : [];

  const tokenEstimate = Math.ceil(body.length / 4);

  return {
    name,
    description,
    keywords,
    version: version || undefined,
    content: body,
    tokenEstimate,
    sourcePath,
  };
}
