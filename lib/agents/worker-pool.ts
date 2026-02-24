/**
 * Parallel worker pool for AI agent sub-tasks.
 *
 * Allows the PM to spawn up to 4 concurrent research workers that can
 * search files, run diagnostics, and analyze code in parallel.
 *
 * Workers are lightweight: they use BaseAgent.executeSingle() with a
 * scoped system prompt and get read-only tool access.
 */

import type { AgentContext, AgentTask, FileContext } from '@/lib/types/agent';
import type { ToolExecutorContext } from './tools/tool-executor';
import type { UnifiedDiagnostic } from './tools/diagnostics-tool';

// ── Types ─────────────────────────────────────────────────────────────────

export interface WorkerTask {
  id: string;
  type: 'research' | 'implement' | 'validate';
  instruction: string;
  /** Optional file names to scope the worker's context. */
  files?: string[];
  /** Optional tool names this worker is allowed to use. */
  tools?: string[];
}

export interface WorkerResult {
  id: string;
  success: boolean;
  content: string;
  filesAccessed?: string[];
  diagnostics?: UnifiedDiagnostic[];
  tokenUsage?: { input: number; output: number };
  elapsedMs?: number;
}

export interface WorkerProgressEvent {
  type: 'worker_progress';
  workerId: string;
  label: string;
  status: 'running' | 'complete' | 'error';
}

// ── Concurrency Semaphore ─────────────────────────────────────────────────

class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>(resolve => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }
}

// ── Worker Pool ───────────────────────────────────────────────────────────

const WORKER_TIMEOUT_MS = 60_000; // 60s per worker
const READ_ONLY_TOOLS = new Set([
  'read_file', 'search_files', 'list_files', 'get_dependency_graph',
  'grep_content', 'glob_files', 'semantic_search', 'run_diagnostics',
  'validate_syntax', 'fetch_url', 'web_search',
  // Preview DOM read tools (Phase 3)
  'inspect_element', 'get_page_snapshot', 'query_selector', 'read_console_logs',
  // Shopify read tools (Phase 4)
  'list_themes', 'list_store_resources', 'get_shopify_asset',
  // Validation tools (Phase 6)
  'theme_check', 'generate_placeholder',
]);

export class WorkerPool {
  private maxConcurrency: number;

  constructor(maxConcurrency = 4) {
    this.maxConcurrency = Math.min(maxConcurrency, 4); // Hard cap at 4
  }

  /**
   * Execute multiple worker tasks concurrently, respecting the concurrency limit.
   * Each worker runs independently — if one fails, others continue.
   */
  async execute(
    tasks: WorkerTask[],
    context: AgentContext,
    toolContext: ToolExecutorContext,
    onProgress?: (event: WorkerProgressEvent) => void,
  ): Promise<WorkerResult[]> {
    const semaphore = new Semaphore(this.maxConcurrency);
    const results: WorkerResult[] = [];

    const workerPromises = tasks.map(async (task, index) => {
      await semaphore.acquire();
      const workerId = task.id || `worker-${index}`;
      const startTime = Date.now();

      onProgress?.({
        type: 'worker_progress',
        workerId,
        label: task.instruction.slice(0, 80),
        status: 'running',
      });

      try {
        const result = await this.executeWorker(task, context, toolContext, workerId);
        results.push(result);

        onProgress?.({
          type: 'worker_progress',
          workerId,
          label: task.instruction.slice(0, 80),
          status: 'complete',
        });
      } catch (err) {
        results.push({
          id: workerId,
          success: false,
          content: `Worker error: ${err instanceof Error ? err.message : String(err)}`,
          elapsedMs: Date.now() - startTime,
        });

        onProgress?.({
          type: 'worker_progress',
          workerId,
          label: task.instruction.slice(0, 80),
          status: 'error',
        });
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(workerPromises);
    return results;
  }

  /**
   * Execute a single worker task with timeout.
   */
  private async executeWorker(
    task: WorkerTask,
    context: AgentContext,
    toolContext: ToolExecutorContext,
    workerId: string,
  ): Promise<WorkerResult> {
    const startTime = Date.now();

    // Scope files if specified
    let scopedFiles = context.files;
    if (task.files && task.files.length > 0) {
      const fileNames = new Set(task.files.map(f => f.toLowerCase()));
      scopedFiles = context.files.filter(f =>
        fileNames.has(f.fileName.toLowerCase()) ||
        fileNames.has((f.path ?? f.fileName).toLowerCase())
      );
      // Fall back to all files if no matches found
      if (scopedFiles.length === 0) scopedFiles = context.files;
    }

    // Build a minimal system prompt for the worker
    const fileList = scopedFiles
      .slice(0, 30)
      .map(f => `- ${f.path ?? f.fileName} (${f.fileType})`)
      .join('\n');

    const systemPrompt = `You are a research worker in a Shopify theme IDE. Your task is to investigate and report findings.

Available files:
${fileList}${scopedFiles.length > 30 ? `\n... and ${scopedFiles.length - 30} more files` : ''}

Instructions:
- Be concise and factual
- Report specific file names, line numbers, and code snippets
- If you can't find what you're looking for, say so clearly`;

    // Use dynamic import to access provider without circular dependency
    const { getAIProvider } = await import('@/lib/ai/get-provider');
    const { resolveModel, getProviderForModel, MODELS } = await import('./model-router');

    const model = resolveModel({ action: 'explain' }); // Workers use efficient model
    const providerName = getProviderForModel(model);
    const provider = getAIProvider(providerName as 'anthropic' | 'openai' | 'google');

    // Race between completion and timeout
    const completionPromise = provider.complete(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task.instruction },
      ],
      { model, maxTokens: 2048, temperature: 0.3 },
    );

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Worker ${workerId} timed out after ${WORKER_TIMEOUT_MS}ms`)), WORKER_TIMEOUT_MS)
    );

    const result = await Promise.race([completionPromise, timeoutPromise]);

    return {
      id: workerId,
      success: true,
      content: result.content,
      tokenUsage: {
        input: result.inputTokens ?? 0,
        output: result.outputTokens ?? 0,
      },
      elapsedMs: Date.now() - startTime,
    };
  }

  /**
   * Format worker results into a summary string for the PM.
   */
  static formatResults(results: WorkerResult[]): string {
    return results.map(r => {
      const status = r.success ? 'SUCCESS' : 'FAILED';
      const time = r.elapsedMs ? ` (${(r.elapsedMs / 1000).toFixed(1)}s)` : '';
      return `--- Worker ${r.id} [${status}]${time} ---\n${r.content}`;
    }).join('\n\n');
  }
}
