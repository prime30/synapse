/**
 * Cross-file context awareness - REQ-5
 * Re-exports all context modules for convenient access.
 */
export { ProjectContextLoader } from './loader';
export { DependencyDetector } from './detector';
export { SymbolExtractor } from './symbol-extractor';
export { ClaudeContextPackager, CodexContextPackager } from './packager';
export type { ProposedChange } from './packager';
export { ContextCache } from './cache';
export { ContextUpdater } from './updater';
export type { FileChangeType } from './updater';
export { AgentContextProvider } from './provider';
export type {
  ProjectContext,
  FileContext,
  FileDependency,
  DependencyReference,
} from './types';
