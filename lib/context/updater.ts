/**
 * Context updater for file change handling and cache invalidation - REQ-5 TASK-5
 */

import { ProjectContextLoader } from './loader';
import { DependencyDetector } from './detector';
import { ContextCache } from './cache';
import type { ProjectContext } from './types';

export type FileChangeType = 'create' | 'update' | 'delete' | 'rename';

export class ContextUpdater {
  private loader: ProjectContextLoader;
  private detector: DependencyDetector;
  private cache: ContextCache;

  constructor() {
    this.loader = new ProjectContextLoader();
    this.detector = new DependencyDetector();
    this.cache = new ContextCache();
  }

  /**
   * Handle a file change event by invalidating the project cache.
   * The next call to loadProjectContext will rebuild fresh context.
   */
  async handleFileChange(
    projectId: string,
    changeType: FileChangeType,
    fileId?: string
  ): Promise<void> {
    this.cache.invalidate(projectId);
    console.log(
      `[ContextUpdater] File change: ${changeType}${fileId ? ` (file: ${fileId})` : ''} — cache invalidated for project ${projectId}`
    );
  }

  /**
   * Load the project context, using the cache when available.
   * On a cache miss, loads fresh context via the loader, detects
   * dependencies, caches the result, and returns it.
   */
  async loadProjectContext(projectId: string): Promise<ProjectContext> {
    const cached = this.cache.get(projectId);
    if (cached) {
      return cached;
    }

    const context = await this.loader.loadProjectContext(projectId);
    context.dependencies = this.detector.detectDependencies(context.files);
    this.cache.set(projectId, context);
    return context;
  }

  /**
   * Force-refresh the context for a project that has active executions.
   * Invalidates the cache and reloads from source.
   */
  async refreshActiveExecutions(projectId: string): Promise<void> {
    this.cache.invalidate(projectId);
    await this.loadProjectContext(projectId);
  }
}
