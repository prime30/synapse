export interface SpecialistHandoff {
  completed: boolean;
  filesTouched: string[];
  changes: string[];
  concerns: string[];
  findings: string[];
  nextSteps: string[];
}

export function parseHandoff(text: string): SpecialistHandoff | null {
  const handoffMatch = text.match(/HANDOFF:\n([\s\S]*?)(?:\n\n|$)/);
  if (!handoffMatch) return null;

  const section = handoffMatch[1];
  const extract = (key: string): string[] => {
    const match = section.match(new RegExp(`-\\s*${key}:\\s*\\[([^\\]]*)]`));
    if (!match) return [];
    return match[1].split(',').map(s => s.trim()).filter(Boolean);
  };

  return {
    completed: section.includes('completed: true'),
    filesTouched: extract('files_touched'),
    changes: extract('changes'),
    concerns: extract('concerns'),
    findings: extract('findings'),
    nextSteps: extract('next_steps'),
  };
}
