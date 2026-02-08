import type { APIClient } from '../api/client.js';
import type { AuthManager } from '../auth/manager.js';
import type { ToolRegistry } from './registry.js';
import { logger } from '../logger.js';

export function registerPreferencesTools(
  registry: ToolRegistry,
  apiClient: APIClient,
  authManager: AuthManager
): void {
  registry.register({
    definition: {
      name: 'synapse_get_preferences',
      description: 'Retrieve learned user preferences for AI agents.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    async handler() {
      if (!authManager.isAuthenticated()) {
        throw new Error('AUTH_REQUIRED');
      }

      const result = await apiClient.getPreferences();

      const formatted = result.data.map((pref) => ({
        preferenceType: pref.category,
        pattern: pref.key,
        example: pref.value,
        appliesTo: pref.file_type ? [pref.file_type] : ['all'],
        confidence: pref.confidence,
      }));

      logger.info('Retrieved preferences', { count: formatted.length });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ preferences: formatted }),
        }],
      };
    },
  });
}
