import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { createServiceClient } from '@/lib/supabase/admin';
import { loadProjectFiles } from '@/lib/supabase/file-loader';
import { classifyRequest } from '@/lib/agents/classifier';
import { ContextEngine } from '@/lib/ai/context-engine';
import type { FileContext as GraphFileContext } from '@/lib/context/types';
import { SymbolGraphCache } from '@/lib/context/symbol-graph-cache';
import { DependencyGraphCache } from '@/lib/context/dependency-graph-cache';
import { DependencyDetector } from '@/lib/context/detector';

const warmupSchema = z.object({
  projectId: z.string().uuid(),
  draft: z.string().min(1),
  intentMode: z.enum(['code', 'ask', 'plan', 'debug']).optional().default('code'),
  activeFilePath: z.string().optional(),
  openTabs: z.array(z.string()).optional().default([]),
  explicitFiles: z.array(z.string()).optional().default([]),
});

const symbolGraphCache = new SymbolGraphCache();
const dependencyGraphCache = new DependencyGraphCache();
const dependencyDetector = new DependencyDetector();

function toGraphFiles(files: Array<{ fileId: string; fileName: string; fileType: 'liquid' | 'javascript' | 'css' | 'other'; content: string; path?: string }>): GraphFileContext[] {
  return files.map((f) => ({
    fileId: f.fileId,
    fileName: f.path ?? f.fileName,
    fileType: f.fileType,
    content: f.content,
    sizeBytes: f.content.length,
    lastModified: new Date(),
    dependencies: { imports: [], exports: [], usedBy: [] },
  }));
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const payload = warmupSchema.parse(await request.json());
    const { projectId, draft, activeFilePath, openTabs, explicitFiles } = payload;

    const service = createServiceClient();
    const { allFiles } = await loadProjectFiles(projectId, service);

    const tierResult = await classifyRequest(draft, allFiles.length, {
      skipLLM: true,
    });

    const engine = new ContextEngine(10_000);
    engine.indexFiles(allFiles);
    const selected = engine.selectRelevantFiles(draft, [], activeFilePath, 10_000);

    const explicitMatched = explicitFiles
      .map((p) => allFiles.find((f) => f.path === p || f.path === '/' + p || f.fileName === p))
      .filter((v): v is (typeof allFiles)[number] => !!v);
    const openTabMatched = openTabs
      .map((id) => allFiles.find((f) => f.fileId === id))
      .filter((v): v is (typeof allFiles)[number] => !!v);

    const candidates = new Map<string, (typeof allFiles)[number]>();
    for (const f of explicitMatched) candidates.set(f.fileId, f);
    for (const f of openTabMatched) candidates.set(f.fileId, f);
    for (const f of selected.files) candidates.set(f.fileId, f);

    const warmedFiles = [...candidates.values()].slice(0, 20);
    const graphFiles = toGraphFiles(warmedFiles);

    await symbolGraphCache.getOrCompute(projectId, graphFiles);
    await dependencyGraphCache.getOrComputeIncremental(
      projectId,
      graphFiles,
      (file, all) => dependencyDetector.detectDependenciesForFile(file, all),
    );

    return NextResponse.json({
      ok: true,
      tier: tierResult.tier,
      likelyFiles: warmedFiles.slice(0, 8).map((f) => f.path ?? f.fileName),
      warmedCount: warmedFiles.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Warmup failed';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

