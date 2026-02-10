/**
 * REQ-52: Design System Analysis & Token Management
 * Public exports.
 */

// Types
export type {
  DesignTokens,
  DesignTokensDetailed,
  DesignToken,
  ExtractedToken,
  InferredToken,
  TokenCategory,
  TokenGroup,
  ScalePattern,
  NameSuggestion,
} from './types';
export { emptyTokens } from './types';

// Simple extraction (legacy API)
export {
  extractTokens,
  extractFromCSS,
  extractFromJSON,
  mergeTokens,
} from './extract';
export type { TokenFileType } from './extract';

// Per-file parsers (Task 1)
export { parseCSSTokens } from './parsers/css-parser';
export { parseLiquidTokens } from './parsers/liquid-parser';
export { parseJSTokens } from './parsers/js-parser';

// Orchestrator (Task 1)
export { TokenExtractor } from './token-extractor';

// Inference engine (Task 2)
export {
  inferTokens,
  groupSimilarValues,
  detectScalePattern,
  suggestTokenName,
} from './inference';

// Data model (Task 3)
export {
  createToken,
  getToken,
  updateToken,
  deleteToken,
  listByProject,
  listByCategory,
  findByName,
  createUsage,
  listUsagesByToken,
  listUsagesByFile,
  deleteUsagesByToken,
  createVersion,
  getLatestVersion,
  getVersionById,
  listVersions,
} from './models/token-model';
export type {
  DesignTokenRow,
  DesignTokenUsageRow,
  DesignComponentRow,
  DesignSystemVersionRow,
  CreateTokenInput,
  UpdateTokenInput,
  CreateUsageInput,
  CreateVersionInput,
} from './models/token-model';

// Token application engine (Task 5)
export { TokenApplicator } from './application/token-applicator';
export { validateCSS, validateLiquid, validateByFileType } from './application/syntax-validator';
export type {
  TokenChange,
  ImpactAnalysis,
  FileImpact,
  DeploymentResult,
  ValidationResult,
} from './application/types';

// Agent integration (Task 7)
export { DesignSystemContextProvider, DesignCodeValidator } from './agent-integration';
export type { ValidationReport, ValidationIssue } from './agent-integration';

// Drift detection & tokenisation suggestions (Task 6)
export { DriftDetector } from './drift/drift-detector';
export { generateSuggestions, parseColor } from './drift/suggestion-generator';
export type { StoredTokenSummary } from './drift/suggestion-generator';
export type {
  DriftResult,
  DriftItem,
  TokenizationSuggestion,
} from './drift/types';

// Component detection & theme ingestion
export { detectComponents } from './components/component-detector';
export type { DetectedComponent } from './components/component-detector';
export { ingestTheme } from './components/theme-ingestion';
export type { IngestionResult } from './components/theme-ingestion';
