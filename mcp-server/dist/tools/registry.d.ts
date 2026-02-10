import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
/**
 * Centralized tool registry for MCP server.
 * Each tool module exports its definitions and handlers into this registry.
 * index.ts calls `registerAllTools(server, registry)` once to set up
 * a single `tools/list` + `tools/call` handler that dispatches to the correct tool.
 */
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
}
export type ToolHandler = (args: Record<string, unknown>) => Promise<{
    content: Array<{
        type: string;
        text: string;
    }>;
    isError?: boolean;
}>;
export interface ToolRegistryEntry {
    definition: ToolDefinition;
    handler: ToolHandler;
}
export declare class ToolRegistry {
    private tools;
    register(entry: ToolRegistryEntry): void;
    getDefinitions(): ToolDefinition[];
    getHandler(name: string): ToolHandler | undefined;
    has(name: string): boolean;
}
/**
 * Register all tools from the registry with the MCP server.
 * Sets up a single tools/list and tools/call handler that dispatches.
 */
export declare function registerAllTools(server: Server, registry: ToolRegistry): void;
//# sourceMappingURL=registry.d.ts.map