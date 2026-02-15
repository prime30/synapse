import { logger } from '../logger.js';
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export class ExecutionPoller {
    apiClient;
    cancelled = false;
    constructor(apiClient) {
        this.apiClient = apiClient;
    }
    async poll(executionId) {
        const startTime = Date.now();
        while (!this.cancelled) {
            if (Date.now() - startTime > POLL_TIMEOUT_MS) {
                throw new Error('EXECUTION_TIMEOUT: Agent execution timed out after 5 minutes');
            }
            try {
                const result = await this.apiClient.getExecutionStatus(executionId);
                const data = result.data;
                if (data.status === 'completed' || data.status === 'failed') {
                    return {
                        status: data.status,
                        proposedChanges: data.proposedChanges,
                        reviewResult: data.reviewResult,
                    };
                }
                logger.debug('Polling execution', {
                    executionId,
                    status: data.status,
                    activeAgents: data.activeAgents,
                });
            }
            catch (error) {
                logger.error('Poll error', { executionId, error });
                throw new Error(`API_ERROR: Failed to poll execution status: ${error}`);
            }
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
        throw new Error('POLL_CANCELLED');
    }
    cancel() {
        this.cancelled = true;
    }
}
export function registerAgentTools(registry, apiClient, authManager) {
    registry.register({
        definition: {
            name: 'synapse_execute_agents',
            description: 'Execute multi-agent system on a user request for a project.',
            inputSchema: {
                type: 'object',
                properties: {
                    projectId: { type: 'string', description: 'Synapse project ID' },
                    userRequest: { type: 'string', description: 'User instruction for the agents' },
                },
                required: ['projectId', 'userRequest'],
            },
        },
        async handler(args) {
            if (!authManager.isAuthenticated()) {
                throw new Error('AUTH_REQUIRED');
            }
            const projectId = args.projectId;
            const userRequest = args.userRequest;
            logger.info('Starting agent execution', { projectId, userRequest });
            // Execute synchronously — the API returns the full result
            const execResult = await apiClient.executeAgents(projectId, userRequest);
            logger.info('Agent execution complete', {
                status: execResult.success ? 'completed' : 'failed',
            });
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify(execResult),
                    }],
            };
        },
    });
}
//# sourceMappingURL=agents.js.map