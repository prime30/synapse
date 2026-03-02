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

export interface LocalConfig {
  mode: 'local';
  workspacePath: string;
  store?: string;
  themeId?: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export type ResolvedConfig = (SynapseConfig & { mode: 'synapse' }) | LocalConfig;

const DEFAULT_CONFIG: SynapseConfig = {
  apiUrl: 'https://api.synapse.shop',
  logLevel: 'info',
  fileWatcherEnabled: true,
  autoRefreshToken: true,
  backupFiles: true,
};

const SYNAPSE_DIR = path.join(os.homedir(), '.synapse');
const CONFIG_PATH = path.join(SYNAPSE_DIR, 'config.json');

const SYNAPSE_THEME_DIR = '.synapse-theme';

export function ensureSynapseDir(): void {
  if (!fs.existsSync(SYNAPSE_DIR)) {
    fs.mkdirSync(SYNAPSE_DIR, { recursive: true });
  }
}

export function getSynapseDir(): string {
  return SYNAPSE_DIR;
}

function loadLocalConfig(logLevel: SynapseConfig['logLevel']): LocalConfig {
  const workspacePath = process.env.SYNAPSE_WORKSPACE_PATH || process.cwd();

  let store: string | undefined = process.env.SHOPIFY_STORE;
  let themeId: string | undefined = process.env.SHOPIFY_THEME_ID;

  // Read .synapse-theme/config.json from workspace for store/themeId if not set via env
  const projectConfigPath = path.join(workspacePath, SYNAPSE_THEME_DIR, 'config.json');
  if (fs.existsSync(projectConfigPath)) {
    try {
      const raw = fs.readFileSync(projectConfigPath, 'utf-8');
      const projectConfig = JSON.parse(raw) as { store?: string; themeId?: string };
      if (!store && projectConfig.store) store = projectConfig.store;
      if (!themeId && projectConfig.themeId) themeId = projectConfig.themeId;
    } catch {
      // Invalid project config, continue without it
    }
  }

  return {
    mode: 'local',
    workspacePath,
    store,
    themeId,
    logLevel,
  };
}

export function loadConfig(): ResolvedConfig {
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

  const merged: SynapseConfig = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...envOverrides,
  };

  const mode = (process.env.SYNAPSE_MODE ?? 'synapse') as 'synapse' | 'local';

  if (mode === 'local') {
    return loadLocalConfig(merged.logLevel);
  }

  return { ...merged, mode: 'synapse' };
}
