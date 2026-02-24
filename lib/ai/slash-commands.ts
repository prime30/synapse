export interface SlashCommand {
  id: string;
  command: string; // '/fix', '/explain', etc.
  label: string; // 'Fix issue'
  description: string; // 'Fix a bug or issue in the selected code'
  icon: string; // lucide icon name: 'Wrench', 'BookOpen', etc.
  mode?: string; // 'code', 'plan', 'debug', 'ask'
  promptPrefix?: string; // Text to prepend to the user's prompt
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'fix',
    command: '/fix',
    label: 'Fix issue',
    description: 'Fix a bug or issue in the code',
    icon: 'Wrench',
    mode: 'debug',
    promptPrefix: 'Fix this issue: ',
  },
  {
    id: 'explain',
    command: '/explain',
    label: 'Explain',
    description: 'Explain how this code works',
    icon: 'BookOpen',
    mode: 'ask',
    promptPrefix: 'Explain: ',
  },
  {
    id: 'plan',
    command: '/plan',
    label: 'Plan changes',
    description: 'Create a plan before making changes',
    icon: 'ListChecks',
    mode: 'plan',
    promptPrefix: '',
  },
  {
    id: 'test',
    command: '/test',
    label: 'Test',
    description: 'Write or run tests',
    icon: 'FlaskConical',
    mode: 'code',
    promptPrefix: 'Write tests for: ',
  },
  {
    id: 'debug',
    command: '/debug',
    label: 'Debug',
    description: 'Debug and investigate an issue',
    icon: 'Bug',
    mode: 'debug',
    promptPrefix: 'Debug: ',
  },
  {
    id: 'review',
    command: '/review',
    label: 'Review',
    description: 'Review code for quality and best practices',
    icon: 'ScanSearch',
    mode: 'code',
    promptPrefix: 'Review this code: ',
  },
];

export function matchSlashCommand(input: string): SlashCommand[] {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed.startsWith('/')) return [];
  return SLASH_COMMANDS.filter((cmd) =>
    cmd.command.toLowerCase().startsWith(trimmed)
  );
}
