import path from 'path';
import { FileReader } from '../fs/reader.js';
import { logger } from '../logger.js';
function normalizePath(p) {
    return p.replace(/\\/g, '/');
}
export function registerFileTools(registry, apiClient, authManager) {
    registry.register({
        definition: {
            name: 'synapse_sync_workspace_to_project',
            description: 'Sync local workspace files to a Synapse project. Updates existing project files and adds new theme files. Call before synapse_execute_agents so agents see the same content as the workspace.',
            inputSchema: {
                type: 'object',
                properties: {
                    projectId: { type: 'string', description: 'Synapse project ID' },
                    workspacePath: { type: 'string', description: 'Absolute path to workspace root' },
                },
                required: ['projectId', 'workspacePath'],
            },
        },
        async handler(args) {
            if (!authManager.isAuthenticated()) {
                throw new Error('AUTH_REQUIRED');
            }
            const projectId = args.projectId;
            const workspacePath = path.resolve(args.workspacePath);
            const reader = new FileReader(workspacePath);
            const errors = [];
            let updated = 0;
            let added = 0;
            const projectFilesResult = await apiClient.listProjectFiles(projectId);
            const projectFiles = projectFilesResult.data ?? [];
            const pathToId = new Map();
            for (const f of projectFiles) {
                pathToId.set(normalizePath(f.path), f.id);
            }
            const localPaths = await reader.listFiles();
            for (const filePath of localPaths) {
                const normalized = normalizePath(filePath);
                try {
                    if (!reader.validatePath(filePath)) {
                        errors.push({ path: filePath, error: 'Path traversal detected' });
                        continue;
                    }
                    const content = await reader.readFile(filePath);
                    const existingId = pathToId.get(normalized);
                    if (existingId !== undefined) {
                        await apiClient.updateFileContent(existingId, content);
                        updated += 1;
                        logger.info('File updated', { filePath });
                    }
                    else {
                        const fileType = reader.getFileType(filePath);
                        const name = normalized.split('/').pop() ?? filePath;
                        await apiClient.addFile(projectId, {
                            name,
                            path: normalized,
                            file_type: fileType,
                            content,
                        });
                        added += 1;
                        logger.info('File added', { filePath, fileType });
                    }
                }
                catch (error) {
                    errors.push({ path: filePath, error: String(error) });
                    logger.error('Failed to sync file', { filePath, error });
                }
            }
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            updated,
                            added,
                            ...(errors.length > 0 && { errors }),
                        }),
                    }],
            };
        },
    });
    registry.register({
        definition: {
            name: 'synapse_add_files',
            description: 'Add files from workspace to a Synapse project.',
            inputSchema: {
                type: 'object',
                properties: {
                    projectId: { type: 'string', description: 'Synapse project ID' },
                    filePaths: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'File paths relative to workspace root',
                    },
                    workspacePath: { type: 'string', description: 'Absolute path to workspace root' },
                },
                required: ['projectId', 'filePaths', 'workspacePath'],
            },
        },
        async handler(args) {
            if (!authManager.isAuthenticated()) {
                throw new Error('AUTH_REQUIRED');
            }
            const projectId = args.projectId;
            const filePaths = args.filePaths;
            const workspacePath = args.workspacePath;
            const fileReader = new FileReader(workspacePath);
            const addedFiles = [];
            const errors = [];
            for (const filePath of filePaths) {
                try {
                    if (!fileReader.validatePath(filePath)) {
                        errors.push({ file: filePath, error: 'Path traversal detected' });
                        continue;
                    }
                    const content = await fileReader.readFile(filePath);
                    const fileType = fileReader.getFileType(filePath);
                    const fileName = filePath.split('/').pop() ?? filePath;
                    const result = await apiClient.addFile(projectId, {
                        name: fileName,
                        path: filePath,
                        file_type: fileType,
                        content,
                    });
                    addedFiles.push({ fileId: result.data.id, fileName });
                    logger.info('File added', { filePath, fileType });
                }
                catch (error) {
                    errors.push({ file: filePath, error: String(error) });
                    logger.error('Failed to add file', { filePath, error });
                }
            }
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({ addedFiles, errors: errors.length > 0 ? errors : undefined }),
                    }],
            };
        },
    });
}
//# sourceMappingURL=files.js.map