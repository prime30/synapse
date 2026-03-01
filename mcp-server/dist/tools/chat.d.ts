import type { APIClient } from '../api/client.js';
import type { AuthManager } from '../auth/manager.js';
import type { ToolRegistry } from './registry.js';
/**
 * Tool to fetch the most recent Synapse IDE agent chat transcript for a project.
 * Lets Cursor (or other MCP clients) read the in-app chat that lives in Supabase.
 */
export declare function registerChatTools(registry: ToolRegistry, apiClient: APIClient, authManager: AuthManager): void;
//# sourceMappingURL=chat.d.ts.map