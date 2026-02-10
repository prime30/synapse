export interface FilePermissions {
    canRead: boolean;
    canWrite: boolean;
    error?: string;
}
export type FileType = 'liquid' | 'javascript' | 'css' | 'other';
export declare class FileReader {
    private workspaceRoot;
    constructor(workspaceRoot: string);
    /** Validate path is within workspace root (prevent directory traversal) */
    validatePath(filePath: string): boolean;
    /** Read file content with size limit */
    readFile(filePath: string): Promise<string>;
    /** Check file permissions */
    checkPermissions(filePath: string): Promise<FilePermissions>;
    /** Detect file type from extension */
    getFileType(filePath: string): FileType;
    /** Resolve relative path to absolute */
    resolvePath(filePath: string): string;
    /** List files in workspace matching supported types */
    listFiles(dir?: string): Promise<string[]>;
}
//# sourceMappingURL=reader.d.ts.map