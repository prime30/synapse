import type { APIClient } from '../api/client.js';
import type { AuthManager } from '../auth/manager.js';
import type { ToolRegistry } from './registry.js';
/**
 * Register media generation MCP tools:
 *  - synapse_generate_image  (Nano Banana Pro / Gemini 3 Pro Image)
 *  - synapse_generate_video  (Veo 3.1)
 *
 * These tools call the Synapse API routes which in turn call
 * the Google GenAI SDK. This keeps API keys server-side.
 */
export declare function registerMediaTools(registry: ToolRegistry, apiClient: APIClient, authManager: AuthManager): void;
//# sourceMappingURL=media.d.ts.map