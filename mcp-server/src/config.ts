import fs from 'fs';
import path from 'path';
import os from 'os';

export interface SynapseConfig {
  apiUrl: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  fileWatcherEnabled: boolean;
  autoRefreshToken: boolean;
  backupFiles: boolean;
}

const DEFAULT_CONFIG: SynapseConfig = {
  apiUrl: 'https://api.synapse.dev',
  logLevel: 'info',
  fileWatcherEnabled: true,
  autoRefreshToken: true,
  backupFiles: true,
};

const SYNAPSE_DIR = path.join(os.homedir(), '.synapse');
const CONFIG_PATH = path.join(SYNAPSE_DIR, 'config.json');

export function ensureSynapseDir(): void {
  if (!fs.existsSync(SYNAPSE_DIR)) {
    fs.mkdirSync(SYNAPSE_DIR, { recursive: true });
  }
}

export function getSynapseDir(): string {
  return SYNAPSE_DIR;
}

export function loadConfig(): SynapseConfig {
  ensureSynapseDir();

  let fileConfig: Partial<SynapseConfig> = {};

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      fileConfig = JSON.parse(raw);
    } catch {
      // Invalid config file, use defaults
    }
  }

  // Environment variable overrides
  const envOverrides: Partial<SynapseConfig> = {};

  if (process.env.SYNAPSE_API_URL) {
    envOverrides.apiUrl = process.env.SYNAPSE_API_URL;
  }
  if (process.env.SYNAPSE_LOG_LEVEL) {
    envOverrides.logLevel = process.env.SYNAPSE_LOG_LEVEL as SynapseConfig['logLevel'];
  }

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...envOverrides,
  };
}
