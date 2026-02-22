import type { ToolCall, ToolResult } from '@/lib/ai/types';
import type { FileContext, AgentContext } from '@/lib/types/agent';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ContextEngine } from '@/lib/ai/context-engine';
import { checkLiquid, checkCSS, checkJavaScript } from '@/lib/agents/validation/syntax-checker';
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
import { recordHistogram } from '@/lib/observability/metrics';

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
      } catch {
        // malformed schema JSON — skip
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
    } catch {
      // skip
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

/**
 * Execute a tool call and return the result.
 * Each tool has access to the project files and context engine.
 *
 * Some tools (grep_content, semantic_search) are async — the caller must
 * await the returned Promise when necessary.
 */
export async function executeToolCall(
  toolCall: ToolCall,
  ctx: ToolExecutorContext,
): Promise<ToolResult> {
  const { files, contextEngine } = ctx;

  try {
    switch (toolCall.name) {
      case 'read_file': {
        const fileId = String(toolCall.input.fileId ?? '');
        // If loadContent is available, try to hydrate the file first
        let file = files.find(f =>
          f.fileId === fileId ||
          f.fileName === fileId ||
          f.fileName.endsWith(`/${fileId}`) ||
          (f.path && f.path.endsWith(`/${fileId}`))
        );
        if (!file) {
          const dbResolved = await resolveFileFromDatabase(fileId, ctx);
          if (dbResolved) {
            files.push(dbResolved);
            file = dbResolved;
          } else {
            return { tool_use_id: toolCall.id, content: `File not found: ${fileId}`, is_error: true };
          }
        }
        // Hydrate if content is a stub
        if (file.content.startsWith('[') && ctx.loadContent) {
          const hydrated = await ctx.loadContent([file.fileId]);
          if (hydrated.length > 0) file = hydrated[0];
        }
        return { tool_use_id: toolCall.id, content: file.content };
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

        // Resolve file
        let regionFile = files.find(f =>
          f.fileId === regionFileId ||
          f.fileName === regionFileId ||
          f.fileName.endsWith(`/${regionFileId}`) ||
          (f.path && f.path.endsWith(`/${regionFileId}`))
        );
        if (!regionFile) {
          const dbResolved = await resolveFileFromDatabase(regionFileId, ctx);
          if (dbResolved) { files.push(dbResolved); regionFile = dbResolved; }
        }
        if (!regionFile) {
          return { tool_use_id: toolCall.id, content: `File not found: ${regionFileId}`, is_error: true };
        }

        // Hydrate if needed
        let regionContent = regionFile.content;
        if (regionContent.startsWith('[') && ctx.loadContent) {
          const hydrated = await ctx.loadContent([regionFile.fileId]);
          regionContent = hydrated[0]?.content ?? regionContent;
        }
        if (regionContent.startsWith('[')) {
          return { tool_use_id: toolCall.id, content: 'File content not available for extraction.', is_error: true };
        }

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

        const lintFile = files.find(f =>
          f.fileId === lintFileName ||
          f.fileName === lintFileName ||
          f.fileName.endsWith(`/${lintFileName}`) ||
          (f.path && f.path.endsWith(`/${lintFileName}`))
        );
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
        const diagFile = files.find(f =>
          f.fileId === diagFileName ||
          f.fileName === diagFileName ||
          f.fileName.endsWith(`/${diagFileName}`) ||
          (f.path && f.path.endsWith(`/${diagFileName}`))
        );
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

        const file = files.find(f =>
          f.fileId === filePath || f.fileName === filePath ||
          f.fileName.endsWith(`/${filePath}`) ||
          (f.path && f.path.endsWith(`/${filePath}`))
        );
        if (!file) {
          return { tool_use_id: toolCall.id, content: `File not found: ${filePath}`, is_error: true };
        }

        // Hydrate if content is a stub
        let currentContent = file.content;
        if (currentContent.startsWith('[') && ctx.loadContent) {
          const hydrated = await ctx.loadContent([file.fileId]);
          if (hydrated.length > 0) currentContent = hydrated[0].content;
        }
        if (currentContent.startsWith('[')) {
          return { tool_use_id: toolCall.id, content: `Cannot load content for ${filePath}`, is_error: true };
        }

        // Find and replace
        const idx = currentContent.indexOf(oldText);
        if (idx === -1) {
          return { tool_use_id: toolCall.id, content: `old_text not found in ${filePath}. Ensure it matches exactly (including whitespace and indentation).`, is_error: true };
        }

        // Check uniqueness — only the first match is replaced
        const secondIdx = currentContent.indexOf(oldText, idx + 1);
        const uniqueWarning = secondIdx !== -1
          ? ' Warning: old_text matches multiple locations — only the first occurrence was replaced. Add more context lines for precision.'
          : '';

        const updatedContent = currentContent.slice(0, idx) + newText + currentContent.slice(idx + oldText.length);

        if (!ctx.supabaseClient) {
          return { tool_use_id: toolCall.id, content: 'Database client not available for file writes.', is_error: true };
        }

        try {
          const { error } = await ctx.supabaseClient
            .from('files')
            .update({ content: updatedContent, updated_at: new Date().toISOString() })
            .eq('id', file.fileId);
          if (error) {
            return { tool_use_id: toolCall.id, content: `Write failed: ${error.message}`, is_error: true as const };
          }

          // Update in-memory file content so subsequent reads reflect the change
          file.content = updatedContent;

          const sizeBytes = new TextEncoder().encode(updatedContent).length;
          return { tool_use_id: toolCall.id, content: `File updated: ${file.fileName} (${sizeBytes} bytes, 1 replacement).${uniqueWarning}` };
        } catch (err) {
          return { tool_use_id: toolCall.id, content: `Write failed: ${err instanceof Error ? err.message : String(err)}`, is_error: true as const };
        }
      }

      // ── File mutation tools (Agent Power Tools Phase 1) ──────────────

      case 'write_file': {
        const fileName = String(toolCall.input.fileName ?? '');
        const content = String(toolCall.input.content ?? '');

        // Validate path
        if (fileName.includes('..') || fileName.startsWith('/') || fileName.includes(':')) {
          return { tool_use_id: toolCall.id, content: `Invalid file path: ${fileName}`, is_error: true };
        }
        // Size check (1MB)
        if (new TextEncoder().encode(content).length > 1_048_576) {
          return { tool_use_id: toolCall.id, content: 'File content exceeds 1MB limit.', is_error: true };
        }

        const file = files.find(f =>
          f.fileId === fileName || f.fileName === fileName ||
          f.fileName.endsWith(`/${fileName}`) ||
          (f.path && f.path.endsWith(`/${fileName}`))
        );
        if (!file) {
          return { tool_use_id: toolCall.id, content: `File not found: ${fileName}`, is_error: true };
        }

        if (!ctx.supabaseClient) {
          return { tool_use_id: toolCall.id, content: 'Database client not available for file writes.', is_error: true };
        }

        // async
        return (async () => {
          try {
            const { error } = await ctx.supabaseClient!
              .from('files')
              .update({ content, updated_at: new Date().toISOString() })
              .eq('id', file.fileId);
            if (error) {
              return { tool_use_id: toolCall.id, content: `Write failed: ${error.message}`, is_error: true as const };
            }
            const sizeBytes = new TextEncoder().encode(content).length;
            return { tool_use_id: toolCall.id, content: `File updated: ${file.fileName} (${sizeBytes} bytes)` };
          } catch (err) {
            return { tool_use_id: toolCall.id, content: `Write failed: ${err instanceof Error ? err.message : String(err)}`, is_error: true as const };
          }
        })();
      }

      case 'delete_file': {
        const fileName = String(toolCall.input.fileName ?? '');

        if (fileName.includes('..') || fileName.startsWith('/') || fileName.includes(':')) {
          return { tool_use_id: toolCall.id, content: `Invalid file path: ${fileName}`, is_error: true };
        }

        const file = files.find(f =>
          f.fileId === fileName || f.fileName === fileName ||
          f.fileName.endsWith(`/${fileName}`) ||
          (f.path && f.path.endsWith(`/${fileName}`))
        );
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

        const file = files.find(f =>
          f.fileId === fileName || f.fileName === fileName ||
          f.fileName.endsWith(`/${fileName}`) ||
          (f.path && f.path.endsWith(`/${fileName}`))
        );
        if (!file) {
          return { tool_use_id: toolCall.id, content: `File not found: ${fileName}`, is_error: true };
        }

        if (!ctx.supabaseClient) {
          return { tool_use_id: toolCall.id, content: 'Database client not available for file rename.', is_error: true };
        }

        return (async () => {
          try {
            // Extract the new file name (last segment) and new path
            const newName = newFileName.split('/').pop() || newFileName;
            const newPath = newFileName.startsWith('/') ? newFileName : '/' + newFileName;
            const { error } = await ctx.supabaseClient!
              .from('files')
              .update({ name: newName, path: newPath, updated_at: new Date().toISOString() })
              .eq('id', file.fileId);
            if (error) {
              return { tool_use_id: toolCall.id, content: `Rename failed: ${error.message}`, is_error: true as const };
            }
            return { tool_use_id: toolCall.id, content: `File renamed: ${file.fileName} → ${newFileName}` };
          } catch (err) {
            return { tool_use_id: toolCall.id, content: `Rename failed: ${err instanceof Error ? err.message : String(err)}`, is_error: true as const };
          }
        })();
      }

      // ── Web search tool (Agent Power Tools Phase 2) ──────────────────────

      case 'web_search': {
        const query = String(toolCall.input.query ?? '');
        if (!query) {
          return { tool_use_id: toolCall.id, content: 'Search query is required.', is_error: true };
        }
        const maxResults = Math.min(Number(toolCall.input.maxResults ?? 5), 5);

        // async — returns a Promise<ToolResult>
        return webSearch(query, maxResults)
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
                const products = await resourcesApiResult.api.listProducts(limit);
                sections.push(`## Products (${products.length})\n${products.map((p) => `- ${p.title} (ID: ${p.id})`).join('\n') || 'None'}`);
              } catch { sections.push('## Products\nFailed to load'); }
            }
            if (resourceType === 'collections' || resourceType === 'all') {
              try {
                const collections = await resourcesApiResult.api.listCollections(limit);
                sections.push(`## Collections (${collections.length})\n${collections.map((c) => `- ${c.title} (ID: ${c.id})`).join('\n') || 'None'}`);
              } catch { sections.push('## Collections\nFailed to load'); }
            }
            if (resourceType === 'pages' || resourceType === 'all') {
              try {
                const pages = await resourcesApiResult.api.listPages(limit);
                sections.push(`## Pages (${pages.length})\n${pages.map((p) => `- ${p.title} (ID: ${p.id})`).join('\n') || 'None'}`);
              } catch { sections.push('## Pages\nFailed to load'); }
            }

            return { tool_use_id: toolCall.id, content: sections.join('\n\n') || 'No resources found.' };
          } catch (err) {
            return { tool_use_id: toolCall.id, content: `Failed to list resources: ${err instanceof Error ? err.message : String(err)}`, is_error: true as const };
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
            const truncated = content.length > 30_000 ? content.slice(0, 30_000) + '\n... (truncated)' : content;
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
        const bgColor = String(toolCall.input.bgColor ?? '#f5f5f4');
        const textColor = String(toolCall.input.textColor ?? '#78716c');

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

      default:
        return { tool_use_id: toolCall.id, content: `Unknown tool: ${toolCall.name}`, is_error: true };
    }
  } catch (err) {
    return { tool_use_id: toolCall.id, content: `Tool error: ${String(err)}`, is_error: true };
  }
}
