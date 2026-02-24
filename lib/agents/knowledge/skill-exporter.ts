/**
 * Skill exporter — converts built-in TypeScript modules to SKILL.md format.
 */

import type { KnowledgeModule } from './module-matcher';

export function exportAsSkillMd(module: KnowledgeModule): string {
  return `---
name: ${module.id}
description: Synapse knowledge module
keywords: [${module.keywords.join(', ')}]
version: 1.0.0
---

${module.content}
`;
}
