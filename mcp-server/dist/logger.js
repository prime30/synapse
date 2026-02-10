import fs from 'fs';
import path from 'path';
import { getSynapseDir, ensureSynapseDir } from './config.js';
const LEVEL_PRIORITY = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
const LOG_FILE = 'mcp-server.log';
const MAX_AGE_DAYS = 7;
let currentLevel = 'info';
let logStream = null;
export function initLogger(level = 'info') {
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
function cleanOldLogs() {
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
    }
    catch {
        // Ignore cleanup errors
    }
}
function writeLog(level, message, data) {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel])
        return;
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
    debug: (message, data) => writeLog('debug', message, data),
    info: (message, data) => writeLog('info', message, data),
    warn: (message, data) => writeLog('warn', message, data),
    error: (message, data) => writeLog('error', message, data),
};
export function closeLogger() {
    if (logStream) {
        logStream.end();
        logStream = null;
    }
}
//# sourceMappingURL=logger.js.map