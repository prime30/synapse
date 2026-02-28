import type { ToolCall, ToolResult } from '@/lib/ai/types';
import type { FileContext, AgentContext } from '@/lib/types/agent';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ContextEngine } from '@/lib/ai/context-engine';
import { checkLiquid, checkCSS, checkJavaScript } from '@/lib/agents/validation/syntax-checker';
import { createModuleLogger } from '@/lib/observability/logger';
import { isSectionFile, contentMarkupOnly, contentSchemaOnly } from '@/lib/liquid/schema-stripper';
import type { LoadContentFn } from '@/lib/supabase/file-loader';
import { executeGrep, executeGlob, executeSemanticSearch } from './search-tools';
import { extractTargetRegion } from './region-extractor';
import { runDiagnostics, formatDiagnostics } from './diagnostics-tool';
import { WorkerPool } from '../worker-pool';
import type { WorkerTask, WorkerProgressEvent } from '../worker-pool';
import { urlToMarkdown, type ConversionMethod } from '@/lib/ai/url-to-markdown';
import { webSearch } from '@/lib/ai/web-search';
import { callPreviewAPI, formatPreviewResult } from './preview-tools';
import { getShopifyAPI, formatThemeList } from './shopify-tools';
import { runThemeCheck, formatThemeCheckResult, generatePlaceholderSVG } from './theme-check';
import { executeScratchpadWrite, executeScratchpadRead } from './scratchpad-tool';
import { recordHistogram } from '@/lib/observability/metrics';
import { prettifyFile } from './prettify';
import { FileStore } from './file-store';
import { TOOL_THRESHOLDS } from './constants';
import { executeShellCommand } from './shell-tool';
import { readNetworkRequests } from './network-inspect-tool';
import { executeImageGen } from './image-gen-tool';
import {
  traceRenderingChain,
  formatRenderingChainResult,
  checkThemeSetting,
  formatSettingCheckResult,
  diagnoseVisibility,
  formatVisibilityDiagnosis,
} from './shopify-diagnostic-tools';

const toolLogger = createModuleLogger('tool-executor');

export interface ToolExecutorContext {
  files: FileContext[];
  contextEngine: ContextEngine;
  /** Project ID — needed by semantic_search, file mutations, Shopify tools, and preview tools. */
  projectId: string;
  /** User ID — needed for Shopify API factory credential resolution. */
  userId: string;
  /** Hydrate files with real content on demand — needed by grep_content. */
  loadContent?: LoadContentFn;
  /** Full agent context — needed by spawn_workers for worker execution. */
  agentContext?: AgentContext;
  /** Progress callback — needed by spawn_workers for worker progress events. */
  onProgress?: (event: WorkerProgressEvent) => void;
  /** Supabase service client — needed by file mutation tools (write, delete, rename). */
  supabaseClient?: SupabaseClient;
  /** Shopify connection ID — needed by Shopify operation tools (push, pull, etc.). */
  shopifyConnectionId?: string;
  /** Shopify theme ID — needed by Shopify operation tools. */
  themeId?: string;
  /** Session ID — needed by scratchpad tools for per-session memory. */
  sessionId?: string;
  /** Project directory for shell commands (defaults to process.cwd()). */
  projectDir?: string;
  /** Callback when a file is changed via direct DB write (search_replace, write_file). */
  onFileChanged?: (change: { fileId: string; fileName: string; originalContent: string; proposedContent: string; reasoning: string }) => void;
  /** Unified file store for consistent read/write/resolve. */
  fileStore?: FileStore;
  /** Revert history: maps fileId → originalContent from before the most recent edit. */
  revertHistory?: Map<string, string>;
}

type DbFileRow = {
  id: string;
  name: string;
  path: string | null;
  file_type: string;
  content: string | null;
};

// ── Symbol extraction for get_dependency_graph enrichment ─────────────────

/**
 * Extract exported/declared symbols from a file based on its type.
 * Returns a formatted multi-line section, or '' if nothing notable found.
 */
function extractFileSymbols(fileName: string, content: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const lines: string[] = [];

  if (ext === 'liquid') {
    // Extract schema block → title, settings, blocks
    const schemaMatch = content.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/i);
    if (schemaMatch) {
      try {
        const schema = JSON.parse(schemaMatch[1]) as {
          name?: string;
          settings?: Array<{ id?: string; type?: string; label?: string }>;
          blocks?: Array<{ type?: string; name?: string }>;
        };
        if (schema.name) lines.push(`Schema: "${schema.name}"`);
        if (Array.isArray(schema.settings) && schema.settings.length > 0) {
          const settingSummaries = schema.settings
            .filter(s => s.id)
            .map(s => `${s.id} (${s.type ?? '?'})`)
            .slice(0, 12);
          lines.push(`Settings: ${settingSummaries.join(', ')}`);
        }
        if (Array.isArray(schema.blocks) && schema.blocks.length > 0) {
          const blockTypes = schema.blocks.map(b => b.type ?? b.name ?? '?').slice(0, 8);
          lines.push(`Block types: ${blockTypes.join(', ')}`);
        }
      } catch (e) {
        toolLogger.warn({ err: e, fileName }, 'Malformed schema JSON in file summary');
      }
    }
    // Extract {% block %} names
    const blockNames: string[] = [];
    const blockRe = /\{%-?\s*block\s+['"]?([\w-]+)['"]?/gi;
    let bm: RegExpExecArray | null;
    while ((bm = blockRe.exec(content)) !== null) blockNames.push(bm[1]);
    if (blockNames.length > 0) lines.push(`Liquid blocks: ${[...new Set(blockNames)].join(', ')}`);

    // Extract {% render %} calls (immediate children)
    const renderNames: string[] = [];
    const renderRe = /\{%-?\s*render\s+['"]?([\w/-]+)['"]?/gi;
    let rm: RegExpExecArray | null;
    while ((rm = renderRe.exec(content)) !== null) renderNames.push(rm[1]);
    if (renderNames.length > 0) lines.push(`Renders: ${[...new Set(renderNames)].slice(0, 8).join(', ')}`);

  } else if (ext === 'js' || ext === 'ts' || ext === 'jsx' || ext === 'tsx') {
    // Extract exported names
    const exportedSymbols: string[] = [];
    const exportRe =
      /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([\w$]+)/gm;
    let em: RegExpExecArray | null;
    while ((em = exportRe.exec(content)) !== null) exportedSymbols.push(em[1]);
    // named re-exports: export { foo, bar }
    const reExportRe = /^export\s*\{([^}]+)\}/gm;
    let rem: RegExpExecArray | null;
    while ((rem = reExportRe.exec(content)) !== null) {
      rem[1].split(',').forEach(s => {
        const name = s.trim().split(/\s+as\s+/).pop()?.trim();
        if (name) exportedSymbols.push(name);
      });
    }
    if (exportedSymbols.length > 0) {
      lines.push(`Exports: ${[...new Set(exportedSymbols)].slice(0, 16).join(', ')}`);
    }
    // Top-level function/class declarations (non-exported)
    const declRe = /^(?:async\s+)?function\s+([\w$]+)|^class\s+([\w$]+)/gm;
    const decls: string[] = [];
    let dm: RegExpExecArray | null;
    while ((dm = declRe.exec(content)) !== null) decls.push(dm[1] ?? dm[2]);
    const nonExported = decls.filter(d => !exportedSymbols.includes(d));
    if (nonExported.length > 0) lines.push(`Declarations: ${nonExported.slice(0, 8).join(', ')}`);

  } else if (ext === 'css' || ext === 'scss' || ext === 'less') {
    // Extract top-level selectors and CSS custom properties
    const selectors: string[] = [];
    const selectorRe = /^([.#][\w-]+(?:[\s,>+~[\]:\w-]*)?)\s*\{/gm;
    let sm: RegExpExecArray | null;
    while ((sm = selectorRe.exec(content)) !== null) {
      selectors.push(sm[1].trim());
    }
    if (selectors.length > 0) {
      lines.push(`Selectors: ${[...new Set(selectors)].slice(0, 12).join(', ')}`);
    }
    // CSS custom properties defined in :root
    const varRe = /--[\w-]+(?=\s*:)/g;
    const cssVars = [...new Set(content.match(varRe) ?? [])].slice(0, 12);
    if (cssVars.length > 0) lines.push(`CSS vars: ${cssVars.join(', ')}`);

  } else if (ext === 'json' && fileName.includes('templates/')) {
    // Template JSON: list section types used
    try {
      const data = JSON.parse(content) as { sections?: Record<string, { type?: string }> };
      const sectionTypes = Object.values(data.sections ?? {})
        .map(s => s?.type)
        .filter(Boolean) as string[];
      if (sectionTypes.length > 0) lines.push(`Template sections: ${sectionTypes.join(', ')}`);
    } catch (e) {
      toolLogger.warn({ err: e, fileName }, 'Malformed template JSON in file summary');
    }
  }

  return lines.length > 0 ? `Symbols:\n  ${lines.join('\n  ')}` : '';
}

function toFileContext(data: DbFileRow): FileContext {
  return {
    fileId: data.id,
    fileName: data.path ?? data.name,
    path: data.path ?? data.name,
    fileType: (data.file_type as FileContext['fileType']) ?? 'other',
    content: data.content!,
  };
}

async function resolveFileFromDatabase(
  fileId: string,
  ctx: ToolExecutorContext,
): Promise<FileContext | null> {
  if (!ctx.supabaseClient || !ctx.projectId || !fileId) return null;

  const t0 = Date.now();

  // If fileId contains PostgREST filter metacharacters (not a UUID), use path-only lookup
  if (/[,().]/.test(fileId) && !/^[0-9a-f-]{36}$/i.test(fileId)) {
    const { data } = await ctx.supabaseClient
      .from('files')
      .select('id,name,path,file_type,content')
      .eq('project_id', ctx.projectId)
      .eq('path', fileId)
      .maybeSingle<DbFileRow>();
    recordHistogram('agent.resolve_file_db_ms', Date.now() - t0).catch(() => {});
    if (data && typeof data.content === 'string') return toFileContext(data);
    return null;
  }

  const baseName = fileId.split('/').pop() ?? fileId;
  const { data } = await ctx.supabaseClient
    .from('files')
    .select('id,name,path,file_type,content')
    .eq('project_id', ctx.projectId)
    .or(`id.eq.${fileId},path.eq.${fileId},name.eq.${baseName}`)
    .limit(1)
    .maybeSingle<DbFileRow>();

  recordHistogram('agent.resolve_file_db_ms', Date.now() - t0).catch(() => {});
  if (!data || typeof data.content !== 'string') return null;
  return toFileContext(data);
}

function resolveFileContext(files: FileContext[], ref: string): FileContext | undefined {
  if (!ref) return undefined;
  const baseRef = ref.split('/').pop() ?? ref;
  return files.find((f) => {
    const name = f.fileName ?? '';
    const path = f.path ?? '';
    const baseName = name.split('/').pop() ?? name;
    const basePath = path.split('/').pop() ?? path;
    return (
      f.fileId === ref ||
      name === ref ||
      path === ref ||
      name.endsWith(`/${ref}`) ||
      path.endsWith(`/${ref}`) ||
      baseName === baseRef ||
      basePath === baseRef
    );
  });
}

/**
 * Execute a tool call and return the result.
 * Each tool has access to the project files and context engine.
 *
 * Some tools (grep_content, semantic_search) are async — the caller must
 * await the returned Promise when necessary.
 */
function getFileStore(ctx: ToolExecutorContext): FileStore {
  if (ctx.fileStore) return ctx.fileStore;
  return new FileStore(
    ctx.files,
    ctx.loadContent,
    ctx.supabaseClient,
    ctx.projectId,
    ctx.onFileChanged,
  );
}

const LINT_TIMEOUT_MS = 5_000;
const LINTABLE_EXTENSIONS = new Set(['liquid', 'css', 'scss']);

async function runQuickLint(fileName: string, content: string): Promise<string> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (!LINTABLE_EXTENSIONS.has(ext)) return '';

  try {
    const result = await Promise.race([
      (async () => {
        let errors: { line: number; message: string; severity: string }[] = [];
        if (ext === 'liquid') errors = checkLiquid(content);
        else if (ext === 'css' || ext === 'scss') errors = checkCSS(content);
        if (errors.length === 0) return '\n\nLint: clean';
        const formatted = errors.map(e => `  Line ${e.line}: [${e.severity}] ${e.message}`).join('\n');
        return `\n\nLint: ${errors.length} issue(s):\n${formatted}`;
      })(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('lint timeout')), LINT_TIMEOUT_MS)),
    ]);
    return result;
  } catch {
    return '';
  }
}

export async function executeToolCall(
  toolCall: ToolCall,
  ctx: ToolExecutorContext,
): Promise<ToolResult> {
  const { files, contextEngine } = ctx;

  try {
    switch (toolCall.name) {
      case 'read_file': {
        const fileId = String(toolCall.input.fileId ?? '');
        const store = getFileStore(ctx);
        const result = await store.read(fileId);
        if (!result) {
          return { tool_use_id: toolCall.id, content: `File not found: ${fileId}`, is_error: true };
        }

        let content = result.content;
        const view = String(toolCall.input.view ?? 'full');
        const filePath = result.file.fileName || result.file.path || '';
        if (view !== 'full' && isSectionFile(filePath)) {
          if (view === 'markup') {
            content = contentMarkupOnly(content);
          } else if (view === 'schema') {
            content = contentSchemaOnly(content);
          }
        }

        return { tool_use_id: toolCall.id, content };
      }

      case 'search_files': {
        const query = String(toolCall.input.query ?? '');
        const maxResults = Number(toolCall.input.maxResults ?? 5);
        const matches = contextEngine.fuzzyMatch(query, maxResults);
        if (matches.length === 0) {
          return { tool_use_id: toolCall.id, content: 'No matching files found.' };
        }
        const results = matches.map(m => {
          const f = files.find(ff => ff.fileId === m.fileId);
          const excerpt = f?.content.slice(0, 200) ?? '';
          return `${m.fileName} (${m.fileType}, ~${m.tokenEstimate} tokens)\n  ${excerpt}...`;
        }).join('\n\n');
        return { tool_use_id: toolCall.id, content: results };
      }

      case 'validate_syntax': {
        const content = String(toolCall.input.content ?? '');
        const fileType = String(toolCall.input.fileType ?? '');
        let errors: { line: number; message: string; severity: string }[] = [];
        if (fileType === 'liquid') errors = checkLiquid(content);
        else if (fileType === 'css') errors = checkCSS(content);
        else if (fileType === 'javascript') errors = checkJavaScript(content);
        else return { tool_use_id: toolCall.id, content: `Unsupported file type: ${fileType}`, is_error: true };

        if (errors.length === 0) return { tool_use_id: toolCall.id, content: 'No syntax errors found.' };
        const formatted = errors.map(e => `Line ${e.line}: [${e.severity}] ${e.message}`).join('\n');
        return { tool_use_id: toolCall.id, content: `${errors.length} issue(s) found:\n${formatted}` };
      }

      case 'list_files': {
        const index = contextEngine.getFileIndex();
        const manifest = index.map(m =>
          `${m.fileName} (${m.fileType}, ~${m.tokenEstimate} tokens, ${m.references.length} refs)`
        ).join('\n');
        return { tool_use_id: toolCall.id, content: manifest || 'No files indexed.' };
      }

      case 'get_dependency_graph': {
        const fileId = String(toolCall.input.fileId ?? '');
        const index = contextEngine.getFileIndex();
        const depFile = index.find(m =>
          m.fileId === fileId ||
          m.fileName === fileId ||
          m.fileName.endsWith(`/${fileId}`)
        );
        if (!depFile) {
          return { tool_use_id: toolCall.id, content: `File not found: ${fileId}`, is_error: true };
        }

        const outgoing = depFile.references.join(', ') || 'none';
        const fileName = depFile.fileName;
        const incoming = index
          .filter(m => m.references.some(r => fileName.includes(r) || r.includes(fileName)))
          .map(m => m.fileName);
        const incomingStr = incoming.length > 0 ? incoming.join(', ') : 'none';

        // Enrich with symbol/section data from file content
        let symbolSection = '';
        const depFileCtx = files.find(f => f.fileId === depFile.fileId);
        let depContent = depFileCtx?.content ?? '';
        if (depContent.startsWith('[') && ctx.loadContent) {
          const hydrated = await ctx.loadContent([depFile.fileId]);
          depContent = hydrated[0]?.content ?? depContent;
        }
        if (depContent && !depContent.startsWith('[')) {
          symbolSection = extractFileSymbols(depFile.fileName, depContent);
        }

        const lines = [
          `File: ${depFile.fileName}`,
          `Type: ${depFile.fileType}`,
          `References (outgoing): ${outgoing}`,
          `Referenced by (incoming): ${incomingStr}`,
        ];
        if (symbolSection) lines.push(symbolSection);

        return { tool_use_id: toolCall.id, content: lines.join('\n') };
      }

      case 'extract_region': {
        const regionFileId = String(toolCall.input.fileId ?? '');
        const hint = String(toolCall.input.hint ?? '').trim();
        const contextLines = toolCall.input.contextLines ? Number(toolCall.input.contextLines) : 4;

        if (!hint) {
          return { tool_use_id: toolCall.id, content: 'hint is required.', is_error: true };
        }

        const store = getFileStore(ctx);
        const regionResult = await store.read(regionFileId);
        if (!regionResult) {
          return { tool_use_id: toolCall.id, content: `File not found or content unavailable: ${regionFileId}`, is_error: true };
        }
        const regionFile = regionResult.file;
        const regionContent = regionResult.content;

        const match = extractTargetRegion(regionContent, hint, contextLines);

        if (match.matchType === 'none') {
          return {
            tool_use_id: toolCall.id,
            content: `No region matching "${hint}" found in ${regionFile.fileName}. Try grep_content with a broader pattern.`,
          };
        }

        return {
          tool_use_id: toolCall.id,
          content: [
            `File: ${regionFile.fileName}`,
            `Match type: ${match.matchType}`,
            `Lines: ${match.startLine}–${match.endLine}`,
            ``,
            match.snippet,
          ].join('\n'),
        };
      }

      // ── Search tools (Phase 1) ──────────────────────────────────────

      case 'grep_content': {
        const grepResult = await executeGrep(
          {
            pattern: String(toolCall.input.pattern ?? ''),
            filePattern: toolCall.input.filePattern ? String(toolCall.input.filePattern) : undefined,
            caseSensitive: Boolean(toolCall.input.caseSensitive),
            maxResults: toolCall.input.maxResults ? Number(toolCall.input.maxResults) : undefined,
          },
          ctx,
        );
        return { ...grepResult, tool_use_id: toolCall.id };
      }

      case 'glob_files': {
        const globResult = executeGlob(
          { pattern: String(toolCall.input.pattern ?? '') },
          ctx,
        );
        return { ...globResult, tool_use_id: toolCall.id };
      }

      case 'semantic_search': {
        // async — returns a Promise<ToolResult>
        return executeSemanticSearch(
          {
            query: String(toolCall.input.query ?? ''),
            limit: toolCall.input.limit ? Number(toolCall.input.limit) : undefined,
          },
          ctx,
        ).then(result => ({ ...result, tool_use_id: toolCall.id }));
      }

      // ── Check lint tool (PM exploration phase) ──────────────────────

      case 'check_lint': {
        const lintFileName = String(toolCall.input.fileName ?? '');
        const lintContent = toolCall.input.content ? String(toolCall.input.content) : undefined;

        const lintFile = resolveFileContext(files, lintFileName);
        if (!lintFile && !lintContent) {
          return { tool_use_id: toolCall.id, content: `File not found: ${lintFileName}`, is_error: true };
        }

        let contentToLint = lintContent;
        if (!contentToLint && lintFile) {
          if (lintFile.content.startsWith('[') && ctx.loadContent) {
            const hydrated = await ctx.loadContent([lintFile.fileId]);
            contentToLint = hydrated[0]?.content;
          } else {
            contentToLint = lintFile.content;
          }
        }
        if (!contentToLint || contentToLint.startsWith('[')) {
          return { tool_use_id: toolCall.id, content: `Cannot load content for ${lintFileName}`, is_error: true };
        }

        const ext = lintFileName.split('.').pop()?.toLowerCase() ?? '';
        let lintErrors: { line: number; message: string; severity: string }[] = [];
        if (ext === 'liquid') lintErrors = checkLiquid(contentToLint);
        else if (ext === 'css' || ext === 'scss') lintErrors = checkCSS(contentToLint);
        else if (ext === 'js' || ext === 'ts') lintErrors = checkJavaScript(contentToLint);
        else {
          return { tool_use_id: toolCall.id, content: `Syntax valid (no checker for .${ext} files)` };
        }

        if (lintErrors.length === 0) {
          return { tool_use_id: toolCall.id, content: 'Syntax valid — no issues found.' };
        }
        const lintFormatted = lintErrors.map(e => `Line ${e.line}: [${e.severity}] ${e.message}`).join('\n');
        return { tool_use_id: toolCall.id, content: `${lintErrors.length} issue(s) found:\n${lintFormatted}` };
      }

      // ── Diagnostics tool (Phase 2) ──────────────────────────────────

      case 'run_diagnostics': {
        const diagFileName = String(toolCall.input.fileName ?? '');
        const diagContent = toolCall.input.content ? String(toolCall.input.content) : undefined;

        // Find the file for metadata (type detection)
        const diagFile = resolveFileContext(files, diagFileName);
        if (!diagFile && !diagContent) {
          return { tool_use_id: toolCall.id, content: `File not found: ${diagFileName}`, is_error: true };
        }

        // Determine content: explicit > hydrated > stub
        let contentToCheck = diagContent;
        if (!contentToCheck && diagFile) {
          if (diagFile.content.startsWith('[') && ctx.loadContent) {
            const hydrated = await ctx.loadContent([diagFile.fileId]);
            contentToCheck = hydrated[0]?.content;
          } else {
            contentToCheck = diagFile.content;
          }
        }
        if (!contentToCheck || contentToCheck.startsWith('[')) {
          return { tool_use_id: toolCall.id, content: `Cannot load content for ${diagFileName}`, is_error: true };
        }

        const fileType = diagFile?.fileType ?? 'other';
        const diagnostics = runDiagnostics(diagFileName, contentToCheck, fileType);

        if (diagnostics.length === 0) {
          return { tool_use_id: toolCall.id, content: 'No diagnostics found. Code looks clean.' };
        }

        return { tool_use_id: toolCall.id, content: formatDiagnostics(diagnostics) };
      }

      // ── Worker pool tool (Phase 3) ────────────────────────────────────

      case 'spawn_workers': {
        const rawTasks = toolCall.input.tasks;
        if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
          return { tool_use_id: toolCall.id, content: 'At least one task is required.', is_error: true };
        }
        if (rawTasks.length > 4) {
          return { tool_use_id: toolCall.id, content: 'Maximum 4 workers allowed.', is_error: true };
        }
        if (!ctx.agentContext) {
          return { tool_use_id: toolCall.id, content: 'Worker pool requires agentContext in ToolExecutorContext.', is_error: true };
        }

        const workerTasks: WorkerTask[] = rawTasks.map((t: Record<string, unknown>, i: number) => ({
          id: `worker-${i}`,
          type: 'research' as const,
          instruction: String(t.instruction ?? ''),
          files: Array.isArray(t.files) ? t.files.map(String) : undefined,
        }));

        const pool = new WorkerPool(4);
        // async — returns a Promise<ToolResult>
        return pool.execute(workerTasks, ctx.agentContext, ctx, ctx.onProgress)
          .then(results => ({
            tool_use_id: toolCall.id,
            content: WorkerPool.formatResults(results),
          }))
          .catch(err => ({
            tool_use_id: toolCall.id,
            content: `Worker pool error: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true as const,
          }));
      }

      // ── URL fetch tool ────────────────────────────────────────────────

      case 'fetch_url': {
        const url = String(toolCall.input.url ?? '');
        if (!url) {
          return { tool_use_id: toolCall.id, content: 'URL is required.', is_error: true };
        }
        const method = (toolCall.input.method as ConversionMethod) || 'auto';

        // async — returns a Promise<ToolResult>
        return urlToMarkdown(url, { method })
          .then(result => {
            const header = `**Source:** ${result.sourceUrl}\n**Tokens:** ~${result.estimatedTokens >= 0 ? result.estimatedTokens : 'unknown'}${result.truncated ? ' (truncated)' : ''}\n\n---\n\n`;
            return {
              tool_use_id: toolCall.id,
              content: header + result.markdown,
            };
          })
          .catch(err => ({
            tool_use_id: toolCall.id,
            content: `Failed to fetch URL: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true as const,
          }));
      }

      // ── Search & replace tool (targeted edits) ─────────────────────

      case 'search_replace': {
        const filePath = String(toolCall.input.filePath ?? '');
        const oldText = String(toolCall.input.old_text ?? '');
        const newText = String(toolCall.input.new_text ?? '');

        if (!filePath || !oldText) {
          return { tool_use_id: toolCall.id, content: 'filePath and old_text are required.', is_error: true };
        }
        if (oldText === newText) {
          return { tool_use_id: toolCall.id, content: 'old_text and new_text are identical — no change needed.', is_error: true };
        }

        const store = getFileStore(ctx);
        const srResult = await store.read(filePath);
        if (!srResult) {
          return { tool_use_id: toolCall.id, content: `File not found: ${filePath}`, is_error: true };
        }
        const file = srResult.file;
        const currentContent = srResult.content;

        // Large file guard: redirect to edit_lines
        const srLineCount = currentContent.split('\n').length;
        if (srLineCount > TOOL_THRESHOLDS.SEARCH_REPLACE_HARD_BLOCK_LINES) {
          return {
            tool_use_id: toolCall.id,
            content: `File is too large for search_replace (${srLineCount} lines). Use read_lines to see the exact line numbers, then edit_lines to make changes.`,
            is_error: true,
          };
        }

        // nearLine hint: if provided, scope matching to +/-20 lines around the hint
        const nearLine = toolCall.input.nearLine ? Number(toolCall.input.nearLine) : 0;
        const replaceAll = !!(toolCall.input.replaceAll);

        let searchContent = currentContent;
        let searchOffset = 0;
        if (nearLine > 0) {
          const contentLines = currentContent.split('\n');
          const rangeStart = Math.max(0, nearLine - 21);
          const rangeEnd = Math.min(contentLines.length, nearLine + 20);
          searchOffset = contentLines.slice(0, rangeStart).join('\n').length + (rangeStart > 0 ? 1 : 0);
          searchContent = contentLines.slice(rangeStart, rangeEnd).join('\n');
        }

        // 9-tier matching cascade (ported from OpenCode)
        try {
          const { replace: cascadeReplace } = await import('./replacer');
          const result = cascadeReplace(searchContent, oldText, newText, replaceAll);

          // Reconstruct full content if nearLine scoped the search
          let rawUpdated: string;
          if (searchOffset > 0) {
            rawUpdated = currentContent.slice(0, searchOffset) + result.content + currentContent.slice(searchOffset + searchContent.length);
          } else {
            rawUpdated = result.content;
          }

          const writeResult = await store.write(file, rawUpdated, (toolCall.input.reasoning as string) ?? 'search_replace');
          if (writeResult.error) {
            return { tool_use_id: toolCall.id, content: writeResult.error, is_error: true as const };
          }

          const sizeBytes = new TextEncoder().encode(file.content).length;
          const matchNote = result.replacerUsed !== 'Simple'
            ? ` (matched via ${result.replacerUsed})`
            : '';
          const countNote = result.matchCount > 1
            ? ` ${result.matchCount} replacements`
            : ' 1 replacement';
          const lintSuffix = await runQuickLint(file.fileName, rawUpdated);
          return { tool_use_id: toolCall.id, content: `File updated: ${file.fileName} (${sizeBytes} bytes,${countNote}).${matchNote}${lintSuffix}` };
        } catch (err) {
          const hint = nearLine > 0 ? ` (searched near line ${nearLine})` : '';
          const msg = err instanceof Error ? err.message : String(err);
          return { tool_use_id: toolCall.id, content: `${msg}${hint ? ' ' + hint : ''}`, is_error: true };
        }
      }

      // ── Line-range editing tools ──────────────────────────────────────

      case 'edit_lines': {
        const filePath = String(toolCall.input.filePath ?? '');
        const startLine = Number(toolCall.input.startLine ?? 0);
        const endLine = Number(toolCall.input.endLine ?? 0);
        const newContent = String(toolCall.input.newContent ?? '');
        const mode = String(toolCall.input.mode ?? 'replace');

        if (!filePath) return { tool_use_id: toolCall.id, content: 'filePath is required.', is_error: true };
        if (startLine < 1 || endLine < 1) return { tool_use_id: toolCall.id, content: 'startLine and endLine must be >= 1.', is_error: true };
        if (startLine > endLine && mode === 'replace') return { tool_use_id: toolCall.id, content: 'startLine must be <= endLine for replace mode.', is_error: true };

        const store = getFileStore(ctx);
        const editResult = await store.read(filePath);
        if (!editResult) return { tool_use_id: toolCall.id, content: `File not found or content unavailable: ${filePath}`, is_error: true };

        const { file, content: currentContent } = editResult;
        const lines = currentContent.split('\n');
        if (startLine > lines.length) return { tool_use_id: toolCall.id, content: `startLine ${startLine} exceeds file length (${lines.length} lines).`, is_error: true };
        if (endLine > lines.length && mode === 'replace') return { tool_use_id: toolCall.id, content: `endLine ${endLine} exceeds file length (${lines.length} lines).`, is_error: true };

        const newLines = newContent.split('\n');
        let updatedLines: string[];

        if (mode === 'insert_before') {
          updatedLines = [...lines.slice(0, startLine - 1), ...newLines, ...lines.slice(startLine - 1)];
        } else if (mode === 'insert_after') {
          updatedLines = [...lines.slice(0, endLine), ...newLines, ...lines.slice(endLine)];
        } else {
          const removedCount = endLine - startLine + 1;
          if (removedCount > lines.length * 0.5) {
            return { tool_use_id: toolCall.id, content: `edit_lines rejected: removing ${removedCount} of ${lines.length} lines (>50%).`, is_error: true };
          }
          updatedLines = [...lines.slice(0, startLine - 1), ...newLines, ...lines.slice(endLine)];
        }

        const rawEditContent = updatedLines.join('\n');
        const writeResult = await store.write(file, rawEditContent, (toolCall.input.reasoning as string) ?? `edit_lines ${startLine}-${endLine}`);
        if (writeResult.error) return { tool_use_id: toolCall.id, content: writeResult.error, is_error: true as const };

        // Shift ThemeMap line ranges in memory for this file
        import('@/lib/agents/theme-map').then(({ shiftLineRanges }) => {
          shiftLineRanges(
            ctx.projectId,
            file.path ?? file.fileName,
            startLine,
            endLine,
            newLines.length,
            mode as 'replace' | 'insert_before' | 'insert_after',
          );
        }).catch((e) => { toolLogger.warn({ err: e, filePath }, 'Theme map shiftLineRanges failed'); });

        const modeLabel = mode === 'insert_before' ? 'inserted before' : mode === 'insert_after' ? 'inserted after' : 'replaced';
        const lintSuffix = await runQuickLint(file.fileName, rawEditContent);
        return { tool_use_id: toolCall.id, content: `Lines ${startLine}-${endLine} ${modeLabel} in ${file.fileName} (${updatedLines.length} total lines).${lintSuffix}` };
      }

      case 'read_lines': {
        const filePath = String(toolCall.input.filePath ?? '');
        const ranges = Array.isArray(toolCall.input.ranges) ? toolCall.input.ranges as Array<{ startLine: number; endLine: number }> : [];
        const contextLines = Number(toolCall.input.contextLines ?? 2);

        if (!filePath) return { tool_use_id: toolCall.id, content: 'filePath is required.', is_error: true };
        if (ranges.length === 0) return { tool_use_id: toolCall.id, content: 'At least one range is required.', is_error: true };

        const store = getFileStore(ctx);
        const readResult = await store.read(filePath);
        if (!readResult) return { tool_use_id: toolCall.id, content: `File not found or content unavailable: ${filePath}`, is_error: true };

        const { file, content } = readResult;
        const lines = content.split('\n');
        const sections: string[] = [];

        for (const range of ranges) {
          const start = Math.max(1, (range.startLine ?? 1) - contextLines);
          const end = Math.min(lines.length, (range.endLine ?? range.startLine) + contextLines);
          const regionLines = lines.slice(start - 1, end);
          const numbered = regionLines.map((l, i) => `${String(start + i).padStart(5)}| ${l}`).join('\n');
          sections.push(`--- ${file.fileName} lines ${start}-${end} ---\n${numbered}`);
        }

        return { tool_use_id: toolCall.id, content: sections.join('\n\n') };
      }

      // ── Full file rewrite tool ────────────────────────────────────────

      case 'propose_code_edit': {
        const filePath = String(toolCall.input.filePath ?? '');
        let newContent = String(toolCall.input.newContent ?? '');
        const reasoning = String(toolCall.input.reasoning ?? '');

        if (!filePath) {
          return { tool_use_id: toolCall.id, content: 'filePath is required.', is_error: true };
        }

        const store = getFileStore(ctx);
        const pceResult = await store.read(filePath);
        if (!pceResult) {
          return { tool_use_id: toolCall.id, content: `File not found: ${filePath}`, is_error: true };
        }
        const { file, content: originalContent } = pceResult;

        if (newContent && /keep existing code/i.test(newContent)) {
          const { expandKeepExisting } = await import('./keep-existing-expander');
          newContent = expandKeepExisting(newContent, originalContent);
        }

        if (!newContent || newContent.trim().length === 0) {
          return { tool_use_id: toolCall.id, content: `propose_code_edit rejected: proposed content is empty. Use edit_lines for targeted changes.`, is_error: true };
        }

        const fileLineCount = originalContent.split('\n').length;
        if (fileLineCount > TOOL_THRESHOLDS.PROPOSE_CODE_EDIT_BLOCK_LINES) {
          return { tool_use_id: toolCall.id, content: `propose_code_edit rejected: file has ${fileLineCount} lines (>${TOOL_THRESHOLDS.PROPOSE_CODE_EDIT_BLOCK_LINES}). Use read_lines + edit_lines for targeted changes.`, is_error: true };
        }

        const origLen = originalContent.length;
        const newLen = newContent.length;
        if (origLen > 200 && newLen < origLen * 0.5) {
          return { tool_use_id: toolCall.id, content: `propose_code_edit rejected: removes ${Math.round((1 - newLen / origLen) * 100)}% of content. Use edit_lines for targeted changes.`, is_error: true };
        }

        if (newContent === originalContent) {
          return { tool_use_id: toolCall.id, content: `No change: file already contains the proposed content.` };
        }

        const writeResult = await store.write(file, newContent, reasoning || 'propose_code_edit');
        if (writeResult.error) {
          return { tool_use_id: toolCall.id, content: writeResult.error, is_error: true as const };
        }
        const lineCount = newContent.split('\n').length;
        return { tool_use_id: toolCall.id, content: `Full rewrite applied to ${file.fileName} (${lineCount} lines).` };
      }

      // ── File mutation tools (Agent Power Tools Phase 1) ──────────────

      case 'write_file': {
        const fileName = String(toolCall.input.fileName ?? '');
        const content = String(toolCall.input.content ?? '');

        // Reject empty content writes — this destroys files
        if (!content || content.trim().length === 0) {
          return { tool_use_id: toolCall.id, content: `write_file rejected: content is empty. This would erase the file. Use search_replace for targeted edits instead of write_file.`, is_error: true };
        }

        // Validate path
        if (fileName.includes('..') || fileName.startsWith('/') || fileName.includes(':')) {
          return { tool_use_id: toolCall.id, content: `Invalid file path: ${fileName}`, is_error: true };
        }
        // Size check (1MB)
        if (new TextEncoder().encode(content).length > 1_048_576) {
          return { tool_use_id: toolCall.id, content: 'File content exceeds 1MB limit.', is_error: true };
        }

        const store = getFileStore(ctx);
        const existingResult = await store.read(fileName);
        if (!existingResult) {
          return { tool_use_id: toolCall.id, content: `File not found: ${fileName}`, is_error: true };
        }
        const { file, content: existingContent } = existingResult;

        const existingLen = existingContent.length;
        const newLen = content.length;
        if (existingLen > 200 && newLen < existingLen * 0.5) {
          return { tool_use_id: toolCall.id, content: `write_file rejected: new content (${newLen} chars) is ${Math.round((1 - newLen / existingLen) * 100)}% smaller than existing (${existingLen} chars). Use edit_lines for targeted edits.`, is_error: true };
        }

        const writeResult = await store.write(file, content, (toolCall.input.reasoning as string) ?? 'write_file');
        if (writeResult.error) {
          return { tool_use_id: toolCall.id, content: writeResult.error, is_error: true as const };
        }
        const sizeBytes = new TextEncoder().encode(file.content).length;
        return { tool_use_id: toolCall.id, content: `File updated: ${file.fileName} (${sizeBytes} bytes)` };
      }

      case 'delete_file': {
        const fileName = String(toolCall.input.fileName ?? '');

        if (fileName.includes('..') || fileName.startsWith('/') || fileName.includes(':')) {
          return { tool_use_id: toolCall.id, content: `Invalid file path: ${fileName}`, is_error: true };
        }

        const file = resolveFileContext(files, fileName);
        if (!file) {
          return { tool_use_id: toolCall.id, content: `File not found: ${fileName}`, is_error: true };
        }

        if (!ctx.supabaseClient) {
          return { tool_use_id: toolCall.id, content: 'Database client not available for file deletion.', is_error: true };
        }

        return (async () => {
          try {
            const { error } = await ctx.supabaseClient!
              .from('files')
              .delete()
              .eq('id', file.fileId);
            if (error) {
              return { tool_use_id: toolCall.id, content: `Delete failed: ${error.message}`, is_error: true as const };
            }
            const store = getFileStore(ctx);
            await store.invalidateFile(file.fileId);
            return { tool_use_id: toolCall.id, content: `File deleted: ${file.fileName}` };
          } catch (err) {
            return { tool_use_id: toolCall.id, content: `Delete failed: ${err instanceof Error ? err.message : String(err)}`, is_error: true as const };
          }
        })();
      }

      case 'rename_file': {
        const fileName = String(toolCall.input.fileName ?? '');
        const newFileName = String(toolCall.input.newFileName ?? '');

        if (fileName.includes('..') || newFileName.includes('..') || newFileName.startsWith('/') || newFileName.includes(':')) {
          return { tool_use_id: toolCall.id, content: `Invalid file path.`, is_error: true };
        }
        if (!newFileName) {
          return { tool_use_id: toolCall.id, content: 'New file name is required.', is_error: true };
        }

        const file = resolveFileContext(files, fileName);
        if (!file) {
          return { tool_use_id: toolCall.id, content: `File not found: ${fileName}`, is_error: true };
        }

        if (!ctx.supabaseClient) {
          return { tool_use_id: toolCall.id, content: 'Database client not available for file rename.', is_error: true };
        }

        return (async () => {
          try {
            const newName = newFileName.split('/').pop() || newFileName;
            const newPath = newFileName.startsWith('/') ? newFileName : '/' + newFileName;
            const { error } = await ctx.supabaseClient!
              .from('files')
              .update({ name: newName, path: newPath, updated_at: new Date().toISOString() })
              .eq('id', file.fileId);
            if (error) {
              return { tool_use_id: toolCall.id, content: `Rename failed: ${error.message}`, is_error: true as const };
            }
            const store = getFileStore(ctx);
            await store.invalidateRename(file.fileId, newPath);
            return { tool_use_id: toolCall.id, content: `File renamed: ${file.fileName} → ${newFileName}` };
          } catch (err) {
            return { tool_use_id: toolCall.id, content: `Rename failed: ${err instanceof Error ? err.message : String(err)}`, is_error: true as const };
          }
        })();
      }

      // ── Undo/revert tool ──────────────────────────────────────────────────

      case 'undo_edit': {
        const filePath = String(toolCall.input.filePath ?? '');
        if (!filePath) {
          return { tool_use_id: toolCall.id, content: 'filePath is required.', is_error: true };
        }

        const store = getFileStore(ctx);
        const file = store.resolve(filePath);
        if (!file) {
          return { tool_use_id: toolCall.id, content: `File not found: ${filePath}`, is_error: true };
        }

        const originalContent = ctx.revertHistory?.get(file.fileId);
        if (!originalContent) {
          return { tool_use_id: toolCall.id, content: `No edit history for ${filePath} in this session. Nothing to revert.`, is_error: true };
        }

        const writeResult = await store.write(file, originalContent, (toolCall.input.reasoning as string) ?? `undo_edit: revert ${filePath}`);
        if (writeResult.error) {
          return { tool_use_id: toolCall.id, content: writeResult.error, is_error: true as const };
        }

        ctx.revertHistory?.delete(file.fileId);
        const lineCount = originalContent.split('\n').length;
        return { tool_use_id: toolCall.id, content: `Reverted ${file.fileName} to pre-edit state (${lineCount} lines).` };
      }

      // ── Variant analysis tool ────────────────────────────────────────────

      case 'analyze_variants': {
        const filePath = String(toolCall.input.filePath ?? '');
        if (!filePath) return { tool_use_id: toolCall.id, content: 'filePath is required.', is_error: true };

        const store = getFileStore(ctx);
        const readResult = await store.read(filePath);
        if (!readResult) return { tool_use_id: toolCall.id, content: `File not found: ${filePath}`, is_error: true };

        const { content } = readResult;
        const analysis: string[] = ['## Variant Analysis'];

        // Extract option names from product.options or option_name patterns
        const optionNames: string[] = [];
        const optionRe = /product\.options\[(\d+)\]|option(\d+)|option_name\s*==\s*['"]([^'"]+)['"]/gi;
        let om: RegExpExecArray | null;
        while ((om = optionRe.exec(content)) !== null) {
          const name = om[3] ?? `Option ${Number(om[1] ?? om[2]) + 1}`;
          if (!optionNames.includes(name)) optionNames.push(name);
        }
        // Also check for explicit option names in assign statements
        const assignRe = /assign\s+(\w*option\w*)\s*=\s*['"]([^'"]+)['"]/gi;
        let am: RegExpExecArray | null;
        while ((am = assignRe.exec(content)) !== null) {
          if (!optionNames.includes(am[2])) optionNames.push(am[2]);
        }
        analysis.push(`**Options found:** ${optionNames.length > 0 ? optionNames.join(', ') : 'None detected'}`);

        // Detect swatch patterns
        const swatchPatterns: string[] = [];
        if (/swatch/i.test(content)) swatchPatterns.push('swatch rendering');
        if (/color_swatch|color-swatch/i.test(content)) swatchPatterns.push('color swatches');
        if (/variant\.option\d/i.test(content)) swatchPatterns.push('variant option access');
        if (/available.*variant|variant.*available/i.test(content)) swatchPatterns.push('availability checking');
        if (/restock|out.of.stock|sold.out/i.test(content)) swatchPatterns.push('restock/sold-out logic');
        analysis.push(`**Patterns:** ${swatchPatterns.length > 0 ? swatchPatterns.join(', ') : 'None detected'}`);

        // Find variant iteration loops
        const forLoops: string[] = [];
        const forRe = /\{%-?\s*for\s+(\w+)\s+in\s+([\w.]+)/g;
        let fm: RegExpExecArray | null;
        while ((fm = forRe.exec(content)) !== null) {
          if (/variant|option|swatch|color/i.test(fm[1]) || /variant|option|swatch|color/i.test(fm[2])) {
            const lineNum = content.slice(0, fm.index).split('\n').length;
            forLoops.push(`Line ${lineNum}: for ${fm[1]} in ${fm[2]}`);
          }
        }
        analysis.push(`**Variant loops:** ${forLoops.length > 0 ? '\n  ' + forLoops.join('\n  ') : 'None detected'}`);

        // Find availability conditionals
        const availChecks: string[] = [];
        const availRe = /\{%-?\s*(?:if|unless)\s+.*(?:available|sold_out|inventory)/gi;
        let avm: RegExpExecArray | null;
        while ((avm = availRe.exec(content)) !== null) {
          const lineNum = content.slice(0, avm.index).split('\n').length;
          availChecks.push(`Line ${lineNum}: ${avm[0].trim().slice(0, 80)}`);
        }
        if (availChecks.length > 0) {
          analysis.push(`**Availability checks:** \n  ${availChecks.slice(0, 10).join('\n  ')}`);
        }

        // Find JS variant handling
        const jsVariantPatterns: string[] = [];
        if (/variantId|variant_id|currentVariant/i.test(content)) jsVariantPatterns.push('variant ID tracking');
        if (/optionChange|option.*change|handleOption/i.test(content)) jsVariantPatterns.push('option change handler');
        if (/updatePrice|price.*update/i.test(content)) jsVariantPatterns.push('price update logic');
        if (jsVariantPatterns.length > 0) {
          analysis.push(`**JS variant handling:** ${jsVariantPatterns.join(', ')}`);
        }

        return { tool_use_id: toolCall.id, content: analysis.join('\n') };
      }

      // ── Performance analysis tool ─────────────────────────────────────────

      case 'check_performance': {
        const filePath = toolCall.input.filePath ? String(toolCall.input.filePath) : undefined;
        const targetFiles = filePath
          ? files.filter(f => f.fileName === filePath || f.path === filePath || f.fileName?.endsWith(`/${filePath}`))
          : files.filter(f => !f.content.startsWith('['));

        if (targetFiles.length === 0) {
          return { tool_use_id: toolCall.id, content: filePath ? `File not found: ${filePath}` : 'No files available for analysis.', is_error: true };
        }

        const issues: string[] = [];

        for (const f of targetFiles.slice(0, 20)) {
          const c = f.content;
          if (c.startsWith('[')) continue;
          const name = f.fileName;

          // Images without width/height params
          if (/\|\s*img_url/i.test(c)) {
            issues.push(`${name}: Uses deprecated | img_url — switch to | image_url: width: N`);
          }
          const imgUrlNoWidth = (c.match(/\|\s*image_url\b(?!.*width)/g) ?? []).length;
          if (imgUrlNoWidth > 0) {
            issues.push(`${name}: ${imgUrlNoWidth} image_url call(s) without width param — specify width for responsive loading`);
          }

          // Missing lazy loading
          if (/<img\b(?![^>]*loading=)/gi.test(c) && !/hero|banner|above.fold/i.test(name)) {
            issues.push(`${name}: <img> tags without loading="lazy" — add lazy loading for below-fold images`);
          }

          // Unbounded for loops
          const unboundedLoops = c.match(/\{%-?\s*for\s+\w+\s+in\s+[\w.]+\s*-?%\}(?![\s\S]*?limit:)/g);
          if (unboundedLoops && unboundedLoops.length > 0) {
            issues.push(`${name}: ${unboundedLoops.length} for loop(s) without limit — add limit: N to prevent unbounded iteration`);
          }

          // Render-blocking scripts
          if (/<script\b(?![^>]*(?:defer|async|type=['"]module))/gi.test(c)) {
            issues.push(`${name}: Render-blocking <script> tags — add defer or async`);
          }

          // Large inline styles
          const styleBlocks = c.match(/<style[^>]*>[\s\S]*?<\/style>/gi) ?? [];
          const inlineStyleChars = styleBlocks.reduce((sum, s) => sum + s.length, 0);
          if (inlineStyleChars > 5000) {
            issues.push(`${name}: ${Math.round(inlineStyleChars / 1000)}K chars of inline <style> — consider moving to external CSS`);
          }

          // fetchpriority missing on likely LCP images
          if (/hero|banner|main.*image|featured/i.test(name) && /<img\b/i.test(c) && !/fetchpriority/i.test(c)) {
            issues.push(`${name}: Likely LCP image without fetchpriority="high"`);
          }
        }

        if (issues.length === 0) {
          return { tool_use_id: toolCall.id, content: `No performance issues detected${filePath ? ` in ${filePath}` : ''}.` };
        }

        return {
          tool_use_id: toolCall.id,
          content: `## Performance Analysis\n\n${issues.length} issue(s) found:\n\n${issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}`,
        };
      }

      // ── Task outcome retrieval tool ───────────────────────────────────────

      case 'retrieve_similar_tasks': {
        const query = String(toolCall.input.query ?? '');
        const maxResults = Number(toolCall.input.maxResults ?? 3);
        if (!query) return { tool_use_id: toolCall.id, content: 'query is required.', is_error: true };
        if (!ctx.supabaseClient) return { tool_use_id: toolCall.id, content: 'Database not available.', is_error: true };

        try {
          const { retrieveSimilarOutcomes, formatOutcomesForPrompt } = await import('@/lib/agents/memory/task-outcomes');
          const outcomes = await retrieveSimilarOutcomes(ctx.supabaseClient, ctx.projectId, query, maxResults);
          if (outcomes.length === 0) {
            return { tool_use_id: toolCall.id, content: 'No similar past task outcomes found for this project.' };
          }
          return { tool_use_id: toolCall.id, content: formatOutcomesForPrompt(outcomes) };
        } catch (err) {
          return { tool_use_id: toolCall.id, content: `Failed to retrieve task outcomes: ${err instanceof Error ? err.message : String(err)}`, is_error: true };
        }
      }

      // ── Web search tool (Agent Power Tools Phase 2) ──────────────────────

      // ── Scratchpad tools (Track C) ───────────────────────────────────────

      case 'update_scratchpad': {
        const content = String(toolCall.input.content ?? '');
        const sessionId = ctx.sessionId ?? ctx.projectId ?? 'default';
        const result = executeScratchpadWrite(sessionId, content);
        return {
          tool_use_id: toolCall.id,
          content: result.success ? 'Scratchpad updated.' : 'Scratchpad update failed.',
        };
      }

      case 'read_scratchpad': {
        const sessionId = ctx.sessionId ?? ctx.projectId ?? 'default';
        const result = executeScratchpadRead(sessionId);
        return { tool_use_id: toolCall.id, content: result.content };
      }

      // ── Shell tool (Track C) ────────────────────────────────────────────

      case 'run_command': {
        const command = String(toolCall.input.command ?? '');
        if (!command.trim()) {
          return { tool_use_id: toolCall.id, content: 'Command is required.', is_error: true };
        }
        const projectDir = ctx.projectDir ?? process.cwd();
        return executeShellCommand(command, projectDir).then((result) => {
          const out = result.stdout ? `stdout:\n${result.stdout}` : '';
          const err = result.stderr ? `stderr:\n${result.stderr}` : '';
          const exit = `exitCode: ${result.exitCode}`;
          return {
            tool_use_id: toolCall.id,
            content: [out, err, exit].filter(Boolean).join('\n'),
            is_error: result.exitCode !== 0,
          };
        });
      }

      // ── Network inspector (Track C) ──────────────────────────────────────

      case 'read_network_requests': {
        if (!ctx.projectId) {
          return { tool_use_id: toolCall.id, content: 'Project ID is required for preview tools.', is_error: true };
        }
        const search = String(toolCall.input?.search ?? '');
        return readNetworkRequests(ctx.projectId, search || undefined).then(({ requests }) => {
          if (requests.length === 0) {
            return { tool_use_id: toolCall.id, content: 'No network requests found.' };
          }
          const formatted = requests
            .map(
              (r) =>
                `${r.method} ${r.url} → ${r.status} (${r.duration}ms)${r.error ? ` — ${r.error}` : ''}`,
            )
            .join('\n');
          return { tool_use_id: toolCall.id, content: `${requests.length} request(s):\n${formatted}` };
        });
      }

      // ── Image generation (Track C) ────────────────────────────────────────

      case 'generate_image': {
        const prompt = String(toolCall.input.prompt ?? '');
        const targetPath = String(toolCall.input.targetPath ?? '');
        if (!prompt || !targetPath) {
          return { tool_use_id: toolCall.id, content: 'prompt and targetPath are required.', is_error: true };
        }
        return executeImageGen({
          prompt,
          targetPath,
          width: toolCall.input.width ? Number(toolCall.input.width) : undefined,
          height: toolCall.input.height ? Number(toolCall.input.height) : undefined,
        }).then((result) => ({
          tool_use_id: toolCall.id,
          content: result.message,
          is_error: !result.success,
        }));
      }

      // ── Web search tool (Agent Power Tools Phase 2) ──────────────────────

      case 'web_search': {
        const query = String(toolCall.input.query ?? '');
        if (!query) {
          return { tool_use_id: toolCall.id, content: 'Search query is required.', is_error: true };
        }
        const site = toolCall.input.site ? String(toolCall.input.site) : undefined;
        const searchQuery = site ? `site:${site} ${query}` : query;
        const maxResults = Math.min(Number(toolCall.input.maxResults ?? 5), 5);

        // async — returns a Promise<ToolResult>
        return webSearch(searchQuery, maxResults)
          .then(result => {
            if (result.results.length === 0) {
              return {
                tool_use_id: toolCall.id,
                content: `No results found for: "${query}". Try using fetch_url on a known documentation URL instead.`,
              };
            }
            const formatted = result.results.map((r, i) =>
              `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`
            ).join('\n\n');
            const header = result.cached ? '(cached) ' : '';
            return {
              tool_use_id: toolCall.id,
              content: `${header}${result.results.length} result(s) for "${query}":\n\n${formatted}`,
            };
          })
          .catch(err => ({
            tool_use_id: toolCall.id,
            content: `Search failed: ${err instanceof Error ? err.message : String(err)}. Try using fetch_url on a known documentation URL instead.`,
            is_error: true as const,
          }));
      }

      // ── Preview DOM tools (Phase 3) ──────────────────────────────────

      case 'inspect_element': {
        const selector = String(toolCall.input.selector ?? '');
        if (!selector) {
          return { tool_use_id: toolCall.id, content: 'CSS selector is required.', is_error: true };
        }
        if (!ctx.projectId) {
          return { tool_use_id: toolCall.id, content: 'Project ID is required for preview tools.', is_error: true };
        }
        return callPreviewAPI(ctx.projectId, 'inspect', { selector })
          .then(result => {
            if (!result.success) {
              return { tool_use_id: toolCall.id, content: result.error || 'Preview not available.', is_error: true as const };
            }
            return { tool_use_id: toolCall.id, content: formatPreviewResult(result.data) };
          })
          .catch(err => ({
            tool_use_id: toolCall.id,
            content: `Inspect failed: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true as const,
          }));
      }

      case 'get_page_snapshot': {
        if (!ctx.projectId) {
          return { tool_use_id: toolCall.id, content: 'Project ID is required for preview tools.', is_error: true };
        }
        return callPreviewAPI(ctx.projectId, 'snapshot')
          .then(result => {
            if (!result.success) {
              return { tool_use_id: toolCall.id, content: result.error || 'Preview not available.', is_error: true as const };
            }
            return { tool_use_id: toolCall.id, content: formatPreviewResult(result.data, 14_000) };
          })
          .catch(err => ({
            tool_use_id: toolCall.id,
            content: `Snapshot failed: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true as const,
          }));
      }

      case 'query_selector': {
        const selector = String(toolCall.input.selector ?? '');
        if (!selector) {
          return { tool_use_id: toolCall.id, content: 'CSS selector is required.', is_error: true };
        }
        if (!ctx.projectId) {
          return { tool_use_id: toolCall.id, content: 'Project ID is required for preview tools.', is_error: true };
        }
        return callPreviewAPI(ctx.projectId, 'querySelector', { selector })
          .then(result => {
            if (!result.success) {
              return { tool_use_id: toolCall.id, content: result.error || 'Preview not available.', is_error: true as const };
            }
            return { tool_use_id: toolCall.id, content: formatPreviewResult(result.data) };
          })
          .catch(err => ({
            tool_use_id: toolCall.id,
            content: `Query failed: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true as const,
          }));
      }

      case 'inject_css': {
        const css = String(toolCall.input.css ?? '');
        if (!css) {
          return { tool_use_id: toolCall.id, content: 'CSS content is required.', is_error: true };
        }
        if (!ctx.projectId) {
          return { tool_use_id: toolCall.id, content: 'Project ID is required for preview tools.', is_error: true };
        }
        return callPreviewAPI(ctx.projectId, 'injectCSS', { css })
          .then(result => {
            if (!result.success) {
              return { tool_use_id: toolCall.id, content: result.error || 'CSS injection failed.', is_error: true as const };
            }
            return { tool_use_id: toolCall.id, content: `CSS injected successfully (${css.length} chars)` };
          })
          .catch(err => ({
            tool_use_id: toolCall.id,
            content: `CSS injection failed: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true as const,
          }));
      }

      case 'read_console_logs': {
        if (!ctx.projectId) {
          return { tool_use_id: toolCall.id, content: 'Project ID is required for preview tools.', is_error: true };
        }
        const search = String(toolCall.input?.search ?? '');
        const result = await callPreviewAPI(ctx.projectId, 'getConsoleLogs', { search });
        if (!result.success) {
          return { tool_use_id: toolCall.id, content: 'Preview not available — console logs cannot be read.' };
        }
        const logs = (result.data as { logs?: Array<{ level: string; message: string; ts: number }> })?.logs ?? [];
        if (logs.length === 0) {
          return { tool_use_id: toolCall.id, content: 'No console errors or warnings found.' };
        }
        const formatted = logs.map((l) => `[${l.level}] ${l.message}`).join('\n');
        return { tool_use_id: toolCall.id, content: `${logs.length} console log(s):\n${formatted}` };
      }

      case 'inject_html': {
        const selector = String(toolCall.input.selector ?? '');
        const html = String(toolCall.input.html ?? '');
        const position = String(toolCall.input.position ?? 'replace');
        if (!selector || !html) {
          return { tool_use_id: toolCall.id, content: 'Selector and HTML content are required.', is_error: true };
        }
        if (!ctx.projectId) {
          return { tool_use_id: toolCall.id, content: 'Project ID is required for preview tools.', is_error: true };
        }
        return callPreviewAPI(ctx.projectId, 'injectHTML', { selector, html, position })
          .then(result => {
            if (!result.success) {
              return { tool_use_id: toolCall.id, content: result.error || 'HTML injection failed.', is_error: true as const };
            }
            return { tool_use_id: toolCall.id, content: `HTML injected into "${selector}" (${position}, ${html.length} chars)` };
          })
          .catch(err => ({
            tool_use_id: toolCall.id,
            content: `HTML injection failed: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true as const,
          }));
      }

      // ── Visual regression tools (Agent Power Tools Phase 5) ────────

      case 'screenshot_preview': {
        if (!ctx.projectId || !ctx.userId) {
          return { tool_use_id: toolCall.id, content: 'Project ID and User ID are required for screenshots.', is_error: true };
        }
        return (async () => {
          try {
            // Resolve Shopify store domain from the connection
            const connectionId = ctx.shopifyConnectionId;
            const themeId = ctx.themeId;
            if (!connectionId || !themeId) {
              return { tool_use_id: toolCall.id, content: 'Shopify connection and theme ID are required for screenshots.', is_error: true as const };
            }

            const { createClient: createServiceClient } = await import('@supabase/supabase-js');
            const supabase = createServiceClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
            );

            const { data: connection } = await supabase
              .from('shopify_connections')
              .select('store_domain')
              .eq('id', connectionId)
              .single();

            if (!connection?.store_domain) {
              return { tool_use_id: toolCall.id, content: 'Store connection not found or missing domain.', is_error: true as const };
            }

            const storeDomain = connection.store_domain as string;
            const { generateThumbnail, uploadThumbnail } = await import('@/lib/thumbnail/generator');
            const buffer = await generateThumbnail(storeDomain, themeId);
            if (!buffer) {
              return { tool_use_id: toolCall.id, content: 'Screenshot capture failed. Puppeteer may not be available in this environment.', is_error: true as const };
            }

            const storagePath = await uploadThumbnail(ctx.projectId, buffer);
            return {
              tool_use_id: toolCall.id,
              content: `Screenshot captured and stored at: ${storagePath}\nStore: ${storeDomain}\nTheme: ${themeId}`,
            };
          } catch (err) {
            return {
              tool_use_id: toolCall.id,
              content: `Screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
              is_error: true as const,
            };
          }
        })();
      }

      case 'compare_screenshots': {
        const beforeUrl = String(toolCall.input.beforeUrl ?? '');
        const afterUrl = String(toolCall.input.afterUrl ?? '');
        if (!beforeUrl || !afterUrl) {
          return { tool_use_id: toolCall.id, content: 'Both beforeUrl and afterUrl are required.', is_error: true };
        }
        const threshold = Number(toolCall.input.threshold ?? 2.0);

        return (async () => {
          try {
            const sharp = (await import('sharp')).default;

            // Fetch both images
            const [beforeResp, afterResp] = await Promise.all([
              fetch(beforeUrl),
              fetch(afterUrl),
            ]);
            if (!beforeResp.ok) throw new Error(`Failed to fetch before image: ${beforeResp.status}`);
            if (!afterResp.ok) throw new Error(`Failed to fetch after image: ${afterResp.status}`);

            const beforeBuf = Buffer.from(await beforeResp.arrayBuffer());
            const afterBuf = Buffer.from(await afterResp.arrayBuffer());

            // Normalise both to the same dimensions (use before as reference)
            const beforeMeta = await sharp(beforeBuf).metadata();
            const width = beforeMeta.width ?? 1280;
            const height = beforeMeta.height ?? 800;

            const beforeRaw = await sharp(beforeBuf)
              .resize(width, height, { fit: 'fill' })
              .raw()
              .toBuffer();
            const afterRaw = await sharp(afterBuf)
              .resize(width, height, { fit: 'fill' })
              .raw()
              .toBuffer();

            // Pixel-by-pixel comparison (3 channels: R, G, B)
            const totalPixels = width * height;
            let diffPixels = 0;
            const diffData = Buffer.alloc(beforeRaw.length);

            for (let i = 0; i < beforeRaw.length; i += 3) {
              const dr = Math.abs(beforeRaw[i] - afterRaw[i]);
              const dg = Math.abs(beforeRaw[i + 1] - afterRaw[i + 1]);
              const db = Math.abs(beforeRaw[i + 2] - afterRaw[i + 2]);
              const delta = (dr + dg + db) / 3;

              if (delta > 10) {
                diffPixels++;
                // Highlight differences in red
                diffData[i] = 255;
                diffData[i + 1] = 0;
                diffData[i + 2] = 0;
              } else {
                // Dim unchanged pixels
                diffData[i] = Math.floor(beforeRaw[i] * 0.3);
                diffData[i + 1] = Math.floor(beforeRaw[i + 1] * 0.3);
                diffData[i + 2] = Math.floor(beforeRaw[i + 2] * 0.3);
              }
            }

            const diffPercentage = (diffPixels / totalPixels) * 100;
            const passed = diffPercentage <= threshold;

            // Generate diff image as PNG
            const diffPng = await sharp(diffData, {
              raw: { width, height, channels: 3 },
            })
              .png()
              .toBuffer();

            // Upload diff image to Supabase Storage if available
            let diffUrl = '';
            if (ctx.supabaseClient) {
              const diffPath = `screenshots/${ctx.projectId}/diff-${Date.now()}.png`;
              const { error: uploadErr } = await ctx.supabaseClient.storage
                .from('project-assets')
                .upload(diffPath, diffPng, { contentType: 'image/png', upsert: true });
              if (!uploadErr) {
                const { data: urlData } = ctx.supabaseClient.storage
                  .from('project-assets')
                  .getPublicUrl(diffPath);
                diffUrl = urlData.publicUrl;
              }
            }

            const resultJson = JSON.stringify({
              diffPercentage: Math.round(diffPercentage * 100) / 100,
              threshold,
              passed,
              diffPixels,
              totalPixels,
              dimensions: { width, height },
              beforeUrl,
              afterUrl,
              diffUrl: diffUrl || undefined,
            });

            return {
              tool_use_id: toolCall.id,
              content: [
                `## Screenshot Comparison`,
                `Status: ${passed ? 'PASS' : 'FAIL'}`,
                `Diff: ${diffPercentage.toFixed(2)}% (${diffPixels.toLocaleString()} of ${totalPixels.toLocaleString()} pixels)`,
                `Threshold: ${threshold}%`,
                `Dimensions: ${width}x${height}`,
                diffUrl ? `Diff Image: ${diffUrl}` : '',
                ``,
                `\`\`\`json`,
                resultJson,
                `\`\`\``,
              ].filter(Boolean).join('\n'),
            };
          } catch (err) {
            return {
              tool_use_id: toolCall.id,
              content: `Comparison failed: ${err instanceof Error ? err.message : String(err)}`,
              is_error: true as const,
            };
          }
        })();
      }

      // ── Shopify operation tools (Phase 4) ────────────────────────────

      case 'push_to_shopify': {
        if (!ctx.projectId || !ctx.userId) {
          return { tool_use_id: toolCall.id, content: 'Project ID and User ID are required for Shopify operations.', is_error: true };
        }
        return (async () => {
          try {
            const pushApiResult = await getShopifyAPI(ctx.projectId, ctx.userId);
            if ('error' in pushApiResult) {
              return { tool_use_id: toolCall.id, content: pushApiResult.error, is_error: true as const };
            }
            const { schedulePushForProject } = await import('@/lib/shopify/push-queue');
            schedulePushForProject(ctx.projectId);
            return { tool_use_id: toolCall.id, content: 'Push to Shopify scheduled. Changes will sync to the dev theme shortly.' };
          } catch (err) {
            return { tool_use_id: toolCall.id, content: `Push failed: ${err instanceof Error ? err.message : String(err)}`, is_error: true as const };
          }
        })();
      }

      case 'pull_from_shopify': {
        if (!ctx.projectId || !ctx.userId) {
          return { tool_use_id: toolCall.id, content: 'Project ID and User ID are required for Shopify operations.', is_error: true };
        }
        return (async () => {
          try {
            const pullApiResult = await getShopifyAPI(ctx.projectId, ctx.userId);
            if ('error' in pullApiResult) {
              return { tool_use_id: toolCall.id, content: pullApiResult.error, is_error: true as const };
            }
            const themeId = toolCall.input.themeId ? Number(toolCall.input.themeId) : (ctx.themeId ? Number(ctx.themeId) : undefined);
            if (!themeId || isNaN(themeId)) {
              return { tool_use_id: toolCall.id, content: 'No theme ID available. Specify a themeId or ensure a dev theme is configured.', is_error: true as const };
            }
            const assets = await pullApiResult.api.listAssets(themeId);
            return {
              tool_use_id: toolCall.id,
              content: `Pulled ${assets.length} asset(s) from theme ${themeId}.`,
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('429') || msg.includes('rate')) {
              return { tool_use_id: toolCall.id, content: 'Shopify rate limited. Try again in a few seconds.', is_error: true as const };
            }
            return { tool_use_id: toolCall.id, content: `Pull failed: ${msg}`, is_error: true as const };
          }
        })();
      }

      case 'list_themes': {
        if (!ctx.projectId || !ctx.userId) {
          return { tool_use_id: toolCall.id, content: 'Project ID and User ID are required for Shopify operations.', is_error: true };
        }
        return (async () => {
          try {
            const themesApiResult = await getShopifyAPI(ctx.projectId, ctx.userId);
            if ('error' in themesApiResult) {
              return { tool_use_id: toolCall.id, content: themesApiResult.error, is_error: true as const };
            }
            const themes = await themesApiResult.api.listThemes();
            return { tool_use_id: toolCall.id, content: formatThemeList(themes) };
          } catch (err) {
            return { tool_use_id: toolCall.id, content: `Failed to list themes: ${err instanceof Error ? err.message : String(err)}`, is_error: true as const };
          }
        })();
      }

      case 'list_store_resources': {
        if (!ctx.projectId || !ctx.userId) {
          return { tool_use_id: toolCall.id, content: 'Project ID and User ID are required for Shopify operations.', is_error: true };
        }
        return (async () => {
          try {
            const resourcesApiResult = await getShopifyAPI(ctx.projectId, ctx.userId);
            if ('error' in resourcesApiResult) {
              return { tool_use_id: toolCall.id, content: resourcesApiResult.error, is_error: true as const };
            }
            const resourceType = String(toolCall.input.resourceType ?? 'all');
            const limit = Math.min(Number(toolCall.input.limit ?? 10), 25);
            const sections: string[] = [];

            if (resourceType === 'products' || resourceType === 'all') {
              try {
                const gqlResult = await resourcesApiResult.api.listProductsGraphQL(limit);
                const productLines = gqlResult.products.map((p) => {
                  const opts = p.options.map(o => `${o.name} (${o.values.length})`).join(', ');
                  const variantNote = p.totalVariants > 100 ? ' **HIGH-VARIANT**' : '';
                  return `- ${p.title} (ID: ${p.id}, ${p.totalVariants} variants, options: ${opts})${variantNote}`;
                });
                sections.push(`## Products (${gqlResult.products.length})\n${productLines.join('\n') || 'None'}`);
                if (gqlResult.pageInfo.hasNextPage) {
                  sections.push(`_More products available (cursor: ${gqlResult.pageInfo.endCursor})_`);
                }
              } catch {
                try {
                  const products = await resourcesApiResult.api.listProducts(limit);
                  sections.push(`## Products (${products.length})\n${products.map((p) => `- ${p.title} (ID: ${p.id})`).join('\n') || 'None'}`);
                } catch (e) { sections.push(`## Products\nFailed to load: ${e instanceof Error ? e.message : String(e)}`); }
              }
            }
            if (resourceType === 'collections' || resourceType === 'all') {
              try {
                const collections = await resourcesApiResult.api.listCollections(limit);
                sections.push(`## Collections (${collections.length})\n${collections.map((c) => `- ${c.title} (ID: ${c.id})`).join('\n') || 'None'}`);
              } catch (e) { sections.push(`## Collections\nFailed to load: ${e instanceof Error ? e.message : String(e)}`); }
            }
            if (resourceType === 'pages' || resourceType === 'all') {
              try {
                const pages = await resourcesApiResult.api.listPages(limit);
                sections.push(`## Pages (${pages.length})\n${pages.map((p) => `- ${p.title} (ID: ${p.id})`).join('\n') || 'None'}`);
              } catch (e) { sections.push(`## Pages\nFailed to load: ${e instanceof Error ? e.message : String(e)}`); }
            }

            return { tool_use_id: toolCall.id, content: sections.join('\n\n') || 'No resources found.' };
          } catch (err) {
            return { tool_use_id: toolCall.id, content: `Failed to list resources: ${err instanceof Error ? err.message : String(err)}`, is_error: true as const };
          }
        })();
      }

      case 'get_product': {
        const idOrHandle = String(toolCall.input.idOrHandle ?? '');
        if (!idOrHandle) {
          return { tool_use_id: toolCall.id, content: 'idOrHandle is required (product ID, GID, or handle).', is_error: true };
        }
        if (!ctx.projectId || !ctx.userId) {
          return { tool_use_id: toolCall.id, content: 'Project ID and User ID are required for Shopify operations.', is_error: true };
        }
        return (async () => {
          try {
            const apiResult = await getShopifyAPI(ctx.projectId, ctx.userId);
            if ('error' in apiResult) {
              return { tool_use_id: toolCall.id, content: apiResult.error, is_error: true as const };
            }
            const variantFirst = Math.min(Number(toolCall.input.variantFirst ?? 100), 250);
            const variantAfter = toolCall.input.variantAfter ? String(toolCall.input.variantAfter) : undefined;
            const product = await apiResult.api.getProductGraphQL(idOrHandle, variantFirst, variantAfter);

            const optionSummary = product.options
              .map(o => `- **${o.name}**: ${o.values.join(', ')} (${o.values.length} values)`)
              .join('\n');

            const variantLines = product.variants.edges.map(e => {
              const v = e.node;
              const opts = v.selectedOptions.map(o => `${o.name}=${o.value}`).join(', ');
              const avail = v.availableForSale ? '' : ' [UNAVAILABLE]';
              return `- ${v.title} | $${v.price} | SKU: ${v.sku || '—'} | ${opts}${avail}`;
            });

            const highVariantWarning = product.totalVariants > 100
              ? `\n\n**HIGH-VARIANT PRODUCT** (${product.totalVariants} variants). Theme must handle option cascading, ` +
                `availability matrix precomputation, and performant DOM updates. ` +
                `Avoid iterating all variants in Liquid for UI rendering — use JavaScript with precomputed JSON data.`
              : '';

            const pagination = product.variants.pageInfo.hasNextPage
              ? `\n\n_Showing ${product.variants.edges.length} of ${product.totalVariants} variants. ` +
                `Next page cursor: \`${product.variants.pageInfo.endCursor}\`_`
              : '';

            const output = [
              `## ${product.title}`,
              `**ID:** ${product.id} | **Handle:** ${product.handle} | **Status:** ${product.status}`,
              `**Total variants:** ${product.totalVariants} | **Options:** ${product.options.length}`,
              `**Images:** ${product.images.edges.length}`,
              highVariantWarning,
              `\n### Options\n${optionSummary}`,
              `\n### Variants (${product.variants.edges.length} shown)\n${variantLines.join('\n')}`,
              pagination,
            ].join('\n');

            return { tool_use_id: toolCall.id, content: output };
          } catch (err) {
            return { tool_use_id: toolCall.id, content: `Failed to fetch product: ${err instanceof Error ? err.message : String(err)}`, is_error: true as const };
          }
        })();
      }

      case 'get_shopify_asset': {
        const assetKey = String(toolCall.input.key ?? '');
        if (!assetKey) {
          return { tool_use_id: toolCall.id, content: 'Asset key is required.', is_error: true };
        }
        if (!ctx.projectId || !ctx.userId) {
          return { tool_use_id: toolCall.id, content: 'Project ID and User ID are required for Shopify operations.', is_error: true };
        }
        return (async () => {
          try {
            const assetApiResult = await getShopifyAPI(ctx.projectId, ctx.userId);
            if ('error' in assetApiResult) {
              return { tool_use_id: toolCall.id, content: assetApiResult.error, is_error: true as const };
            }
            const themeId = toolCall.input.themeId ? Number(toolCall.input.themeId) : (ctx.themeId ? Number(ctx.themeId) : undefined);
            if (!themeId || isNaN(themeId)) {
              return { tool_use_id: toolCall.id, content: 'No theme ID available.', is_error: true as const };
            }
            const asset = await assetApiResult.api.getAsset(themeId, assetKey);
            if (!asset) {
              return { tool_use_id: toolCall.id, content: `Asset not found: ${assetKey}`, is_error: true as const };
            }
            const content = asset.value ?? asset.attachment ?? '[binary asset]';
            // Truncate very large assets
            const truncated = content.length > 80_000 ? content.slice(0, 80_000) + '\n... (truncated)' : content;
            return { tool_use_id: toolCall.id, content: `## ${assetKey}\n\n${truncated}` };
          } catch (err) {
            return { tool_use_id: toolCall.id, content: `Failed to get asset: ${err instanceof Error ? err.message : String(err)}`, is_error: true as const };
          }
        })();
      }

      // ── Theme validation tools (Phase 6) ─────────────────────────────

      case 'theme_check': {
        const targetFile = toolCall.input.fileName ? String(toolCall.input.fileName) : undefined;

        // Convert FileContext[] to ThemeFileInput[] for the checker
        const themeFiles = files
          .filter(f => !f.content.startsWith('[')) // Skip stubs
          .map(f => ({ path: f.path ?? f.fileName, content: f.content }));

        if (themeFiles.length === 0) {
          return { tool_use_id: toolCall.id, content: 'No files with content available for theme check.', is_error: true };
        }

        try {
          const result = runThemeCheck(themeFiles, targetFile);
          return { tool_use_id: toolCall.id, content: formatThemeCheckResult(result) };
        } catch (err) {
          return { tool_use_id: toolCall.id, content: `Theme check failed: ${err instanceof Error ? err.message : String(err)}`, is_error: true };
        }
      }

      case 'generate_placeholder': {
        const width = Number(toolCall.input.width ?? 800);
        const height = Number(toolCall.input.height ?? 600);
        const text = String(toolCall.input.text ?? 'Placeholder');
        const bgColor = String(toolCall.input.bgColor ?? 'oklch(0.97 0.001 106)');
        const textColor = String(toolCall.input.textColor ?? 'oklch(0.553 0.013 58)');

        // Validate dimensions
        if (width < 1 || width > 4000 || height < 1 || height > 4000) {
          return { tool_use_id: toolCall.id, content: 'Dimensions must be between 1 and 4000 pixels.', is_error: true };
        }

        try {
          const svg = generatePlaceholderSVG(width, height, text, bgColor, textColor);
          return { tool_use_id: toolCall.id, content: svg };
        } catch (err) {
          return { tool_use_id: toolCall.id, content: `Placeholder generation failed: ${err instanceof Error ? err.message : String(err)}`, is_error: true };
        }
      }

      // ── Shopify diagnostic tools (E3) ──────────────────────────────

      case 'trace_rendering_chain': {
        const symptom = String(toolCall.input.symptom ?? '');
        if (!symptom) {
          return { tool_use_id: toolCall.id, content: 'Symptom is required.', is_error: true };
        }
        const themeFiles = files
          .filter(f => !f.content.startsWith('['))
          .map(f => ({ path: f.path ?? f.fileName, content: f.content }));
        const chainResult = traceRenderingChain(symptom, themeFiles);
        return { tool_use_id: toolCall.id, content: formatRenderingChainResult(chainResult) };
      }

      case 'check_theme_setting': {
        const settingId = String(toolCall.input.settingId ?? '');
        if (!settingId) {
          return { tool_use_id: toolCall.id, content: 'Setting ID is required.', is_error: true };
        }
        const themeFiles = files
          .filter(f => !f.content.startsWith('['))
          .map(f => ({ path: f.path ?? f.fileName, content: f.content }));
        const settingResult = checkThemeSetting(settingId, themeFiles);
        return { tool_use_id: toolCall.id, content: formatSettingCheckResult(settingResult) };
      }

      case 'diagnose_visibility': {
        const element = String(toolCall.input.element ?? '');
        const pageType = String(toolCall.input.pageType ?? '');
        if (!element || !pageType) {
          return { tool_use_id: toolCall.id, content: 'Element and pageType are required.', is_error: true };
        }
        const themeFiles = files
          .filter(f => !f.content.startsWith('['))
          .map(f => ({ path: f.path ?? f.fileName, content: f.content }));
        const visResult = diagnoseVisibility(element, pageType, themeFiles);
        return { tool_use_id: toolCall.id, content: formatVisibilityDiagnosis(visResult) };
      }

      // ── Structural retrieval tools (Search Architecture Upgrade) ────────────

      case 'get_schema_settings': {
        const sectionFile = String(toolCall.input.sectionFile ?? '');
        if (!sectionFile) {
          return { tool_use_id: toolCall.id, content: 'sectionFile is required.', is_error: true };
        }
        const file = files.find(f =>
          f.fileName === sectionFile || f.path === sectionFile ||
          f.fileName?.endsWith(`/${sectionFile}`) || sectionFile?.endsWith(`/${f.fileName}`)
        );
        if (!file) {
          return { tool_use_id: toolCall.id, content: `File not found: ${sectionFile}`, is_error: true };
        }
        let content = file.content;
        if (content.startsWith('[') && ctx.loadContent) {
          const hydrated = await ctx.loadContent([file.fileId]);
          if (hydrated.length > 0) content = hydrated[0].content;
        }
        const { extractSchemaEntries, formatSchemaSummary } = await import('@/lib/parsers/schema-indexer');
        const entries = extractSchemaEntries(content, sectionFile);
        if (entries.length === 0) {
          return { tool_use_id: toolCall.id, content: `No schema found in ${sectionFile}` };
        }
        return { tool_use_id: toolCall.id, content: formatSchemaSummary(entries) };
      }

      case 'find_references': {
        const target = String(toolCall.input.target ?? '');
        const refType = String(toolCall.input.type ?? 'any');
        if (!target) {
          return { tool_use_id: toolCall.id, content: 'target is required.', is_error: true };
        }
        const { ThemeDependencyGraph } = await import('@/lib/context/cross-language-graph');
        const graph = new ThemeDependencyGraph();
        graph.buildFromFiles(files.map(f => ({ path: f.path ?? f.fileName, content: f.content })));

        let results;
        if (refType === 'css_class') {
          results = graph.findClassUsage(target);
        } else {
          results = graph.findReferences(target);
        }

        if (results.length === 0) {
          return { tool_use_id: toolCall.id, content: `No references found for "${target}".` };
        }
        const formatted = results
          .slice(0, 20)
          .map(r => `- ${r.file}${r.line ? `:${r.line}` : ''} (${r.type})`)
          .join('\n');
        return { tool_use_id: toolCall.id, content: `References for "${target}" (${results.length}):\n${formatted}` };
      }

      case 'read_chunk': {
        const filePath = String(toolCall.input.filePath ?? '');
        const startLine = Number(toolCall.input.startLine ?? 0);
        const endLine = Number(toolCall.input.endLine ?? 0);
        if (!filePath || !startLine || !endLine) {
          return { tool_use_id: toolCall.id, content: 'filePath, startLine, and endLine are required.', is_error: true };
        }
        const file = files.find(f =>
          f.fileName === filePath || f.path === filePath ||
          f.fileName?.endsWith(`/${filePath}`) || filePath?.endsWith(`/${f.fileName}`)
        );
        if (!file) {
          return { tool_use_id: toolCall.id, content: `File not found: ${filePath}`, is_error: true };
        }
        let content = file.content;
        if (content.startsWith('[') && ctx.loadContent) {
          const hydrated = await ctx.loadContent([file.fileId]);
          if (hydrated.length > 0) content = hydrated[0].content;
        }
        const lines = content.split('\n');
        const contextPad = 2;
        const from = Math.max(0, startLine - 1 - contextPad);
        const to = Math.min(lines.length, endLine + contextPad);
        const chunk = lines.slice(from, to)
          .map((l, i) => `${String(from + i + 1).padStart(4)} | ${l}`)
          .join('\n');
        return { tool_use_id: toolCall.id, content: `${filePath} lines ${from + 1}-${to}:\n${chunk}` };
      }

      case 'parallel_batch_read': {
        const chunks = toolCall.input.chunks as Array<{ filePath: string; startLine: number; endLine: number }> | undefined;
        if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
          return { tool_use_id: toolCall.id, content: 'chunks array is required.', is_error: true };
        }
        const contextPad = 2;
        const sections: string[] = [];

        for (const chunk of chunks.slice(0, 10)) {
          const file = files.find(f =>
            f.fileName === chunk.filePath || f.path === chunk.filePath ||
            f.fileName?.endsWith(`/${chunk.filePath}`) || chunk.filePath?.endsWith(`/${f.fileName}`)
          );
          if (!file) {
            sections.push(`--- ${chunk.filePath} (not found) ---`);
            continue;
          }
          let content = file.content;
          if (content.startsWith('[') && ctx.loadContent) {
            const hydrated = await ctx.loadContent([file.fileId]);
            if (hydrated.length > 0) content = hydrated[0].content;
          }
          const lines = content.split('\n');
          const from = Math.max(0, chunk.startLine - 1 - contextPad);
          const to = Math.min(lines.length, chunk.endLine + contextPad);
          const numbered = lines.slice(from, to)
            .map((l, i) => `${String(from + i + 1).padStart(4)} | ${l}`)
            .join('\n');
          sections.push(`--- ${chunk.filePath} lines ${from + 1}-${to} ---\n${numbered}`);
        }

        return { tool_use_id: toolCall.id, content: sections.join('\n\n') };
      }

      default:
        return { tool_use_id: toolCall.id, content: `Unknown tool: ${toolCall.name}`, is_error: true };
    }
  } catch (err) {
    const errType = err instanceof Error ? err.constructor.name : 'Unknown';
    const errMsg = err instanceof Error ? err.message : String(err);
    toolLogger.warn({ err, tool: toolCall.name }, 'Unhandled tool error');
    return { tool_use_id: toolCall.id, content: `Tool error (${errType}): ${errMsg}`, is_error: true };
  }
}
