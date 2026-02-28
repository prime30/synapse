import { logger } from '../logger.js';
export class APIClient {
    config;
    authManager;
    constructor(config, authManager) {
        this.config = config;
        this.authManager = authManager;
    }
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };
        const auth = this.authManager.getAuthHeader();
        if (auth)
            headers['Authorization'] = auth;
        return headers;
    }
    async request(method, path, body) {
        if (!this.authManager.isAuthenticated()) {
            throw new Error('AUTH_REQUIRED: Please authenticate first using synapse_authenticate');
        }
        const url = `${this.config.apiUrl}${path}`;
        logger.debug(`API ${method} ${path}`);
        const response = await fetch(url, {
            method,
            headers: this.getHeaders(),
            body: body ? JSON.stringify(body) : undefined,
        });
        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`API error: ${response.status}`, { path, error: errorText });
            if (response.status === 401) {
                throw new Error('AUTH_EXPIRED: Token expired, please re-authenticate');
            }
            if (response.status === 429) {
                throw new Error('RATE_LIMITED: Too many requests, please wait');
            }
            throw new Error(`API_ERROR: ${response.status} ${errorText}`);
        }
        return response.json();
    }
    // Project endpoints
    async createProject(name, description) {
        return this.request('POST', '/api/projects', {
            name,
            description,
            organization_id: 'default',
        });
    }
    async listProjects() {
        return this.request('GET', '/api/projects');
    }
    /**
     * Get the most recent agent chat session and its messages for a project
     * (Synapse IDE chat transcript).
     */
    async getProjectAgentChat(projectId) {
        return this.request('GET', `/api/projects/${projectId}/agent-chat`);
    }
    // File endpoints
    async addFile(projectId, file) {
        return this.request('POST', '/api/files', {
            project_id: projectId,
            ...file,
        });
    }
    async listProjectFiles(projectId) {
        return this.request('GET', `/api/projects/${projectId}/files`);
    }
    async updateFileContent(fileId, content) {
        return this.request('PUT', `/api/files/${fileId}`, { content });
    }
    // Agent endpoints
    async executeAgents(projectId, userRequest) {
        return this.request('POST', '/api/agents/execute', {
            projectId,
            request: userRequest,
        });
    }
    async getExecutionStatus(executionId) {
        return this.request('GET', `/api/agents/executions/${executionId}`);
    }
    async getProposedChanges(executionId) {
        return this.request('GET', `/api/agents/executions/${executionId}`);
    }
    // Preferences endpoints
    async getPreferences() {
        return this.request('GET', '/api/agents/preferences');
    }
}
//# sourceMappingURL=client.js.map