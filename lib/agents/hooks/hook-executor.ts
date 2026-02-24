import { readFile } from 'fs/promises';
import { join } from 'path';

export interface HookConfig {
  version: 1;
  hooks: {
    before_edit?: Array<{ command: string }>;
    after_edit?: Array<{ command: string }>;
    before_push?: Array<{ command: string }>;
    after_push?: Array<{ command: string }>;
    stop?: Array<{ command: string }>;
  };
}

export async function loadHookConfig(projectDir: string): Promise<HookConfig | null> {
  try {
    const configPath = join(projectDir, '.synapse', 'hooks.json');
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function executeHooks(
  hookType: keyof HookConfig['hooks'],
  config: HookConfig,
  context: { projectDir: string; changedFiles?: string[] },
): Promise<Array<{ command: string; success: boolean; output: string }>> {
  const hooks = config.hooks[hookType] ?? [];
  const results: Array<{ command: string; success: boolean; output: string }> = [];

  for (const hook of hooks) {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      const { stdout, stderr } = await execAsync(hook.command, {
        cwd: context.projectDir,
        timeout: 30_000,
        env: { ...process.env, SYNAPSE_CHANGED_FILES: (context.changedFiles ?? []).join(',') },
      });
      results.push({ command: hook.command, success: true, output: (stdout || stderr) as string });
    } catch (err: unknown) {
      const ex = err as { stderr?: string; message?: string };
      const msg = ex.stderr ?? (err instanceof Error ? err.message : String(err));
      results.push({ command: hook.command, success: false, output: String(msg) });
    }
  }

  return results;
}
