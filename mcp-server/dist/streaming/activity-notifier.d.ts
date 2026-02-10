import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
export interface AgentActivityUpdate {
    executionId: string;
    status: string;
    activeAgents: string[];
    completedAgents: string[];
    progress: number;
    message?: string;
}
export declare class ActivityNotifier {
    private server;
    constructor(server: Server);
    /** Send agent activity update to Cursor via MCP notification */
    sendUpdate(update: AgentActivityUpdate): void;
    /** Calculate progress from completed/total agents */
    static calculateProgress(completedCount: number, totalCount: number): number;
    private formatMessage;
}
//# sourceMappingURL=activity-notifier.d.ts.map