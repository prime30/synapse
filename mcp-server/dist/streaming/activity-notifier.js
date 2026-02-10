import { logger } from '../logger.js';
export class ActivityNotifier {
    server;
    constructor(server) {
        this.server = server;
    }
    /** Send agent activity update to Cursor via MCP notification */
    sendUpdate(update) {
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
        }
        catch (error) {
            logger.error('Failed to send notification', error);
        }
    }
    /** Calculate progress from completed/total agents */
    static calculateProgress(completedCount, totalCount) {
        if (totalCount === 0)
            return 0;
        return Math.round((completedCount / totalCount) * 100);
    }
    formatMessage(update) {
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
//# sourceMappingURL=activity-notifier.js.map