/**
 * Security utilities for file system access.
 * Prevents directory traversal and unauthorized access.
 */
/** Check if a path is safely within the workspace root */
export declare function isPathSafe(filePath: string, workspaceRoot: string): boolean;
/** Check if file exists and is readable */
export declare function canReadFile(filePath: string): Promise<boolean>;
/** Check if file exists and is writable */
export declare function canWriteFile(filePath: string): Promise<boolean>;
//# sourceMappingURL=permissions.d.ts.map