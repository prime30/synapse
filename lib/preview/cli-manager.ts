import { spawn, execSync, type ChildProcess } from 'child_process';
import net from 'net';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

export interface ThemeFile {
  path: string;
  content: string;
}

interface CLISession {
  process: ChildProcess;
  port: number;
  themeId: string;
  themeDir: string;
  storeDomain: string;
  status: 'writing' | 'starting' | 'running' | 'error' | 'stopped';
  error?: string;
  startedAt: number;
  stdout: string[];
  stderr: string[];
}

const BASE_PORT = 9293;
const MAX_STDOUT_LINES = 200;

class CLIPreviewManager {
  private sessions = new Map<string, CLISession>();

  async start(opts: {
    projectId: string;
    storeDomain: string;
    tkaPassword: string;
    themeId: string;
    files: ThemeFile[];
    port?: number;
  }): Promise<{ port: number; status: string }> {
    const { projectId, storeDomain, tkaPassword, themeId, files } = opts;

    const existing = this.sessions.get(projectId);
    if (existing?.status === 'running' || existing?.status === 'starting' || existing?.status === 'writing') {
      return { port: existing.port, status: existing.status };
    }

    await this.stop(projectId);

    const port = opts.port ?? this.findPort();
    const cleanDomain = storeDomain.replace(/^https?:\/\//, '');
    const themeDir = path.join(os.tmpdir(), `synapse-preview-${projectId}`);
    await fs.mkdir(themeDir, { recursive: true });

    const session: CLISession = {
      process: null!,
      port,
      themeId,
      themeDir,
      storeDomain: cleanDomain,
      status: 'writing',
      startedAt: Date.now(),
      stdout: [],
      stderr: [],
    };
    this.sessions.set(projectId, session);

    try {
      const existingEntries = await fs.readdir(themeDir);
      const hasThemeFiles = existingEntries.some(f =>
        f === 'layout' || f === 'templates' || f === 'sections' || f === 'config'
      );

      if (!hasThemeFiles && files.length > 0) {
        console.log(`[CLI Preview] Writing ${files.length} files from Supabase to ${themeDir}`);
        for (const file of files) {
          const fullPath = path.join(themeDir, file.path);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, file.content, 'utf-8');
        }
        console.log(`[CLI Preview] Write complete`);
      }

      // settings_data.json is essential for rendering — pull via CLI if missing
      const settingsPath = path.join(themeDir, 'config', 'settings_data.json');
      try {
        await fs.access(settingsPath);
      } catch {
        console.log(`[CLI Preview] settings_data.json missing — pulling via CLI`);
        try {
          execSync(
            `shopify theme pull --store ${cleanDomain} --password ${tkaPassword} --theme ${themeId} --only config/settings_data.json`,
            { cwd: themeDir, stdio: 'pipe', timeout: 30_000 },
          );
          console.log(`[CLI Preview] Pulled settings_data.json`);
        } catch (pullErr) {
          console.warn(`[CLI Preview] Could not pull settings_data.json:`, pullErr instanceof Error ? pullErr.message : pullErr);
        }
      }
    } catch (writeErr) {
      session.status = 'error';
      session.error = `Failed to write theme files: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`;
      console.error(`[CLI Preview]`, session.error);
      return { port, status: 'error' };
    }

    session.status = 'starting';

    // Kill anything lingering on the target port
    this.killPort(port);

    const proc = spawn('shopify', [
      'theme', 'dev',
      '--store', cleanDomain,
      '--password', tkaPassword,
      '--theme', themeId,
      '--port', String(port),
    ], {
      cwd: themeDir,
      shell: true,
      stdio: 'pipe',
      env: { ...process.env, SHOPIFY_FLAG_STORE: cleanDomain },
    });

    session.process = proc;

    proc.stdout?.on('data', (chunk: Buffer) => {
      const line = chunk.toString();
      session.stdout.push(line);
      if (session.stdout.length > MAX_STDOUT_LINES) session.stdout.shift();

      if (line.includes('127.0.0.1') || line.includes('localhost')) {
        session.status = 'running';
        console.log(`[CLI Preview] Dev server running on port ${port}`);
      }
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString();
      session.stderr.push(line);
      if (session.stderr.length > MAX_STDOUT_LINES) session.stderr.shift();

      if (session.status === 'starting' && (line.includes('127.0.0.1') || line.includes('localhost'))) {
        session.status = 'running';
        console.log(`[CLI Preview] Dev server running on port ${port} (detected via stderr)`);
      }
    });

    proc.on('exit', (code) => {
      const stderrSnippet = session.stderr.join('').slice(-500);
      console.log(`[CLI Preview] Process exited with code ${code}`);
      if (stderrSnippet) console.log(`[CLI Preview] stderr: ${stderrSnippet}`);
      if (session.status !== 'stopped') {
        session.status = 'error';
        const errMatch = stderrSnippet.match(/Error[^│╮╯]*/);
        session.error = errMatch
          ? errMatch[0].trim().slice(0, 200)
          : `CLI exited with code ${code}`;
      }
    });

    proc.on('error', (err) => {
      session.status = 'error';
      session.error = err.message;
      console.error(`[CLI Preview] Process error:`, err.message);
    });

    this.probePortUntilReady(session, port);

    return { port, status: 'starting' };
  }

  /**
   * Periodically probe the port to detect when the CLI server is actually
   * listening, in case stdout/stderr detection misses the ready message.
   */
  private probePortUntilReady(session: CLISession, port: number): void {
    let attempts = 0;
    const maxAttempts = 30; // ~30 seconds
    const interval = setInterval(() => {
      if (session.status !== 'starting' || attempts++ >= maxAttempts) {
        clearInterval(interval);
        return;
      }
      const sock = net.connect({ port, host: '127.0.0.1' }, () => {
        sock.destroy();
        if (session.status === 'starting') {
          session.status = 'running';
          console.log(`[CLI Preview] Dev server running on port ${port} (detected via port probe)`);
        }
        clearInterval(interval);
      });
      sock.on('error', () => sock.destroy());
      sock.setTimeout(500, () => sock.destroy());
    }, 1000);
  }

  async stop(projectId: string): Promise<void> {
    const session = this.sessions.get(projectId);
    if (!session) return;

    session.status = 'stopped';

    try {
      if (session.process && !session.process.killed) {
        if (process.platform === 'win32') {
          try {
            execSync(`taskkill /PID ${session.process.pid} /T /F`, { stdio: 'pipe' });
          } catch {
            session.process.kill('SIGTERM');
          }
        } else {
          session.process.kill('SIGTERM');
        }
      }
    } catch {
      // Process may have already exited
    }

    this.sessions.delete(projectId);
  }

  getStatus(projectId: string): {
    running: boolean;
    port: number;
    status: string;
    error?: string;
    themeId?: string;
    uptime?: number;
  } | null {
    const session = this.sessions.get(projectId);
    if (!session) return null;

    return {
      running: session.status === 'running',
      port: session.port,
      status: session.status,
      error: session.error,
      themeId: session.themeId,
      uptime: Date.now() - session.startedAt,
    };
  }

  getPort(projectId: string): number | null {
    const session = this.sessions.get(projectId);
    if (!session || session.status !== 'running') return null;
    return session.port;
  }

  /**
   * Write a file to the CLI preview's theme directory so theme dev picks it up.
   */
  async writeFile(projectId: string, filePath: string, content: string): Promise<boolean> {
    const session = this.sessions.get(projectId);
    if (!session) return false;

    const fullPath = path.join(session.themeDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    return true;
  }

  /**
   * Fetch a single theme asset from the Shopify Admin REST API using TKA password.
   */
  private async fetchAssetFromShopify(
    storeDomain: string,
    tkaPassword: string,
    themeId: string,
    assetKey: string,
    destPath: string,
  ): Promise<void> {
    const cleanDomain = storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `https://${cleanDomain}/admin/api/2024-01/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(assetKey)}`;
    try {
      const res = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': tkaPassword },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        console.warn(`[CLI Preview] Could not fetch ${assetKey}: ${res.status}`);
        return;
      }
      const json = await res.json() as { asset?: { value?: string } };
      if (json.asset?.value) {
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.writeFile(destPath, json.asset.value, 'utf-8');
        console.log(`[CLI Preview] Fetched ${assetKey} (${json.asset.value.length} chars)`);
      }
    } catch (err) {
      console.warn(`[CLI Preview] Failed to fetch ${assetKey}:`, err instanceof Error ? err.message : err);
    }
  }

  private killPort(port: number): void {
    try {
      if (process.platform === 'win32') {
        const output = execSync(
          `netstat -ano | findstr ":${port}.*LISTENING"`,
          { stdio: 'pipe', timeout: 5000 }
        ).toString();
        const pids = new Set<string>();
        for (const line of output.split('\n')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
        }
        for (const pid of pids) {
          try {
            execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'pipe', timeout: 5000 });
            console.log(`[CLI Preview] Killed PID ${pid} on port ${port}`);
          } catch { /* already dead */ }
        }
      } else {
        execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'pipe', timeout: 5000 });
      }
    } catch {
      // No process on port — fine
    }
  }

  private findPort(): number {
    const usedPorts = new Set<number>();
    for (const s of this.sessions.values()) usedPorts.add(s.port);
    let port = BASE_PORT;
    while (usedPorts.has(port)) port++;
    return port;
  }
}

export const cliPreviewManager = new CLIPreviewManager();
