import { logger } from '../logger.js';
export class ToolRegistry {
    tools = new Map();
    register(entry) {
        if (this.tools.has(entry.definition.name)) {
            logger.warn(`Tool "${entry.definition.name}" already registered, overwriting`);
        }
        this.tools.set(entry.definition.name, entry);
        logger.debug(`Registered tool: ${entry.definition.name}`);
    }
    getDefinitions() {
        return Array.from(this.tools.values()).map((e) => e.definition);
    }
    getHandler(name) {
        return this.tools.get(name)?.handler;
    }
    has(name) {
        return this.tools.has(name);
    }
}
/**
 * Register all tools from the registry with the MCP server.
 * Sets up a single tools/list and tools/call handler that dispatches.
 */
export function registerAllTools(server, registry) {
    server.setRequestHandler({ method: 'tools/list' }, async () => ({
        tools: registry.getDefinitions(),
    }));
    server.setRequestHandler({ method: 'tools/call' }, async (request) => {
        const { name } = request.params;
        const handler = registry.getHandler(name);
        if (!handler) {
            logger.error(`Unknown tool called: ${name}`);
            return {
                content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
                isError: true,
            };
        }
        try {
            return await handler(request.params.arguments ?? {});
        }
        catch (error) {
            logger.error(`Tool "${name}" error`, error);
            return {
                content: [{ type: 'text', text: JSON.stringify({ error: String(error) }) }],
                isError: true,
            };
        }
    });
    logger.info(`Registered ${registry.getDefinitions().length} MCP tools`);
}
//# sourceMappingURL=registry.js.map