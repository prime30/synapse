import type { APIClient } from '../api/client.js';
import type { AuthManager } from '../auth/manager.js';
import type { ToolRegistry } from './registry.js';
import { FileReader } from '../fs/reader.js';
import { logger } from '../logger.js';

export function registerFileTools(
  registry: ToolRegistry,
  apiClient: APIClient,
  authManager: AuthManager
): void {
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

      const projectId = args.projectId as string;
      const filePaths = args.filePaths as string[];
      const workspacePath = args.workspacePath as string;

      const fileReader = new FileReader(workspacePath);
      const addedFiles: Array<{ fileId: string; fileName: string }> = [];
      const errors: Array<{ file: string; error: string }> = [];

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
        } catch (error) {
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
