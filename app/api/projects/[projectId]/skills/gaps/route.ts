import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { analyzeGaps, type ModuleLoadLog } from '@/lib/agents/knowledge/gap-analyzer';
import { getAllKnowledgeModules } from '@/lib/agents/knowledge/module-matcher';
import { loadInstalledMarketplaceSkills } from '@/lib/agents/knowledge/marketplace-loader';
import { createServiceClient } from '@/lib/supabase/admin';
import { resolveProjectSlug, getLocalThemePath } from '@/lib/sync/disk-sync';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/skills/gaps
 *
 * Returns gap analysis (unmatched requests, low-effectiveness modules, suggestions).
 * Also returns module list with effectiveness for SkillBrowser display.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    // For now, return empty analysis since logs aren't persisted yet.
    // In production, query from a module_load_logs table.
    const logs: ModuleLoadLog[] = [];
    const analysis = analyzeGaps(logs);

    // Resolve projectDir for module list (built-in + custom + marketplace skills)
    let projectDir: string | undefined;
    try {
      const projectSlug = await resolveProjectSlug(projectId);
      projectDir = getLocalThemePath(projectSlug);
    } catch {
      projectDir = undefined;
    }

    const supabase = createServiceClient();
    const marketplaceModules = await loadInstalledMarketplaceSkills(projectId, supabase);
    const allModules = getAllKnowledgeModules(projectDir, marketplaceModules);
    const effectivenessMap = new Map(
      analysis.lowEffectivenessModules.map((m) => [m.moduleId, m.effectivenessScore])
    );

    const modules = allModules.map((m) => ({
      id: m.id,
      effectivenessScore: effectivenessMap.get(m.id) ?? null,
    }));

    return successResponse({
      ...analysis,
      modules,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
