import type { APIClient } from '../api/client.js';
import type { AuthManager } from '../auth/manager.js';
import type { ToolRegistry } from './registry.js';

/**
 * Tool to fetch the most recent Synapse IDE agent chat transcript for a project.
 * Lets Cursor (or other MCP clients) read the in-app chat that lives in Supabase.
 */
export function registerChatTools(
  registry: ToolRegistry,
  apiClient: APIClient,
  authManager: AuthManager
): void {
  registry.register({
    definition: {
      name: 'synapse_get_project_chat',
      description:
        'Get the most recent agent chat session and its messages (transcript) for a Synapse project. Use this to read the Synapse IDE chat for a given projectId.',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Synapse project ID (e.g. 779a7b23-0464-4252-a697-4d6a93da6e7e)',
          },
        },
        required: ['projectId'],
      },
    },
    async handler(args) {
      if (!authManager.isAuthenticated()) {
        throw new Error('AUTH_REQUIRED');
      }

      const projectId = args.projectId as string;
      const result = await apiClient.getProjectAgentChat(projectId);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    },
  });
}
