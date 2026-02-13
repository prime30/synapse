import type { APIClient } from '../api/client.js';
import type { AuthManager } from '../auth/manager.js';
import type { ToolRegistry } from './registry.js';
import { logger } from '../logger.js';

/**
 * Register the synapse_inspect_preview MCP tool.
 *
 * This tool queries the DOM of the Shopify preview via the
 * server-side cache (populated by the frontend bridge).
 */
export function registerInspectPreviewTools(
  registry: ToolRegistry,
  apiClient: APIClient,
  authManager: AuthManager
): void {
  registry.register({
    definition: {
      name: 'synapse_inspect_preview',
      description:
        'Inspect the live Shopify preview DOM to discover elements, app-injected widgets, ' +
        'stylesheets, and computed styles. Useful for understanding third-party app elements ' +
        'that are not in the theme files. The preview must be open in the Synapse IDE.\n\n' +
        'Actions:\n' +
        '- inspect: Find elements matching a CSS selector (requires selector)\n' +
        '- listAppElements: Discover all third-party/app-injected elements\n' +
        '- getStylesheets: List all loaded stylesheets (theme and app)\n' +
        '- getPageSnapshot: Get a lightweight DOM tree of the visible page\n' +
        '- querySelector: Get detailed info about a single element (requires selector)',
      inputSchema: {
        type: 'object',
        properties: {
          projectId: {
            type: 'string',
            description: 'Synapse project ID',
          },
          action: {
            type: 'string',
            description: 'Inspection action: inspect, listAppElements, getStylesheets, getPageSnapshot, querySelector',
          },
          selector: {
            type: 'string',
            description: 'CSS selector (required for inspect and querySelector actions)',
          },
        },
        required: ['projectId', 'action'],
      },
    },

    async handler(args) {
      if (!authManager.isAuthenticated()) {
        throw new Error('AUTH_REQUIRED');
      }

      const projectId = args.projectId as string;
      const action = args.action as string;
      const selector = args.selector as string | undefined;

      logger.info(`Inspecting preview DOM: ${action}${selector ? ` [${selector}]` : ''}`);

      try {
        const result = await apiClient.request<{
          success: boolean;
          data?: unknown;
          cached?: boolean;
          error?: string;
          hint?: string;
        }>('POST', `/api/projects/${projectId}/preview/inspect`, {
          action,
          selector,
        });

        if (result.success && result.data) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result.data, null, 2),
              },
            ],
          };
        }

        // 202 or no data — bridge not ready
        const message = result.error || 'DOM inspection data not available.';
        const hint = result.hint || 'Ensure the preview panel is open in the Synapse IDE.';

        return {
          content: [
            {
              type: 'text',
              text: `${message}\n\n${hint}`,
            },
          ],
          isError: true,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Preview inspect failed: ${errorMessage}`);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to inspect preview: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  });
}
