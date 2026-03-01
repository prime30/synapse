/**
 * Phase 6: Theme Standardization types.
 *
 * Action types for the intelligent theme standardization helper.
 */

export interface ConformAction {
  id: string;
  filePath: string;
  line: number;
  hardcodedValue: string;
  targetToken: { name: string; value: string; id: string };
  confidence: number;
}

export interface AdoptAction {
  id: string;
  filePath: string;
  line: number;
  hardcodedValue: string;
  suggestedName: string;
  suggestedCategory: string;
  fileCount: number;
}

export interface UnifyAction {
  id: string;
  values: { value: string; filePath: string; line: number }[];
  canonicalValue: string;
  suggestedName: string;
}

export interface RemoveAction {
  id: string;
  tokenName: string;
  tokenValue: string;
  tokenId: string;
}

export interface AuditStats {
  totalFilesScanned: number;
  totalValuesFound: number;
  conformCount: number;
  adoptCount: number;
  unifyCount: number;
  removeCount: number;
}

export interface StandardizationAudit {
  conform: ConformAction[];
  adopt: AdoptAction[];
  unify: UnifyAction[];
  remove: RemoveAction[];
  stats: AuditStats;
}

export type ApprovedAction =
  | { type: 'conform'; id: string }
  | { type: 'adopt'; id: string; tokenName?: string; category?: string }
  | { type: 'unify'; id: string; canonicalValue?: string }
  | { type: 'remove'; id: string };
