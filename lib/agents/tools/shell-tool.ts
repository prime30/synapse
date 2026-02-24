/**
 * Sandboxed shell command execution with whitelist.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const ALLOWED_COMMANDS = [
  /^npm\s+(test|run\s+(build|lint|dev|check)|install)/,
  /^npx\s+(tsc|eslint|prettier)/,
  /^git\s+(status|diff|log|branch|show)/,
  /^shopify\s+theme\s+(check|pull|push)/,
  /^node\s+--version/,
  /^cat\s+/,
  /^ls\s+/,
];

const TIMEOUT_MS = 60_000;

export async function executeShellCommand(
  command: string,
  projectDir: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const isAllowed = ALLOWED_COMMANDS.some((re) => re.test(command));
  if (!isAllowed) {
    return {
      stdout: '',
      stderr: `Command not allowed: ${command}. Allowed: npm test/build/lint, npx tsc/eslint, git status/diff/log, shopify theme check`,
      exitCode: 1,
    };
  }
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: projectDir,
      timeout: TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string; code?: number };
    return {
      stdout: e.stdout || '',
      stderr: e.stderr || e.message || String(err),
      exitCode: e.code ?? 1,
    };
  }
}
