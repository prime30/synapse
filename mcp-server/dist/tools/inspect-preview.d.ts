import type { APIClient } from '../api/client.js';
import type { AuthManager } from '../auth/manager.js';
import type { ToolRegistry } from './registry.js';
/**
 * Register the synapse_inspect_preview MCP tool.
 *
 * This tool queries the DOM of the Shopify preview via the
 * server-side cache (populated by the frontend bridge).
 */
export declare function registerInspectPreviewTools(registry: ToolRegistry, apiClient: APIClient, authManager: AuthManager): void;
//# sourceMappingURL=inspect-preview.d.ts.map