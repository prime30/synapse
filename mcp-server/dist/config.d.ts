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
export type ResolvedConfig = (SynapseConfig & {
    mode: 'synapse';
}) | LocalConfig;
export declare function ensureSynapseDir(): void;
export declare function getSynapseDir(): string;
export declare function loadConfig(): ResolvedConfig;
//# sourceMappingURL=config.d.ts.map