/**
 * Diagnose Cursor CLI setup for the benchmark. Run from repo root:
 *   npx tsx scripts/cursor-cli-check.ts
 *
 * Prints resolved agent path, env checks, and optionally runs a short test.
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const projectRoot = process.cwd();
dotenv.config({ path: path.join(projectRoot, '.env.local') });

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

/** On Windows, agent.cmd just launches cursor-agent.ps1. Invoking the .ps1 via PowerShell directly can fix hangs (no cmd in the middle). */
function resolvePs1Path(agentPath: string): string | null {
  if (process.platform !== 'win32' || !agentPath.toLowerCase().endsWith('.cmd')) return null;
  const dir = path.dirname(agentPath);
  const ps1 = path.join(dir, 'cursor-agent.ps1');
  return fs.existsSync(ps1) ? ps1 : null;
}

/** Resolve direct node.exe + index.js from cursor-agent/versions/ so we can spawn Node directly (no cmd/PowerShell). */
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

function main() {
  console.log('Cursor CLI check\n');

  const agentPath = resolveAgentPath();
  console.log('Resolved agent path:', agentPath === 'agent' ? 'agent (from PATH)' : agentPath);
  if (agentPath !== 'agent') {
    const exists = fs.existsSync(agentPath);
    console.log('  Exists:', exists);
  }

  const hasKey = !!process.env.CURSOR_API_KEY;
  console.log('\nCURSOR_API_KEY set:', hasKey);
  if (!hasKey) console.log('  → Add to .env.local from Cursor: Settings → Integrations');

  const themeWorkspace = path.join(projectRoot, 'theme-workspace');
  console.log('\ntheme-workspace:', fs.existsSync(themeWorkspace) ? themeWorkspace : 'NOT FOUND');

  const getCursorSpawnArgs = (p: string, args: string[]) => {
    if (process.platform === 'win32') {
      const direct = resolveCursorNodeDirect(p);
      if (direct) return { executable: direct.nodeExe, args: [direct.indexJs, ...args] };
      const ps1 = resolvePs1Path(p);
      if (ps1)
        return {
          executable: 'powershell.exe',
          args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, ...args],
        };
      if (p.toLowerCase().endsWith('.cmd'))
        return { executable: process.env.ComSpec || 'cmd.exe', args: ['/c', p, ...args] };
      if (p.toLowerCase().endsWith('.ps1'))
        return {
          executable: 'powershell.exe',
          args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', p, ...args],
        };
    }
    return { executable: p, args };
  };

  if (process.argv.includes('--status')) {
    console.log('\nChecking CLI auth (agent status)...');
    const { spawn } = require('child_process');
    const { executable, args } = getCursorSpawnArgs(agentPath, ['status']);
    const env: NodeJS.ProcessEnv = { ...process.env, CURSOR_API_KEY: process.env.CURSOR_API_KEY || '' };
    if (process.platform === 'win32' && executable.toLowerCase().endsWith('node.exe')) {
      env.CURSOR_INVOKED_AS = 'agent';
      if (!env.NODE_COMPILE_CACHE)
        env.NODE_COMPILE_CACHE = path.join(process.env.LOCALAPPDATA || '', 'cursor-compile-cache');
    }
    const child = spawn(executable, args, {
      cwd: themeWorkspace,
      env,
      shell: process.platform === 'win32' && agentPath === 'agent',
    });
    let out = '';
    let err = '';
    child.stdout?.on('data', (c: Buffer) => {
      const s = c.toString();
      out += s;
      process.stdout.write(s);
    });
    child.stderr?.on('data', (c: Buffer) => {
      const s = c.toString();
      err += s;
      process.stderr.write(s);
    });
    child.on('close', (code: number) => {
      if (code === 0) console.log('\n✓ CLI and auth OK.');
      else console.log('\n✗ status failed (exit ' + code + ').');
      process.exit(code === 0 ? 0 : 1);
    });
    child.on('error', (e: Error) => {
      console.error('Spawn error:', e.message);
      process.exit(1);
    });
    return;
  }

  if (process.argv.includes('--dry-run')) {
    const agentArgs = ['-p', '--force', '--trust', '--output-format', 'stream-json', '--stream-partial-output', 'Reply with the single word OK'];
    const { executable, args } = getCursorSpawnArgs(agentPath, agentArgs);
    const cmdLine =
      executable === 'agent'
        ? `agent ${agentArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`
        : [executable, ...args].map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ');
    console.log('\nRun this in a terminal (from repo root, with CURSOR_API_KEY set):');
    console.log('  cd theme-workspace');
    console.log('  ' + cmdLine);
    console.log('\nOr one line:');
    console.log('  cd ' + themeWorkspace + ' && ' + cmdLine);
    return;
  }

  if (process.argv.includes('--test')) {
    const { executable, args } = getCursorSpawnArgs(agentPath, [
      '-p',
      '--force',
      '--trust',
      '--output-format',
      'stream-json',
      '--stream-partial-output',
      'Reply with the single word OK',
    ]);
    console.log('\nRunning short test (prompt: "Reply with the single word OK")...');
    console.log('Using stream-json so you see progress (see https://cursor.com/docs/cli/headless).');
    console.log('Invoking:', executable, args.slice(0, 4).join(' '), '...\n');
    const { spawn } = require('child_process');
    const env: NodeJS.ProcessEnv = { ...process.env, CURSOR_API_KEY: process.env.CURSOR_API_KEY || '' };
    env.CURSOR_AGENT = '1';
    if (process.platform === 'win32' && executable.toLowerCase().endsWith('node.exe')) {
      env.CURSOR_INVOKED_AS = 'agent';
      if (!env.NODE_COMPILE_CACHE)
        env.NODE_COMPILE_CACHE = path.join(process.env.LOCALAPPDATA || '', 'cursor-compile-cache');
    }
    const child = spawn(executable, args, {
      cwd: themeWorkspace,
      env,
      shell: process.platform === 'win32' && agentPath === 'agent',
    });
    let out = '';
    let err = '';
    child.stdout?.on('data', (c: Buffer) => {
      const s = c.toString();
      out += s;
      process.stdout.write(s);
    });
    child.stderr?.on('data', (c: Buffer) => {
      const s = c.toString();
      err += s;
      process.stderr.write(s);
    });
    child.on('close', (code: number) => {
      console.log('\n--- Exit code:', code);
      if (err.trim()) console.log('Stderr (last 500 chars):', err.trim().slice(-500));
    });
    child.on('error', (e: Error) => console.error('Spawn error:', e.message));
  } else {
    console.log('\nOptions:');
    console.log('  --status   Verify CLI and auth (quick; recommended first).');
    console.log('  --test     Run agent with a short prompt (may hang on Windows; try WSL if so).');
    console.log('  --dry-run  Print the exact command to run manually.');
  }
}

main();
