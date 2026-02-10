export declare class FileWriter {
    private workspaceRoot;
    private createBackups;
    constructor(workspaceRoot: string, createBackups?: boolean);
    /**
     * Write file atomically: write to temp file, then rename.
     * Creates backup before writing if enabled.
     */
    writeFileAtomic(filePath: string, content: string): Promise<void>;
    /** Restore file from backup */
    restoreFromBackup(filePath: string): Promise<boolean>;
    /** Check if file was modified since a given timestamp */
    wasModifiedSince(filePath: string, since: Date): Promise<boolean>;
    /** Clean up backup files */
    cleanupBackup(filePath: string): Promise<void>;
}
//# sourceMappingURL=writer.d.ts.map