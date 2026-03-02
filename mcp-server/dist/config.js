import fs from 'fs';
import path from 'path';
import os from 'os';
const DEFAULT_CONFIG = {
    apiUrl: 'https://api.synapse.shop',
    logLevel: 'info',
    fileWatcherEnabled: true,
    autoRefreshToken: true,
    backupFiles: true,
};
const SYNAPSE_DIR = path.join(os.homedir(), '.synapse');
const CONFIG_PATH = path.join(SYNAPSE_DIR, 'config.json');
const SYNAPSE_THEME_DIR = '.synapse-theme';
export function ensureSynapseDir() {
    if (!fs.existsSync(SYNAPSE_DIR)) {
        fs.mkdirSync(SYNAPSE_DIR, { recursive: true });
    }
}
export function getSynapseDir() {
    return SYNAPSE_DIR;
}
function loadLocalConfig(logLevel) {
    const workspacePath = process.env.SYNAPSE_WORKSPACE_PATH || process.cwd();
    let store = process.env.SHOPIFY_STORE;
    let themeId = process.env.SHOPIFY_THEME_ID;
    // Read .synapse-theme/config.json from workspace for store/themeId if not set via env
    const projectConfigPath = path.join(workspacePath, SYNAPSE_THEME_DIR, 'config.json');
    if (fs.existsSync(projectConfigPath)) {
        try {
            const raw = fs.readFileSync(projectConfigPath, 'utf-8');
            const projectConfig = JSON.parse(raw);
            if (!store && projectConfig.store)
                store = projectConfig.store;
            if (!themeId && projectConfig.themeId)
                themeId = projectConfig.themeId;
        }
        catch {
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
export function loadConfig() {
    ensureSynapseDir();
    let fileConfig = {};
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
            fileConfig = JSON.parse(raw);
        }
        catch {
            // Invalid config file, use defaults
        }
    }
    // Environment variable overrides
    const envOverrides = {};
    if (process.env.SYNAPSE_API_URL) {
        envOverrides.apiUrl = process.env.SYNAPSE_API_URL;
    }
    if (process.env.SYNAPSE_LOG_LEVEL) {
        envOverrides.logLevel = process.env.SYNAPSE_LOG_LEVEL;
    }
    const merged = {
        ...DEFAULT_CONFIG,
        ...fileConfig,
        ...envOverrides,
    };
    const mode = (process.env.SYNAPSE_MODE ?? 'synapse');
    if (mode === 'local') {
        return loadLocalConfig(merged.logLevel);
    }
    return { ...merged, mode: 'synapse' };
}
//# sourceMappingURL=config.js.map