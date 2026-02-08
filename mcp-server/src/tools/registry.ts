import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { logger } from '../logger.js';

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
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

export interface ToolRegistryEntry {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export class ToolRegistry {
  private tools = new Map<string, ToolRegistryEntry>();

  register(entry: ToolRegistryEntry): void {
    if (this.tools.has(entry.definition.name)) {
      logger.warn(`Tool "${entry.definition.name}" already registered, overwriting`);
    }
    this.tools.set(entry.definition.name, entry);
    logger.debug(`Registered tool: ${entry.definition.name}`);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((e) => e.definition);
  }

  getHandler(name: string): ToolHandler | undefined {
    return this.tools.get(name)?.handler;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

/**
 * Register all tools from the registry with the MCP server.
 * Sets up a single tools/list and tools/call handler that dispatches.
 */
export function registerAllTools(server: Server, registry: ToolRegistry): void {
  server.setRequestHandler(
    { method: 'tools/list' } as never,
    async () => ({
      tools: registry.getDefinitions(),
    })
  );

  server.setRequestHandler(
    { method: 'tools/call' } as never,
    async (request: { params: { name: string; arguments?: Record<string, unknown> } }) => {
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
      } catch (error) {
        logger.error(`Tool "${name}" error`, error);
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: String(error) }) }],
          isError: true,
        };
      }
    }
  );

  logger.info(`Registered ${registry.getDefinitions().length} MCP tools`);
}
