import { logger } from '../logger.js';
export function registerProjectTools(registry, apiClient, authManager) {
    registry.register({
        definition: {
            name: 'synapse_create_project',
            description: 'Create a new Synapse project from current workspace.',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Project name' },
                    description: { type: 'string', description: 'Optional project description' },
                },
                required: ['name'],
            },
        },
        async handler(args) {
            if (!authManager.isAuthenticated()) {
                throw new Error('AUTH_REQUIRED');
            }
            const name = args.name;
            const description = args.description;
            const result = await apiClient.createProject(name, description);
            logger.info('Project created', { name, id: result.data.id });
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({
                            projectId: result.data.id,
                            name: result.data.name,
                        }),
                    }],
            };
        },
    });
    registry.register({
        definition: {
            name: 'synapse_list_projects',
            description: 'List all Synapse projects for the authenticated user.',
            inputSchema: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
        async handler() {
            if (!authManager.isAuthenticated()) {
                throw new Error('AUTH_REQUIRED');
            }
            const result = await apiClient.listProjects();
            return {
                content: [{
                        type: 'text',
                        text: JSON.stringify({ projects: result.data }),
                    }],
            };
        },
    });
}
//# sourceMappingURL=projects.js.map