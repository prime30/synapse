type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export declare function initLogger(level?: LogLevel): void;
export declare const logger: {
    debug: (message: string, data?: unknown) => void;
    info: (message: string, data?: unknown) => void;
    warn: (message: string, data?: unknown) => void;
    error: (message: string, data?: unknown) => void;
};
export declare function closeLogger(): void;
export {};
//# sourceMappingURL=logger.d.ts.map