import type { FileContext } from '@/lib/types/agent';

export interface PreApplyValidation {
  valid: boolean;
  errors: Array<{ file: string; message: string; severity: 'error' | 'warning' }>;
}

export function validateChangesBeforeApply(
  changes: Array<{ fileName: string; proposedContent: string }>,
  allFiles: FileContext[],
): PreApplyValidation {
  const errors: PreApplyValidation['errors'] = [];

  for (const change of changes) {
    const content = change.proposedContent;
    const fileName = change.fileName;

    // Liquid syntax validation
    if (fileName.endsWith('.liquid')) {
      // Check for unclosed tags
      const openTags = (content.match(/\{%[-\s]*(?:if|for|unless|case|capture|form|paginate|tablerow|comment|raw|style|javascript)\b/g) || []).length;
      const closeTags = (content.match(/\{%[-\s]*end(?:if|for|unless|case|capture|form|paginate|tablerow|comment|raw|style|javascript)\b/g) || []).length;
      if (openTags !== closeTags) {
        errors.push({ file: fileName, message: `Unclosed Liquid tags: ${openTags} open, ${closeTags} close`, severity: 'error' });
      }

      // Check for broken render/include references
      const renders = content.matchAll(/\{%[-\s]*(?:render|include)\s+['"]([^'"]+)['"]/g);
      for (const match of renders) {
        const snippetName = match[1];
        const snippetPath = snippetName.includes('/') ? snippetName : `snippets/${snippetName}.liquid`;
        if (!allFiles.some(f => (f.path ?? f.fileName) === snippetPath)) {
          errors.push({ file: fileName, message: `Broken reference: {% render '${snippetName}' %} — snippet not found`, severity: 'warning' });
        }
      }

      // Check for schema JSON validity
      const schemaMatch = content.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
      if (schemaMatch) {
        try {
          JSON.parse(schemaMatch[1]);
        } catch {
          errors.push({ file: fileName, message: 'Invalid JSON in {% schema %} block', severity: 'error' });
        }
      }
    }

    // JSON validation
    if (fileName.endsWith('.json')) {
      try {
        JSON.parse(content);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ file: fileName, message: `Invalid JSON: ${msg}`, severity: 'error' });
      }
    }

    // CSS basic validation
    if (fileName.endsWith('.css')) {
      const openBraces = (content.match(/\{/g) || []).length;
      const closeBraces = (content.match(/\}/g) || []).length;
      if (openBraces !== closeBraces) {
        errors.push({ file: fileName, message: `Mismatched CSS braces: ${openBraces} open, ${closeBraces} close`, severity: 'error' });
      }
    }
  }

  return { valid: errors.filter(e => e.severity === 'error').length === 0, errors };
}
