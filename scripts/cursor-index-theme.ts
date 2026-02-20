/**
 * Run the Cursor agent briefly in theme-workspace to prime the index.
 * Run this once before the benchmark so later Cursor runs may skip or shorten indexing.
 *
 *   npx tsx scripts/cursor-index-theme.ts
 *   npx tsx scripts/cursor-index-theme.ts --timeout 10
 *
 * Uses CURSOR_API_KEY from .env.local. Kills the agent after --timeout minutes (default 8; indexing can take 8+ min).
 * Then run: npm run test:run -- tests/integration/v2-live-benchmark.test.ts (with BENCHMARK_CURSOR_ONLY=1 etc.)
 */

import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

const projectRoot = process.cwd();
dotenv.config({ path: path.join(projectRoot, '.env.local') });

const themeWorkspace = path.join(projectRoot, 'theme-workspace');

function resolveAgentPath(): string {
  if (process.env.CURSOR_AGENT_PATH) return process.env.CURSOR_AGENT_PATH;
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const candidates = [
      path.join(localAppData, 'cursor-agent', 'agent.cmd'),
      path.join(localAppData, 'cursor-agent', 'agent.ps1'),
      path.join(localAppData, 'cursor', 'bin', 'agent.exe'),
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c)) return c;
    }
  }
  return 'agent';
}

function resolveCursorNodeDirect(agentPath: string): { nodeExe: string; indexJs: string } | null {
  if (agentPath === 'agent') return null;
  const dir = path.dirname(agentPath);
  const versionsDir = path.join(dir, 'versions');
  if (!fs.existsSync(versionsDir)) return null;
  const entries = fs.readdirSync(versionsDir, { withFileTypes: true });
  const versionDirs = entries
    .filter((e) => e.isDirectory() && /^\d{4}\.\d{1,2}\.\d{1,2}-[a-f0-9]+$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
  if (versionDirs.length === 0) return null;
  const v = versionDirs[0];
  const nodeExe = path.join(versionsDir, v, 'node.exe');
  const indexJs = path.join(versionsDir, v, 'index.js');
  if (!fs.existsSync(nodeExe) || !fs.existsSync(indexJs)) return null;
  return { nodeExe, indexJs };
}

function resolvePs1Path(agentPath: string): string | null {
  if (process.platform !== 'win32' || !agentPath.toLowerCase().endsWith('.cmd')) return null;
  const dir = path.dirname(agentPath);
  const ps1 = path.join(dir, 'cursor-agent.ps1');
  return fs.existsSync(ps1) ? ps1 : null;
}

function getCursorSpawnArgs(agentPath: string, args: string[]): { executable: string; args: string[] } {
  if (process.platform === 'win32') {
    const direct = resolveCursorNodeDirect(agentPath);
    if (direct) return { executable: direct.nodeExe, args: [direct.indexJs, ...args] };
    const ps1 = resolvePs1Path(agentPath);
    if (ps1)
      return {
        executable: 'powershell.exe',
        args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, ...args],
      };
    if (agentPath.toLowerCase().endsWith('.cmd'))
      return { executable: process.env.ComSpec || 'cmd.exe', args: ['/c', agentPath, ...args] };
    if (agentPath.toLowerCase().endsWith('.ps1'))
      return {
        executable: 'powershell.exe',
        args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', agentPath, ...args],
      };
  }
  return { executable: agentPath, args };
}

async function main() {
  const timeoutArg = process.argv.find((a) => a.startsWith('--timeout='))?.split('=')[1]
    ?? (process.argv.includes('--timeout') ? process.argv[process.argv.indexOf('--timeout') + 1] : undefined)
    ?? '8';
  const timeoutMin = Math.max(1, parseInt(timeoutArg, 10) || 8);
  const timeoutMs = timeoutMin * 60 * 1000;

  if (!process.env.CURSOR_API_KEY) {
    console.error('CURSOR_API_KEY not set. Add it to .env.local');
    process.exit(1);
  }
  if (!fs.existsSync(themeWorkspace)) {
    console.error('theme-workspace not found at', themeWorkspace);
    process.exit(1);
  }

  const agentPath = resolveAgentPath();
  const { executable, args } = getCursorSpawnArgs(agentPath, [
    '-p',
    '--force',
    '--trust',
    '--output-format',
    'stream-json',
    '--stream-partial-output',
    'Reply with the single word OK',
  ]);

  const env: NodeJS.ProcessEnv = { ...process.env, CURSOR_AGENT: '1' };
  if (process.platform === 'win32' && executable.toLowerCase().endsWith('node.exe')) {
    env.CURSOR_INVOKED_AS = 'agent';
    if (!env.NODE_COMPILE_CACHE)
      env.NODE_COMPILE_CACHE = path.join(process.env.LOCALAPPDATA || '', 'cursor-compile-cache');
  }

  console.log('Priming Cursor index in theme-workspace (will stop after ' + timeoutMin + ' min; indexing can take 8+ min).');
  console.log('Cwd:', themeWorkspace);
  console.log('(Any CLI output will stream below. If nothing appears, the CLI may be indexing silently.)\n');
  const child = spawn(executable, args, { cwd: themeWorkspace, env, shell: process.platform === 'win32' && agentPath === 'agent' });

  child.stdout?.on('data', (c: Buffer) => process.stdout.write(c.toString()));
  child.stderr?.on('data', (c: Buffer) => process.stderr.write(c.toString()));

  const timeoutId = setTimeout(() => {
    try {
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { shell: false });
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      child.kill('SIGKILL');
    }
    console.log('\nStopped after ' + timeoutMin + ' min. Index may be primed. Run the benchmark next.');
    process.exit(0);
  }, timeoutMs);

  child.on('close', (code) => {
    clearTimeout(timeoutId);
    console.log('Agent exited with code', code);
    process.exit(code === 0 ? 0 : 1);
  });
  child.on('error', (err) => {
    clearTimeout(timeoutId);
    console.error('Spawn error:', err.message);
    process.exit(1);
  });
}

main();
