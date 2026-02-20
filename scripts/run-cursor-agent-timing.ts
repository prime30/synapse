/**
 * Spawn the Cursor agent with a single task and print time to completion.
 * No benchmark merging, no timeouts — just run and report duration.
 *
 * Usage:
 *   npx tsx scripts/run-cursor-agent-timing.ts
 *   npx tsx scripts/run-cursor-agent-timing.ts "Change the announcement bar background to #1a1a2e"
 *
 * Requires: CURSOR_API_KEY in .env.local (and agent on PATH or CURSOR_AGENT_PATH on Windows).
 */

import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

const projectRoot = process.cwd();
dotenv.config({ path: path.join(projectRoot, '.env.local') });

const themeWorkspace = path.join(projectRoot, 'theme-workspace');
const defaultPrompt =
  'Change the announcement bar background color to #1a1a2e and the text color to white.';

function resolveAgentPath(): string {
  if (process.env.CURSOR_AGENT_PATH) return process.env.CURSOR_AGENT_PATH;
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const candidates = [
      path.join(localAppData, 'cursor-agent', 'agent.cmd'),
      path.join(localAppData, 'cursor-agent', 'agent.ps1'),
      path.join(localAppData, 'cursor', 'bin', 'agent.exe'),
      path.join(localAppData, 'Programs', 'cursor', 'agent.exe'),
      path.join(process.env.USERPROFILE || '', '.cursor', 'bin', 'agent.exe'),
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c)) return c;
    }
  }
  return 'agent';
}

/** Resolve direct node.exe + index.js from cursor-agent/versions/ (no cmd/PowerShell). */
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
  const versionName = versionDirs[0];
  const nodeExe = path.join(versionsDir, versionName, 'node.exe');
  const indexJs = path.join(versionsDir, versionName, 'index.js');
  if (!fs.existsSync(nodeExe) || !fs.existsSync(indexJs)) return null;
  return { nodeExe, indexJs };
}

function resolvePs1Path(agentPath: string): string | null {
  if (process.platform !== 'win32' || !agentPath.toLowerCase().endsWith('.cmd')) return null;
  const dir = path.dirname(agentPath);
  const ps1 = path.join(dir, 'cursor-agent.ps1');
  return fs.existsSync(ps1) ? ps1 : null;
}

/** On Windows, prefer direct Node; else .cmd/.ps1 via cmd or PowerShell. */
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
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.error('CURSOR_API_KEY not set. Add it to .env.local');
    process.exit(1);
  }
  if (!fs.existsSync(themeWorkspace)) {
    console.error('theme-workspace not found at', themeWorkspace);
    process.exit(1);
  }

  const prompt = process.argv.slice(2).join(' ').trim() || defaultPrompt;
  const agentPath = resolveAgentPath();
  const agentArgs = ['-p', '--force', '--trust', '--output-format', 'json', prompt];
  const { executable, args: spawnArgs } = getCursorSpawnArgs(agentPath, agentArgs);
  const useShell = process.platform === 'win32' && agentPath === 'agent';

  console.log('Prompt:', prompt.slice(0, 80) + (prompt.length > 80 ? '...' : ''));
  console.log('Cwd:   ', themeWorkspace);
  console.log('Agent: ', agentPath === 'agent' ? 'agent (PATH)' : agentPath);
  console.log('---');
  const t0 = Date.now();
  console.log('Started at', new Date().toISOString());

  const env: NodeJS.ProcessEnv = { ...process.env, CURSOR_API_KEY: apiKey, CURSOR_AGENT: '1' };
  if (process.platform === 'win32' && executable.toLowerCase().endsWith('node.exe')) {
    env.CURSOR_INVOKED_AS = 'agent';
    if (!env.NODE_COMPILE_CACHE)
      env.NODE_COMPILE_CACHE = path.join(process.env.LOCALAPPDATA || '', 'cursor-compile-cache');
  }
  const child = spawn(executable, spawnArgs, {
    cwd: themeWorkspace,
    env,
    shell: useShell,
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    const s = chunk.toString();
    stderr += s;
    process.stderr.write(s);
  });

  child.on('close', (code, signal) => {
    const elapsedMs = Date.now() - t0;
    const elapsedSec = (elapsedMs / 1000).toFixed(1);
    console.log('---');
    console.log('Finished at', new Date().toISOString());
    console.log('Time to completion:', elapsedSec, 's');
    console.log('Exit code:', code, signal ? `(signal ${signal})` : '');
    if (stderr.trim()) console.error('Stderr:', stderr.trim().slice(0, 500));
    if (stdout.trim()) {
      try {
        const j = JSON.parse(stdout.trim());
        if (j.text) console.log('Output (text):', (j.text as string).slice(0, 200) + '...');
      } catch {
        console.log('Output:', stdout.trim().slice(0, 300));
      }
    }
    process.exit(code === 0 ? 0 : 1);
  });

  child.on('error', (err) => {
    console.error('Spawn error:', err.message);
    process.exit(1);
  });
}

main();
