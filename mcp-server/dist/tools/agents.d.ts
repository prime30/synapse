import type { APIClient } from '../api/client.js';
import type { AuthManager } from '../auth/manager.js';
import type { ToolRegistry } from './registry.js';
export declare class ExecutionPoller {
    private apiClient;
    private cancelled;
    constructor(apiClient: APIClient);
    poll(executionId: string): Promise<{
        status: string;
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
    }>;
    cancel(): void;
}
export declare function registerAgentTools(registry: ToolRegistry, apiClient: APIClient, authManager: AuthManager): void;
//# sourceMappingURL=agents.d.ts.map