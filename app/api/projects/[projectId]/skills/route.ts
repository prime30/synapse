import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createServiceClient } from '@/lib/supabase/admin';
import { getAllKnowledgeModules } from '@/lib/agents/knowledge/module-matcher';
import { loadInstalledMarketplaceSkills } from '@/lib/agents/knowledge/marketplace-loader';
import { resolveProjectSlug, getLocalThemePath } from '@/lib/sync/disk-sync';
import {
  getSkillSettings,
  upsertSkillSetting,
} from '@/lib/agents/knowledge/skill-settings';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

type SkillType = 'built-in' | 'custom' | 'marketplace';

interface SkillItem {
  id: string;
  name: string;
  type: SkillType;
  keywords: string[];
  tokenEstimate: number;
  enabled: boolean;
  description?: string;
}

/**
 * GET /api/projects/[projectId]/skills
 * Returns all available skills (built-in + custom) with enable/disable state.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = createServiceClient();
    const settings = await getSkillSettings(supabase, projectId);

    let projectDir: string | undefined;
    try {
      const slug = await resolveProjectSlug(projectId);
      projectDir = getLocalThemePath(slug);
    } catch {
      /* no local project dir */
    }

    const marketplaceModules = await loadInstalledMarketplaceSkills(projectId, supabase);
    const modules = getAllKnowledgeModules(projectDir, marketplaceModules);

    const skills: SkillItem[] = modules.map((m) => {
      const isCustom = m.id.startsWith('skill:');
      const isMarketplace = m.id.startsWith('marketplace:');
      const name = isCustom
        ? m.id.replace(/^skill:/, '')
        : isMarketplace
          ? m.id.replace(/^marketplace:/, '')
          : m.id;
      return {
        id: m.id,
        name,
        type: (isMarketplace ? 'marketplace' : isCustom ? 'custom' : 'built-in') as SkillType,
        keywords: m.keywords,
        tokenEstimate: m.tokenEstimate,
        enabled: settings[m.id] ?? true,
        description: isCustom ? undefined : undefined,
      };
    });

    return successResponse({ skills });
  } catch (err) {
    return handleAPIError(err);
  }
}

/**
 * POST /api/projects/[projectId]/skills
 * Toggle skill enable/disable.
 * Body: { skillId: string; enabled: boolean }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = await request.json().catch(() => ({}));
    const skillId = body.skillId as string | undefined;
    const enabled = body.enabled as boolean | undefined;

    if (typeof skillId !== 'string' || typeof enabled !== 'boolean') {
      throw APIError.badRequest('skillId (string) and enabled (boolean) are required');
    }

    const supabase = createServiceClient();
    await upsertSkillSetting(supabase, projectId, skillId, enabled);

    return successResponse({ ok: true });
  } catch (err) {
    return handleAPIError(err);
  }
}
