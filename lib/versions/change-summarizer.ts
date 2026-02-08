import { ChangeDetector } from './change-detector';

const detector = new ChangeDetector();

export function summarizeChange(previous: string | null, next: string): string {
  return detector.generateChangeSummary(previous, next);
}
