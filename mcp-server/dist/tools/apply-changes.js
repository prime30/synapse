import { FileWriter } from '../fs/writer.js';
import { logger } from '../logger.js';
export function registerApplyTools(registry, apiClient, authManager) {
    registry.register({
        definition: {
            name: 'synapse_apply_changes',
            description: 'Write AI-suggested changes to workspace files atomically.',
            inputSchema: {
                type: 'object',
                properties: {
                    executionId: { type: 'string', description: 'Agent execution ID' },
                    changeIds: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'IDs of changes to apply (omit to apply all)',
                    },
                    workspacePath: { type: 'string', description: 'Absolute path to workspace root' },
                },
                required: ['executionId', 'workspacePath'],
            },
        },
        async handler(args) {
            if (!authManager.isAuthenticated()) {
                throw new Error('AUTH_REQUIRED');
            }
            const executionId = args.executionId;
            const changeIds = args.changeIds;
            const workspacePath = args.workspacePath;
            const writer = new FileWriter(workspacePath);
            // Get proposed changes from API
            const result = await apiClient.getProposedChanges(executionId);
            let changes = result.data.proposed_changes ?? [];
            // Filter by changeIds if provided
            if (changeIds?.length) {
                changes = changes.filter((_, index) => changeIds.includes(String(index)));
            }
            const appliedFiles = [];
            const errors = [];
            for (const change of changes) {
                try {
                    await writer.writeFileAtomic(change.fileName, change.proposedContent);
                    appliedFiles.push(change.fileName);
                    logger.info('Applied change', { file: change.fileName, agent: change.agentType });
                }
                catch (error) {
                    const errorMsg = String(error);
                    errors.push({ file: change.fileName, error: errorMsg });
                    logger.error('Failed to apply change', { file: change.fileName, error: errorMsg });
                    // Attempt backup restoration
                    const restored = await writer.restoreFromBackup(change.fileName);
                    if (restored) {
                        logger.info('Restored from backup', { file: change.fileName });
                    }
                }
            }
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: errors.length === 0,
                            appliedFiles,
                            errors: errors.length > 0 ? errors : undefined,
                        }),
                    }],
            };
        },
    });
}
//# sourceMappingURL=apply-changes.js.map