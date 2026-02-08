import { LiquidValidator } from '@/lib/liquid/validator';

export interface Diagnostic {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

const validator = new LiquidValidator();

export async function getLiquidDiagnostics(template: string): Promise<Diagnostic[]> {
  const result = await validator.validate(template);
  return [...result.errors, ...result.warnings].map((issue) => ({
    line: issue.line,
    column: issue.column,
    message: issue.message,
    severity: issue.severity,
  }));
}
