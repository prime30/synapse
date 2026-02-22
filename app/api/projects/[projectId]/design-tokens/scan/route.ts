import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { listProjectFiles, getFile } from '@/lib/services/files';
import { listByProject, type DesignTokenRow } from '@/lib/design-tokens/models/token-model';
import type { TokenCategory } from '@/lib/design-tokens/types';

/* ------------------------------------------------------------------ */
/*  SSE helpers                                                        */
/* ------------------------------------------------------------------ */

type ScanPhase =
  | 'loading'
  | 'reading'
  | 'extracting'
  | 'inferring'
  | 'detecting'
  | 'persisting'
  | 'complete';

interface ProgressEvent {
  type: 'progress';
  phase: ScanPhase;
  message: string;
  percent: number;
  current?: number;
  total?: number;
  tokensFound?: number;
}

interface CompleteEvent {
  type: 'complete';
  data: {
    tokens: {
      colors: string[];
      fonts: string[];
      fontSizes: string[];
      spacing: string[];
      radii: string[];
      shadows: string[];
    };
    tokenCount: number;
    fileCount: number;
    tokensCreated: number;
    tokensUpdated: number;
    componentsDetected: number;
    totalFilesAnalyzed: number;
  };
}

interface ErrorEvent {
  type: 'error';
  message: string;
}

type SSEEvent = ProgressEvent | CompleteEvent | ErrorEvent;

function formatSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/* ------------------------------------------------------------------ */
/*  Aggregate tokens (same logic as GET route)                         */
/* ------------------------------------------------------------------ */

function aggregateTokens(rows: DesignTokenRow[]) {
  const colors: string[] = [];
  const fonts: string[] = [];
  const fontSizes: string[] = [];
  const spacing: string[] = [];
  const radii: string[] = [];
  const shadows: string[] = [];

  for (const row of rows) {
    const val = row.value;
    switch (row.category) {
      case 'color':
        colors.push(val);
        break;
      case 'typography':
        if (/^\d/.test(val)) fontSizes.push(val);
        else fonts.push(val);
        break;
      case 'spacing':
        spacing.push(val);
        break;
      case 'border':
        radii.push(val);
        break;
      case 'shadow':
        shadows.push(val);
        break;
    }
  }

  return {
    colors: [...new Set(colors)],
    fonts: [...new Set(fonts)],
    fontSizes: [...new Set(fontSizes)],
    spacing: [...new Set(spacing)],
    radii: [...new Set(radii)],
    shadows: [...new Set(shadows)],
  };
}

/* ------------------------------------------------------------------ */
/*  POST — Stream-based scan with progress                             */
/* ------------------------------------------------------------------ */

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { projectId } = await params;

  // Auth BEFORE streaming
  try {
    await requireProjectAccess(request, projectId);
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const abortSignal = request.signal;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        if (abortSignal.aborted) return;
        try {
          controller.enqueue(encoder.encode(formatSSE(event)));
        } catch {
          // Controller may be closed
        }
      };

      try {
        // ── Phase: loading (0–5) ──────────────────────────────────────
        send({
          type: 'progress',
          phase: 'loading',
          message: 'Loading project files...',
          percent: 0,
        });

        const files = await listProjectFiles(projectId);

        if (abortSignal.aborted) { controller.close(); return; }

        if (!files || files.length === 0) {
          send({
            type: 'complete',
            data: {
              tokens: { colors: [], fonts: [], fontSizes: [], spacing: [], radii: [], shadows: [] },
              tokenCount: 0,
              fileCount: 0,
              tokensCreated: 0,
              tokensUpdated: 0,
              componentsDetected: 0,
              totalFilesAnalyzed: 0,
            },
          });
          controller.close();
          return;
        }

        send({
          type: 'progress',
          phase: 'loading',
          message: `Found ${files.length} files`,
          percent: 5,
          total: files.length,
        });

        // ── Phase: reading (5–35) — parallelized in chunks ───────────
        const ingestionFiles: { id: string; path: string; content: string }[] = [];
        const CHUNK_SIZE = 20;

        for (let start = 0; start < files.length; start += CHUNK_SIZE) {
          if (abortSignal.aborted) { controller.close(); return; }

          const chunk = files.slice(start, start + CHUNK_SIZE);
          const results = await Promise.all(
            chunk.map(async (f) => {
              try {
                const fullFile = await getFile(f.id as string);
                const content = fullFile?.content;
                if (typeof content === 'string' && content.length > 0) {
                  return { id: f.id as string, path: (f.path ?? f.name) as string, content };
                }
              } catch { /* skip unreadable */ }
              return null;
            }),
          );
          for (const r of results) { if (r) ingestionFiles.push(r); }

          const progress = Math.min(start + CHUNK_SIZE, files.length);
          send({
            type: 'progress',
            phase: 'reading',
            message: `Reading files (${progress}/${files.length})`,
            percent: 5 + Math.round((progress / files.length) * 30),
            current: progress,
            total: files.length,
          });
        }

        if (abortSignal.aborted) { controller.close(); return; }

        if (ingestionFiles.length === 0) {
          send({
            type: 'complete',
            data: {
              tokens: { colors: [], fonts: [], fontSizes: [], spacing: [], radii: [], shadows: [] },
              tokenCount: 0,
              fileCount: files.length,
              tokensCreated: 0,
              tokensUpdated: 0,
              componentsDetected: 0,
              totalFilesAnalyzed: 0,
            },
          });
          controller.close();
          return;
        }

        // ── Phase: extracting (35–60) ────────────────────────────────
        send({
          type: 'progress',
          phase: 'extracting',
          message: 'Extracting design tokens...',
          percent: 35,
          current: 0,
          total: ingestionFiles.length,
          tokensFound: 0,
        });

        const { TokenExtractor } = await import('@/lib/design-tokens/token-extractor');
        const extractor = new TokenExtractor();
        const allExtracted: import('@/lib/design-tokens/types').ExtractedToken[] = [];

        for (let i = 0; i < ingestionFiles.length; i++) {
          if (abortSignal.aborted) { controller.close(); return; }

          const file = ingestionFiles[i];
          const tokens = extractor.extractFromFile(file.content, file.path);
          allExtracted.push(...tokens);

          if (i % 5 === 0 || i === ingestionFiles.length - 1) {
            send({
              type: 'progress',
              phase: 'extracting',
              message: `Extracting tokens from ${file.path}`,
              percent: 35 + Math.round(((i + 1) / ingestionFiles.length) * 25),
              current: i + 1,
              total: ingestionFiles.length,
              tokensFound: allExtracted.length,
            });
          }
        }

        if (abortSignal.aborted) { controller.close(); return; }

        // ── Phase: inferring (60–65) ─────────────────────────────────
        send({
          type: 'progress',
          phase: 'inferring',
          message: 'Analyzing token patterns...',
          percent: 60,
          tokensFound: allExtracted.length,
        });

        const { inferTokens } = await import('@/lib/design-tokens/inference');
        const inferred = inferTokens(allExtracted);

        if (abortSignal.aborted) { controller.close(); return; }

        // ── Phase: detecting (65–70) ─────────────────────────────────
        send({
          type: 'progress',
          phase: 'detecting',
          message: 'Detecting components...',
          percent: 65,
          tokensFound: allExtracted.length,
        });

        const { detectComponents } = await import(
          '@/lib/design-tokens/components/component-detector'
        );
        const components = detectComponents(
          ingestionFiles.map((f) => ({ path: f.path, name: f.path.split('/').pop() ?? f.path })),
        );

        if (abortSignal.aborted) { controller.close(); return; }

        // ── Phase: persisting (70–95) ────────────────────────────────
        send({
          type: 'progress',
          phase: 'persisting',
          message: 'Saving to database...',
          percent: 70,
        });

        const {
          createToken,
          createUsage,
          deleteUsagesByToken,
          listByProject: listExistingTokens,
        } = await import('@/lib/design-tokens/models/token-model');

        const existing = await listExistingTokens(projectId);
        const existingByName = new Map(existing.map((t) => [t.name, t]));

        let tokensCreated = 0;
        let tokensUpdated = 0;

        // Group inferred tokens by suggested name
        const tokensByName = new Map<string, typeof inferred>();
        for (const token of inferred) {
          const name = token.suggestedName || token.name || token.value;
          if (!tokensByName.has(name)) tokensByName.set(name, []);
          tokensByName.get(name)!.push(token);
        }

        const totalUniqueTokens = tokensByName.size;
        let processed = 0;

        for (const [name, tokens] of tokensByName) {
          if (abortSignal.aborted) { controller.close(); return; }

          const representative = tokens[0];
          const category = representative.category as TokenCategory;

          if (existingByName.has(name)) {
            const existingToken = existingByName.get(name)!;
            await deleteUsagesByToken(existingToken.id);
            for (const t of tokens) {
              await createUsage({
                token_id: existingToken.id,
                file_path: t.filePath,
                line_number: t.lineNumber,
                context: t.context,
              });
            }
            tokensUpdated++;
          } else {
            try {
              const created = await createToken({
                project_id: projectId,
                name,
                category,
                value: representative.value,
                description: 'Auto-extracted from theme ingestion',
              });
              if (created) {
                for (const t of tokens) {
                  await createUsage({
                    token_id: created.id,
                    file_path: t.filePath,
                    line_number: t.lineNumber,
                    context: t.context,
                  });
                }
                tokensCreated++;
              }
            } catch {
              // Duplicate or DB error — skip
            }
          }

          processed++;
          if (processed % 5 === 0 || processed === totalUniqueTokens) {
            send({
              type: 'progress',
              phase: 'persisting',
              message: `Saving tokens (${processed}/${totalUniqueTokens})...`,
              percent: 70 + Math.round((processed / totalUniqueTokens) * 20),
              current: processed,
              total: totalUniqueTokens,
            });
          }
        }

        if (abortSignal.aborted) { controller.close(); return; }

        // Persist components
        send({
          type: 'progress',
          phase: 'persisting',
          message: 'Saving components...',
          percent: 92,
        });

        try {
          const { getClient } = await import(
            '@/lib/design-tokens/components/component-persistence'
          );
          const supabase = await getClient();

          await supabase.from('design_components').delete().eq('project_id', projectId);

          const allPersistedTokens = await listByProject(projectId);
          const tokenIdByName = new Map(allPersistedTokens.map((t) => [t.name, t.id]));

          const fileToTokenNames = new Map<string, Set<string>>();
          for (const [tName, tTokens] of tokensByName) {
            for (const t of tTokens) {
              if (!fileToTokenNames.has(t.filePath)) fileToTokenNames.set(t.filePath, new Set());
              fileToTokenNames.get(t.filePath)!.add(tName);
            }
          }

          for (const comp of components) {
            if (abortSignal.aborted) { controller.close(); return; }

            const tokenIds = new Set<string>();
            for (const filePath of comp.files) {
              const names = fileToTokenNames.get(filePath);
              if (names) {
                for (const n of names) {
                  const id = tokenIdByName.get(n);
                  if (id) tokenIds.add(id);
                }
              }
            }

            await supabase.from('design_components').insert({
              project_id: projectId,
              name: comp.name,
              file_path: comp.primaryFile,
              component_type: comp.type,
              tokens_used: Array.from(tokenIds),
              variants: [],
              usage_frequency: comp.files.length,
              preview_data: { files: comp.files },
            });
          }
        } catch {
          // design_components table might not exist — skip
        }

        // ── Phase: complete (100) ────────────────────────────────────
        const finalRows = await listByProject(projectId);
        const finalTokens = aggregateTokens(finalRows);

        send({
          type: 'complete',
          data: {
            tokens: finalTokens,
            tokenCount: finalRows.length,
            fileCount: files.length,
            tokensCreated,
            tokensUpdated,
            componentsDetected: components.length,
            totalFilesAnalyzed: ingestionFiles.length,
          },
        });

        controller.close();
      } catch (err) {
        send({
          type: 'error',
          message: err instanceof Error ? err.message : 'Scan failed unexpectedly',
        });
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
