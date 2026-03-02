import fs from 'fs';
import path from 'path';
const THEME_DIRS = new Set([
    'layout',
    'templates',
    'sections',
    'snippets',
    'assets',
    'config',
    'locales',
]);
const SKIP_DIRS = new Set([
    'node_modules',
    '.git',
    '.cursor',
    '.synapse-theme',
    '.vscode',
]);
const BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
    '.woff', '.woff2', '.ttf', '.eot', '.ico',
    '.mp4', '.webm', '.mp3', '.ogg',
    '.zip', '.tar', '.gz',
]);
function isBinary(filePath) {
    return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}
function walkDir(dir, basePath, results) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/');
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name))
                continue;
            walkDir(fullPath, basePath, results);
        }
        else if (entry.isFile()) {
            if (isBinary(entry.name))
                continue;
            try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                results.push({ path: relativePath, content });
            }
            catch {
                // Skip unreadable files
            }
        }
    }
}
export function readThemeFiles(workspacePath) {
    const results = [];
    for (const dir of THEME_DIRS) {
        const dirPath = path.join(workspacePath, dir);
        if (fs.existsSync(dirPath)) {
            walkDir(dirPath, workspacePath, results);
        }
    }
    return results;
}
export function readThemeFile(workspacePath, filePath) {
    const fullPath = path.join(workspacePath, filePath);
    // Prevent path traversal
    const resolved = path.resolve(fullPath);
    const resolvedBase = path.resolve(workspacePath);
    if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
        return null;
    }
    if (!fs.existsSync(fullPath))
        return null;
    try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        return { path: filePath.replace(/\\/g, '/'), content };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=file-reader.js.map