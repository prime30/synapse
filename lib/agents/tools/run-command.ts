import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MB

const COMMAND_ALLOWLIST: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /^shopify\s+theme\s+/, description: 'shopify theme *' },
  { pattern: /^npm\s+run\s+/, description: 'npm run *' },
  { pattern: /^npx\s+theme-check/, description: 'npx theme-check' },
  { pattern: /^npx\s+prettier\s+/, description: 'npx prettier *' },
  { pattern: /^shopify\s+app\s+/, description: 'shopify app *' },
  { pattern: /^node\s+--version$/, description: 'node --version' },
  { pattern: /^npm\s+--version$/, description: 'npm --version' },
];

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export function isCommandAllowed(command: string): boolean {
  const trimmed = command.trim();
  return COMMAND_ALLOWLIST.some(({ pattern }) => pattern.test(trimmed));
}

export function getCommandAllowlist(): string[] {
  return COMMAND_ALLOWLIST.map(({ description }) => description);
}

function clampTimeout(requestedMs?: number): number {
  if (requestedMs === undefined) return DEFAULT_TIMEOUT_MS;
  return Math.max(1_000, Math.min(requestedMs, MAX_TIMEOUT_MS));
}

function truncateOutput(output: string): string {
  if (Buffer.byteLength(output, 'utf-8') <= MAX_OUTPUT_BYTES) return output;
  const truncated = Buffer.from(output, 'utf-8').subarray(0, MAX_OUTPUT_BYTES).toString('utf-8');
  return truncated + '\n... (output truncated at 1 MB)';
}

export async function executeCommand(
  command: string,
  options?: { timeoutMs?: number; cwd?: string },
): Promise<RunCommandResult> {
  const trimmed = command.trim();

  if (!isCommandAllowed(trimmed)) {
    throw new Error(
      `Command not allowed. Permitted patterns: ${getCommandAllowlist().join(', ')}`,
    );
  }

  const timeoutMs = clampTimeout(options?.timeoutMs);

  try {
    const { stdout, stderr } = await execAsync(trimmed, {
      timeout: timeoutMs,
      maxBuffer: MAX_OUTPUT_BYTES,
      cwd: options?.cwd,
      env: { ...process.env },
    });

    return {
      stdout: truncateOutput(stdout),
      stderr: truncateOutput(stderr),
      exitCode: 0,
      timedOut: false,
    };
  } catch (error: unknown) {
    const execErr = error as {
      killed?: boolean;
      code?: number | string;
      stdout?: string;
      stderr?: string;
      signal?: string;
    };

    const timedOut = execErr.killed === true || execErr.signal === 'SIGTERM';

    return {
      stdout: truncateOutput(execErr.stdout ?? ''),
      stderr: truncateOutput(
        execErr.stderr ?? (timedOut ? `Command timed out after ${timeoutMs}ms` : String(error)),
      ),
      exitCode: typeof execErr.code === 'number' ? execErr.code : 1,
      timedOut,
    };
  }
}
