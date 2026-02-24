/**
 * Skill validator — validates SKILL.md content.
 */

import { parseSkillFile } from './skill-parser';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateSkill(content: string, sourcePath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const parsed = parseSkillFile(content, sourcePath);
  if (!parsed) {
    errors.push(
      'Invalid SKILL.md format: missing YAML frontmatter or required fields (name, description)'
    );
    return { valid: false, errors, warnings };
  }

  if (!parsed.name) errors.push('Missing required field: name');
  if (!parsed.description) errors.push('Missing required field: description');
  if (parsed.keywords.length === 0)
    warnings.push('No keywords defined — skill may not match user intent');
  if (parsed.tokenEstimate > 5000)
    warnings.push(
      `Skill is ${parsed.tokenEstimate} tokens — consider splitting (recommended max: 5000)`
    );
  if (parsed.content.length < 50)
    warnings.push('Skill content is very short — may not provide enough guidance');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
