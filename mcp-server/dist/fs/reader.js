import fs from 'fs-extra';
import path from 'path';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const FILE_TYPE_MAP = {
    '.liquid': 'liquid',
    '.js': 'javascript',
    '.ts': 'javascript',
    '.jsx': 'javascript',
    '.tsx': 'javascript',
    '.css': 'css',
    '.scss': 'css',
};
export class FileReader {
    workspaceRoot;
    constructor(workspaceRoot) {
        this.workspaceRoot = path.resolve(workspaceRoot);
    }
    /** Validate path is within workspace root (prevent directory traversal) */
    validatePath(filePath) {
        const resolved = path.resolve(this.workspaceRoot, filePath);
        return resolved.startsWith(this.workspaceRoot);
    }
    /** Read file content with size limit */
    async readFile(filePath) {
        const absPath = this.resolvePath(filePath);
        if (!this.validatePath(filePath)) {
            throw new Error(`Path traversal detected: ${filePath}`);
        }
        const stats = await fs.stat(absPath);
        if (stats.size > MAX_FILE_SIZE) {
            throw new Error(`File too large: ${stats.size} bytes (max ${MAX_FILE_SIZE})`);
        }
        return fs.readFile(absPath, 'utf-8');
    }
    /** Check file permissions */
    async checkPermissions(filePath) {
        const absPath = this.resolvePath(filePath);
        try {
            await fs.access(absPath, fs.constants.R_OK);
            let canWrite = false;
            try {
                await fs.access(absPath, fs.constants.W_OK);
                canWrite = true;
            }
            catch {
                // Write not permitted
            }
            return { canRead: true, canWrite };
        }
        catch (error) {
            return { canRead: false, canWrite: false, error: String(error) };
        }
    }
    /** Detect file type from extension */
    getFileType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return FILE_TYPE_MAP[ext] ?? 'other';
    }
    /** Resolve relative path to absolute */
    resolvePath(filePath) {
        return path.resolve(this.workspaceRoot, filePath);
    }
    /** List files in workspace matching supported types */
    async listFiles(dir) {
        const targetDir = dir ? this.resolvePath(dir) : this.workspaceRoot;
        if (!targetDir.startsWith(this.workspaceRoot)) {
            throw new Error('Path traversal detected');
        }
        const files = [];
        async function walk(currentDir, root) {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                // Skip hidden dirs and node_modules
                if (entry.name.startsWith('.') || entry.name === 'node_modules')
                    continue;
                if (entry.isDirectory()) {
                    await walk(fullPath, root);
                }
                else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (ext in FILE_TYPE_MAP) {
                        files.push(path.relative(root, fullPath));
                    }
                }
            }
        }
        await walk(targetDir, this.workspaceRoot);
        return files;
    }
}
//# sourceMappingURL=reader.js.map