import fs from 'fs';
import path from 'path';
import { getSynapseDir, ensureSynapseDir } from './config.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_FILE = 'mcp-server.log';
const MAX_AGE_DAYS = 7;

let currentLevel: LogLevel = 'info';
let logStream: fs.WriteStream | null = null;

export function initLogger(level: LogLevel = 'info'): void {
  currentLevel = level;
  ensureSynapseDir();

  const logPath = path.join(getSynapseDir(), LOG_FILE);

  // Rotate if log is from a previous day
  if (fs.existsSync(logPath)) {
    const stats = fs.statSync(logPath);
    const logDate = new Date(stats.mtime).toDateString();
    const today = new Date().toDateString();

    if (logDate !== today) {
      const rotatedName = `mcp-server-${new Date(stats.mtime).toISOString().split('T')[0]}.log`;
      const rotatedPath = path.join(getSynapseDir(), rotatedName);
      fs.renameSync(logPath, rotatedPath);
      cleanOldLogs();
    }
  }

  logStream = fs.createWriteStream(logPath, { flags: 'a' });
}

function cleanOldLogs(): void {
  const dir = getSynapseDir();
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.startsWith('mcp-server-') && file.endsWith('.log')) {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtime.getTime() < cutoff) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

function writeLog(level: LogLevel, message: string, data?: unknown): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel]) return;

  const timestamp = new Date().toISOString();
  const entry = data
    ? `[${timestamp}] [${level.toUpperCase()}] ${message} ${JSON.stringify(data)}\n`
    : `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

  if (logStream) {
    logStream.write(entry);
  }

  // Also write errors to stderr for Cursor to capture
  if (level === 'error') {
    process.stderr.write(entry);
  }
}

export const logger = {
  debug: (message: string, data?: unknown) => writeLog('debug', message, data),
  info: (message: string, data?: unknown) => writeLog('info', message, data),
  warn: (message: string, data?: unknown) => writeLog('warn', message, data),
  error: (message: string, data?: unknown) => writeLog('error', message, data),
};

export function closeLogger(): void {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}
