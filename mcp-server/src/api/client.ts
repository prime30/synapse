import type { SynapseConfig } from '../config.js';
import type { AuthManager } from '../auth/manager.js';
import { logger } from '../logger.js';

export class APIClient {
  private config: SynapseConfig;
  private authManager: AuthManager;

  constructor(config: SynapseConfig, authManager: AuthManager) {
    this.config = config;
    this.authManager = authManager;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const auth = this.authManager.getAuthHeader();
    if (auth) headers['Authorization'] = auth;
    return headers;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
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

    return response.json() as Promise<T>;
  }

  // Project endpoints
  async createProject(name: string, description?: string): Promise<{ data: { id: string; name: string } }> {
    return this.request('POST', '/api/projects', {
      name,
      description,
      organization_id: 'default',
    });
  }

  async listProjects(): Promise<{ data: Array<{ id: string; name: string; fileCount?: number }> }> {
    return this.request('GET', '/api/projects');
  }

  /**
   * Get the most recent agent chat session and its messages for a project
   * (Synapse IDE chat transcript).
   */
  async getProjectAgentChat(projectId: string): Promise<{
    data: {
      session: { id: string; title: string; created_at: string; updated_at: string } | null;
      messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: string }>;
    };
  }> {
    return this.request('GET', `/api/projects/${projectId}/agent-chat`);
  }

  // File endpoints
  async addFile(projectId: string, file: { name: string; path: string; file_type: string; content: string }): Promise<{ data: { id: string; name: string } }> {
    return this.request('POST', '/api/files', {
      project_id: projectId,
      ...file,
    });
  }

  async listProjectFiles(projectId: string): Promise<{ data: Array<{ id: string; name: string; path: string; file_type: string }> }> {
    return this.request('GET', `/api/projects/${projectId}/files`);
  }

  async updateFileContent(fileId: string, content: string): Promise<{ data: unknown }> {
    return this.request('PUT', `/api/files/${fileId}`, { content });
  }

  // Agent endpoints
  async executeAgents(projectId: string, userRequest: string): Promise<Record<string, unknown>> {
    return this.request('POST', '/api/agents/execute', {
      projectId,
      request: userRequest,
    });
  }

  async getExecutionStatus(executionId: string): Promise<{
    data: {
      status: string;
      activeAgents?: string[];
      completedAgents?: string[];
      proposedChanges?: Array<{
        fileId: string;
        fileName: string;
        originalContent: string;
        proposedContent: string;
        reasoning: string;
        agentType: string;
      }>;
      reviewResult?: {
        approved: boolean;
        issues: Array<{ severity: string; description: string }>;
      };
    };
  }> {
    return this.request('GET', `/api/agents/executions/${executionId}`);
  }

  async getProposedChanges(executionId: string): Promise<{
    data: {
      proposed_changes: Array<{
        fileId: string;
        fileName: string;
        originalContent: string;
        proposedContent: string;
        reasoning: string;
        agentType: string;
      }>;
    };
  }> {
    return this.request('GET', `/api/agents/executions/${executionId}`);
  }

  // Preferences endpoints
  async getPreferences(): Promise<{
    data: Array<{
      category: string;
      key: string;
      value: string;
      file_type: string | null;
      confidence: number;
    }>;
  }> {
    return this.request('GET', '/api/agents/preferences');
  }
}
