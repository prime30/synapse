import { logger } from '../logger.js';
export function registerAuthTools(registry, authManager) {
    registry.register({
        definition: {
            name: 'synapse_authenticate',
            description: 'Authenticate with Synapse using Gmail OAuth. Opens your browser to complete login.',
            inputSchema: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
        async handler() {
            try {
                const result = await authManager.authenticate();
                if (result.success) {
                    return {
                        content: [{
                                type: 'text',
                                text: JSON.stringify({
                                    success: true,
                                    user: result.user,
                                    message: 'Authentication successful!',
                                }),
                            }],
                    };
                }
                return {
                    content: [{
                            type: 'text',
                            text: JSON.stringify({ success: false, error: 'Authentication failed' }),
                        }],
                    isError: true,
                };
            }
            catch (error) {
                logger.error('Authentication error', error);
                return {
                    content: [{
                            type: 'text',
                            text: JSON.stringify({ success: false, error: String(error) }),
                        }],
                    isError: true,
                };
            }
        },
    });
}
//# sourceMappingURL=authenticate.js.map