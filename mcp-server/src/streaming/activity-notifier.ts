import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { logger } from '../logger.js';

export interface AgentActivityUpdate {
  executionId: string;
  status: string;
  activeAgents: string[];
  completedAgents: string[];
  progress: number;
  message?: string;
}

export class ActivityNotifier {
  private server: Server;

  constructor(server: Server) {
    this.server = server;
  }

  /** Send agent activity update to Cursor via MCP notification */
  sendUpdate(update: AgentActivityUpdate): void {
    try {
      // MCP notifications are sent to the client (Cursor)
      // Cursor displays these in its status bar / notification panel
      this.server.notification({
        method: 'synapse/agentActivity',
        params: {
          executionId: update.executionId,
          status: update.status,
          activeAgents: update.activeAgents,
          completedAgents: update.completedAgents,
          progress: update.progress,
          message: update.message ?? this.formatMessage(update),
        },
      });

      logger.debug('Sent activity notification', {
        executionId: update.executionId,
        progress: update.progress,
      });
    } catch (error) {
      logger.error('Failed to send notification', error);
    }
  }

  /** Calculate progress from completed/total agents */
  static calculateProgress(completedCount: number, totalCount: number): number {
    if (totalCount === 0) return 0;
    return Math.round((completedCount / totalCount) * 100);
  }

  private formatMessage(update: AgentActivityUpdate): string {
    if (update.status === 'completed') {
      return `Agents completed (${update.completedAgents.length} agents)`;
    }
    if (update.status === 'failed') {
      return 'Agent execution failed';
    }
    if (update.activeAgents.length > 0) {
      return `Working: ${update.activeAgents.join(', ')} (${update.progress}%)`;
    }
    return `Processing... (${update.progress}%)`;
  }
}
