import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { initLogger, logger, closeLogger } from './logger.js';
import { ToolRegistry, registerAllTools } from './tools/registry.js';
import { registerAuthTools } from './tools/authenticate.js';
import { registerProjectTools } from './tools/projects.js';
import { registerFileTools } from './tools/files.js';
import { registerAgentTools } from './tools/agents.js';
import { registerApplyTools } from './tools/apply-changes.js';
import { registerChatTools } from './tools/chat.js';
import { registerPreferencesTools } from './tools/preferences.js';
import { registerInspectPreviewTools } from './tools/inspect-preview.js';
import { registerMediaTools } from './tools/media.js';
import { registerLocalShopifyTools } from './tools/local-shopify.js';
import { registerLocalPreviewTools } from './tools/local-preview.js';
import { AuthManager } from './auth/manager.js';
import { APIClient } from './api/client.js';
async function main() {
    const config = loadConfig();
    initLogger(config.logLevel);
    logger.info('Synapse MCP server starting', { version: '1.0.0', mode: config.mode });
    const server = new Server({
        name: 'synapse-mcp-server',
        version: '1.0.0',
    }, {
        capabilities: {
            tools: {},
        },
    });
    const registry = new ToolRegistry();
    if (config.mode === 'local') {
        const sidecarUrl = process.env.SYNAPSE_SIDECAR_URL || 'http://localhost:4000';
        registerLocalShopifyTools(registry, config);
        registerLocalPreviewTools(registry, sidecarUrl, config.workspacePath);
    }
    else {
        const authManager = new AuthManager(config);
        await authManager.loadToken();
        const apiClient = new APIClient(config, authManager);
        registerAuthTools(registry, authManager);
        registerProjectTools(registry, apiClient, authManager);
        registerFileTools(registry, apiClient, authManager);
        registerAgentTools(registry, apiClient, authManager);
        registerApplyTools(registry, apiClient, authManager);
        registerChatTools(registry, apiClient, authManager);
        registerPreferencesTools(registry, apiClient, authManager);
        registerInspectPreviewTools(registry, apiClient, authManager);
        registerMediaTools(registry, apiClient, authManager);
    }
    registerAllTools(server, registry);
    const shutdown = async () => {
        logger.info('Synapse MCP server shutting down');
        closeLogger();
        process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('Synapse MCP server connected via stdio');
}
main().catch((error) => {
    console.error('Failed to start Synapse MCP server:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map