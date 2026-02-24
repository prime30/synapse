import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';

interface RouteParams {
  params: Promise<{ skillId: string }>;
}

/**
 * POST /api/skills/[skillId]/install
 * Install skill to project. Body: { projectId }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { skillId } = await params;
    const body = await request.json();
    const projectId = body?.projectId;

    if (!projectId || typeof projectId !== 'string') {
      throw APIError.badRequest('projectId is required');
    }

    await requireProjectAccess(request, projectId);
    const supabase = await createClient();

    const { data: skill } = await supabase
      .from('published_skills')
      .select('id, version')
      .eq('id', skillId)
      .single();

    if (!skill) throw APIError.notFound('Skill not found');

    const { error: insertError } = await supabase.from('installed_skills').insert({
      project_id: projectId,
      skill_id: skillId,
      installed_version: skill.version,
    });

    if (insertError) {
      if (insertError.code === '23505') {
        return successResponse({ installed: true, alreadyInstalled: true });
      }
      throw new APIError('Failed to install skill: ' + insertError.message, 'INSTALL_ERROR', 500);
    }

    const admin = createServiceClient();
    const { data: current } = await admin
      .from('published_skills')
      .select('downloads')
      .eq('id', skillId)
      .single();

    await admin
      .from('published_skills')
      .update({ downloads: (current?.downloads ?? 0) + 1 })
      .eq('id', skillId);

    return successResponse({ installed: true, version: skill.version });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * DELETE /api/skills/[skillId]/install
 * Uninstall skill from project. Body: { projectId }
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { skillId } = await params;
    const body = await request.json();
    const projectId = body?.projectId;

    if (!projectId || typeof projectId !== 'string') {
      throw APIError.badRequest('projectId is required');
    }

    await requireProjectAccess(request, projectId);
    const supabase = await createClient();

    const { error } = await supabase
      .from('installed_skills')
      .delete()
      .eq('project_id', projectId)
      .eq('skill_id', skillId);

    if (error) throw new APIError('Failed to uninstall skill: ' + error.message, 'UNINSTALL_ERROR', 500);
    return successResponse({ uninstalled: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
