/**
 * Agent context provider - REQ-5 TASK-6
 * Delivers formatted project context to all agents in REQ-2.
 */
import { createClient } from '@/lib/supabase/server';
import { ContextUpdater } from './updater';
import { ClaudeContextPackager, CodexContextPackager } from './packager';
import type { ProposedChange } from './packager';
import type { ProjectContext } from './types';
import type {
  AgentType,
  AgentContext,
  UserPreference,
  AgentMessage,
  FileContext as AgentFileContext,
} from '@/lib/types/agent';

const MAX_CONVERSATION_MESSAGES = 10;

export class AgentContextProvider {
  private updater: ContextUpdater;
  private claudePackager: ClaudeContextPackager;
  private codexPackager: CodexContextPackager;

  constructor() {
    this.updater = new ContextUpdater();
    this.claudePackager = new ClaudeContextPackager();
    this.codexPackager = new CodexContextPackager();
  }

  /**
   * Provide full context for an agent execution.
   */
  async provideContextForAgent(
    agentType: AgentType,
    projectId: string,
    userId: string,
    executionId: string,
    userRequest: string,
    proposedChanges?: ProposedChange[]
  ): Promise<AgentContext> {
    const projectContext = await this.updater.loadProjectContext(projectId);
    const preferences = await this.loadUserPreferences(userId);
    const conversationHistory = await this.loadConversationHistory(executionId);

    const agentFiles = this.mapToAgentFiles(projectContext);

    return {
      executionId,
      projectId,
      userId,
      userRequest,
      files: agentFiles,
      userPreferences: preferences,
      conversationHistory,
    };
  }

  /**
   * Format the context as a prompt string for a specific agent type.
   */
  formatContextForAgent(
    agentType: AgentType,
    projectContext: ProjectContext,
    userRequest: string,
    proposedChanges?: ProposedChange[]
  ): string {
    if (agentType === 'review' && proposedChanges) {
      return this.codexPackager.packageForReview(projectContext, proposedChanges);
    }

    return this.claudePackager.packageForAgent(
      projectContext,
      userRequest,
      agentType
    );
  }

  /**
   * Load user preferences from the database.
   */
  async loadUserPreferences(userId: string): Promise<UserPreference[]> {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .order('last_reinforced', { ascending: false });

      if (error || !data) return [];
      return data as UserPreference[];
    } catch {
      return [];
    }
  }

  /**
   * Load recent conversation history for context.
   */
  async loadConversationHistory(
    executionId: string
  ): Promise<AgentMessage[]> {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('agent_executions')
        .select('execution_log')
        .eq('id', executionId)
        .single();

      if (error || !data?.execution_log) return [];

      const messages = data.execution_log as AgentMessage[];
      return messages.slice(-MAX_CONVERSATION_MESSAGES);
    } catch {
      return [];
    }
  }

  /**
   * Map ProjectContext files to the AgentFileContext format used by REQ-2 agents.
   */
  private mapToAgentFiles(context: ProjectContext): AgentFileContext[] {
    return context.files.map((f) => ({
      fileId: f.fileId,
      fileName: f.fileName,
      fileType: f.fileType,
      content: f.content,
    }));
  }
}
