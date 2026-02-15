export type SuggestionSource = 'ai_model' | 'static_rule' | 'hybrid';
export type SuggestionScope = 'single_line' | 'multi_line' | 'multi_file';
export type SuggestionStatus = 'pending' | 'applied' | 'rejected' | 'edited' | 'undone';

export interface Suggestion {
  id: string;
  user_id: string;
  project_id: string;
  source: SuggestionSource;
  scope: SuggestionScope;
  status: SuggestionStatus;
  file_paths: string[];
  original_code: string;
  suggested_code: string;
  applied_code: string | null;
  explanation: string;
  /** Agent confidence in this suggestion (0-1). Populated from AgentResult/CodeChange confidence. */
  confidence?: number;
  created_at: string;
  applied_at: string | null;
  rejected_at: string | null;
  updated_at: string;
}
