/** Task node in dependency analysis */
export interface TaskNode {
  taskId: string;
  dependsOn: string[];
  blocks: string[];
  depth: number;
  files: string[];
}

/** Result of dependency graph analysis */
export interface DependencyAnalysis {
  tasks: Map<string, TaskNode>;
  hasCycles: boolean;
  cycles: string[][];
  roots: string[];
  leaves: string[];
}

/** File conflict between tasks in same wave */
export interface FileConflict {
  file: string;
  tasks: string[];
  resolution: 'sequential' | 'parallel_safe';
}

/** Execution wave - tasks that can run in parallel */
export interface ExecutionWave {
  waveNumber: number;
  tasks: string[];
  estimatedDuration: number;
  fileConflicts: FileConflict[];
}

/** Agent state in pool */
export interface AgentState {
  agentId: string;
  status: 'idle' | 'busy' | 'blocked' | 'stale';
  currentTask: string | null;
  capabilities: string[];
  lastHeartbeat: Date;
  tasksCompleted: number;
  tasksFailed: number;
}

/** Task assignment with reason */
export interface Assignment {
  agentId: string;
  taskId: string;
  reason: string;
}

/** Blocker info for dashboard */
export interface BlockerInfo {
  taskId: string;
  taskTitle: string;
  reason: string;
  resolutionAttempts: number;
  resolution?: string;
}

/** Agent info for dashboard */
export interface AgentDashboardInfo {
  agentId: string;
  status: string;
  currentTask: string | null;
  lastHeartbeat: Date;
}

/** Dashboard state */
export interface DashboardState {
  epic: {
    id: string;
    name: string;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    progressPercent: number;
  };
  currentWave: {
    number: number;
    totalWaves: number;
    tasks: number;
    completed: number;
    failed: number;
    inProgress: number;
    blocked: number;
    progressPercent: number;
  };
  agents: AgentDashboardInfo[];
  blockers: BlockerInfo[];
  nextWave: {
    number: number;
    tasks: string[];
  };
  lastUpdated: Date;
}
