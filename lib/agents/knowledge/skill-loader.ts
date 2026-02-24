/**
 * Skill loader — loads skills from SKILL.md files in project skills directory.
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseSkillFile } from './skill-parser';
import type { KnowledgeModule } from './module-matcher';

const SKILLS_DIR = 'skills';

export function loadSkillFiles(projectDir: string): KnowledgeModule[] {
  const skillsPath = join(projectDir, SKILLS_DIR);
  if (!existsSync(skillsPath)) return [];

  const modules: KnowledgeModule[] = [];

  try {
    const entries = readdirSync(skillsPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = readFileSync(join(skillsPath, entry.name), 'utf-8');
          const parsed = parseSkillFile(content, join(SKILLS_DIR, entry.name));
          if (parsed) {
            modules.push({
              id: `skill:${parsed.name}`,
              keywords: parsed.keywords,
              content: parsed.content,
              tokenEstimate: parsed.tokenEstimate,
            });
          }
        } catch {
          /* skip unreadable files */
        }
      }
    }
  } catch {
    /* skills directory not readable */
  }

  return modules;
}
