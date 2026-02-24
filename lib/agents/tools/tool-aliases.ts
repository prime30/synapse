/**
 * Maps shell-forward names to tool functions for models trained on CLI workflows.
 */

export const TOOL_ALIASES: Record<string, string> = {
  rg: 'grep_content',
  cat: 'read_file',
  find: 'glob_files',
  ls: 'list_files',
  search: 'search_files',
};

export function resolveToolAlias(name: string): string {
  return TOOL_ALIASES[name] ?? name;
}
