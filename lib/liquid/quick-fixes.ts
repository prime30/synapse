export interface QuickFix {
  title: string;
  range: { start: number; end: number };
  newText: string;
}

export function getQuickFixes(): QuickFix[] {
  return [];
}
