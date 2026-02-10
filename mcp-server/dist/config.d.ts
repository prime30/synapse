export interface SynapseConfig {
    apiUrl: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    fileWatcherEnabled: boolean;
    autoRefreshToken: boolean;
    backupFiles: boolean;
}
export declare function ensureSynapseDir(): void;
export declare function getSynapseDir(): string;
export declare function loadConfig(): SynapseConfig;
//# sourceMappingURL=config.d.ts.map