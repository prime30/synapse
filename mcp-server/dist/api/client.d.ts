import type { SynapseConfig } from '../config.js';
import type { AuthManager } from '../auth/manager.js';
export declare class APIClient {
    private config;
    private authManager;
    constructor(config: SynapseConfig, authManager: AuthManager);
    private getHeaders;
    private request;
    createProject(name: string, description?: string): Promise<{
        data: {
            id: string;
            name: string;
        };
    }>;
    listProjects(): Promise<{
        data: Array<{
            id: string;
            name: string;
            fileCount?: number;
        }>;
    }>;
    addFile(projectId: string, file: {
        name: string;
        path: string;
        file_type: string;
        content: string;
    }): Promise<{
        data: {
            id: string;
            name: string;
        };
    }>;
    listProjectFiles(projectId: string): Promise<{
        data: Array<{
            id: string;
            name: string;
            path: string;
            file_type: string;
        }>;
    }>;
    updateFileContent(fileId: string, content: string): Promise<{
        data: unknown;
    }>;
    executeAgents(projectId: string, userRequest: string): Promise<{
        data: {
            executionId: string;
        };
    }>;
    getExecutionStatus(executionId: string): Promise<{
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
                issues: Array<{
                    severity: string;
                    description: string;
                }>;
            };
        };
    }>;
    getProposedChanges(executionId: string): Promise<{
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
    }>;
    getPreferences(): Promise<{
        data: Array<{
            category: string;
            key: string;
            value: string;
            file_type: string | null;
            confidence: number;
        }>;
    }>;
}
//# sourceMappingURL=client.d.ts.map