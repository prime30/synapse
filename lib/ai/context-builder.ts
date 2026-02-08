import { estimateTokens } from './token-counter';
import type { ThemeFile } from './theme-analyzer';

export interface ContextWindow {
  content: string;
  tokenCount: number;
}

export function buildContextWindow(
  files: ThemeFile[],
  currentPath: string,
  maxTokens = 4000
): ContextWindow {
  const current = files.find((f) => f.path === currentPath);
  const ordered = current
    ? [current, ...files.filter((f) => f.path !== currentPath)]
    : files;

  let content = '';
  let tokens = 0;

  for (const file of ordered) {
    const chunk = `\n\n# ${file.path}\n${file.content}`;
    const nextTokens = estimateTokens(chunk);
    if (tokens + nextTokens > maxTokens) break;
    content += chunk;
    tokens += nextTokens;
  }

  return { content, tokenCount: tokens };
}
