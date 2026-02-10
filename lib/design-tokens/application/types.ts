/**
 * REQ-52 Task 5: Token application engine types.
 *
 * Defines the contracts for applying design-token changes across project files
 * atomically, including impact analysis and deployment results.
 */

// ---------------------------------------------------------------------------
// Token change descriptors
// ---------------------------------------------------------------------------

/**
 * Describes a single token-level change to apply across project files.
 *
 * - `replace` — find `oldValue` in files, replace with `newValue`.
 * - `rename`  — rename CSS var references (e.g. `--old-name` → `--new-name`).
 * - `delete`  — remove token references (caller should warn first).
 */
export interface TokenChange {
  type: 'replace' | 'rename' | 'delete';
  tokenName: string;
  oldValue?: string;
  newValue?: string;
}

// ---------------------------------------------------------------------------
// Impact analysis
// ---------------------------------------------------------------------------

export interface FileImpact {
  filePath: string;
  instanceCount: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ImpactAnalysis {
  filesAffected: FileImpact[];
  totalInstances: number;
  riskSummary: string;
}

// ---------------------------------------------------------------------------
// Deployment result
// ---------------------------------------------------------------------------

export interface DeploymentResult {
  success: boolean;
  filesModified: string[];
  instancesChanged: number;
  /** Design-system version id created for this deployment. */
  versionId?: string;
  errors?: string[];
}

// ---------------------------------------------------------------------------
// Validation result (used by syntax validators)
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
