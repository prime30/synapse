/**
 * REQ-52 Task 7: Design Code Validator for Agent Integration.
 *
 * Validates generated code against the project's design system tokens.
 * Detects hardcoded values that should use tokens and reports suggestions.
 */

import { listByProject } from '../models/token-model';
import type { DesignTokenRow } from '../models/token-model';
import { TokenExtractor } from '../token-extractor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  value: string;
  lineNumber: number;
  suggestion: string;
}

export interface ValidationReport {
  valid: boolean;
  tokenizedCount: number;
  hardcodedCount: number;
  issues: ValidationIssue[];
}

// ---------------------------------------------------------------------------
// File extension mapping for TokenExtractor
// ---------------------------------------------------------------------------

const FILE_EXT_MAP: Record<string, string> = {
  css: 'styles.css',
  liquid: 'template.liquid',
  js: 'script.js',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class DesignCodeValidator {
  private extractor = new TokenExtractor();

  /**
   * Validate generated code against the project's design tokens.
   *
   * Extracts values from the code, then checks each against the token
   * registry to find hardcoded values that should reference a token.
   */
  async validateGeneratedCode(
    code: string,
    projectId: string,
    fileType: 'css' | 'liquid' | 'js',
  ): Promise<ValidationReport> {
    // Fetch project tokens
    let projectTokens: DesignTokenRow[];
    try {
      projectTokens = await listByProject(projectId);
    } catch {
      // If we can't load tokens, we can't validate — treat as valid
      return { valid: true, tokenizedCount: 0, hardcodedCount: 0, issues: [] };
    }

    if (projectTokens.length === 0) {
      return { valid: true, tokenizedCount: 0, hardcodedCount: 0, issues: [] };
    }

    // Build lookup structures
    const tokenValueSet = new Set(
      projectTokens.map((t) => t.value.toLowerCase().trim()),
    );
    const tokenNameSet = new Set(
      projectTokens.map((t) => t.name.toLowerCase()),
    );
    const valueToToken = new Map<string, DesignTokenRow>();
    for (const t of projectTokens) {
      valueToToken.set(t.value.toLowerCase().trim(), t);
    }

    // Extract values from generated code using TokenExtractor
    const fakePath = FILE_EXT_MAP[fileType] ?? 'file.css';
    const extracted = this.extractor.extractFromFile(code, fakePath);

    let tokenizedCount = 0;
    let hardcodedCount = 0;
    const issues: ValidationIssue[] = [];

    for (const token of extracted) {
      const normValue = token.value.toLowerCase().trim();

      // Check if the extracted token references a named token (tokenized usage)
      if (token.name && tokenNameSet.has(token.name.toLowerCase())) {
        tokenizedCount++;
        continue;
      }

      // Check if the raw value matches a known token value (hardcoded)
      if (tokenValueSet.has(normValue)) {
        hardcodedCount++;
        const matchedToken = valueToToken.get(normValue)!;
        issues.push({
          value: token.value,
          lineNumber: token.lineNumber,
          suggestion: `Use var(--${matchedToken.name}) instead of hardcoded "${token.value}"`,
        });
      }
    }

    return {
      valid: issues.length === 0,
      tokenizedCount,
      hardcodedCount,
      issues,
    };
  }
}
