import { chunkFile, type ASTChunk } from '@/lib/parsers/ast-chunker';
import type { FileContext } from '@/lib/types/agent';
import { TOOL_THRESHOLDS } from '@/lib/agents/tools/constants';

/**
 * Format a file for specialist prompt context.
 * Small files: full content. Large files: structural outline + first 1500 chars preview.
 */
export function formatFileForSpecialist(f: FileContext, lang: string): string {
  const lineCount = f.content.split('\n').length;

  if (f.content.length <= TOOL_THRESHOLDS.LARGE_FILE_OUTLINE_CHARS) {
    return `### ${f.fileName}\n\`\`\`${lang}\n${f.content}\n\`\`\``;
  }

  const outline = buildOutline(f.fileName || f.path || '', f.content);
  const preview = f.content.slice(0, 1500);

  return [
    `### ${f.fileName} (${lineCount} lines — use read_lines to see specific regions)`,
    '',
    outline,
    '',
    '```' + lang,
    preview,
    `// ... ${lineCount} total lines — use read_lines with line ranges above`,
    '```',
  ].join('\n');
}

function buildOutline(filePath: string, content: string): string {
  try {
    const chunks = chunkFile(content, filePath);
    if (chunks.length === 0) return `Structure: ${content.split('\n').length} lines`;

    const lines: string[] = ['**File structure:**'];
    for (const chunk of chunks.slice(0, 20)) {
      const label = chunk.metadata.functionName
        ?? chunk.metadata.selector
        ?? chunk.metadata.renderTarget
        ?? chunk.metadata.settingId
        ?? chunk.metadata.nodeType
        ?? chunk.type;
      lines.push(`  Lines ${chunk.lineStart}-${chunk.lineEnd}: ${chunk.type} — ${label}`);
    }
    if (chunks.length > 20) {
      lines.push(`  ... and ${chunks.length - 20} more chunks`);
    }
    return lines.join('\n');
  } catch {
    return `Structure: ${content.split('\n').length} lines`;
  }
}
