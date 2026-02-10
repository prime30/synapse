import fs from 'fs-extra';
import path from 'path';
/**
 * Security utilities for file system access.
 * Prevents directory traversal and unauthorized access.
 */
/** Check if a path is safely within the workspace root */
export function isPathSafe(filePath, workspaceRoot) {
    const resolved = path.resolve(workspaceRoot, filePath);
    const normalizedRoot = path.resolve(workspaceRoot);
    // Must be within workspace
    if (!resolved.startsWith(normalizedRoot))
        return false;
    // Must not access hidden directories (except .synapse)
    const relative = path.relative(normalizedRoot, resolved);
    const parts = relative.split(path.sep);
    for (const part of parts) {
        if (part.startsWith('.') && part !== '.synapse')
            return false;
    }
    // Must not access system files
    const blockedPatterns = ['node_modules', '.git', '.env'];
    for (const pattern of blockedPatterns) {
        if (parts.includes(pattern))
            return false;
    }
    return true;
}
/** Check if file exists and is readable */
export async function canReadFile(filePath) {
    try {
        await fs.access(filePath, fs.constants.R_OK);
        return true;
    }
    catch {
        return false;
    }
}
/** Check if file exists and is writable */
export async function canWriteFile(filePath) {
    try {
        await fs.access(filePath, fs.constants.W_OK);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=permissions.js.map