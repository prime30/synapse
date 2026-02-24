import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';

interface RouteParams {
  params: Promise<{ skillId: string }>;
}

/**
 * GET /api/skills/[skillId]
 * Get single skill details + author info. Public.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { skillId } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('published_skills')
      .select('id, author_id, name, description, content, keywords, version, category, theme_compatibility, downloads, rating_sum, rating_count, is_featured, published_at, updated_at, profiles!author_id(full_name, email)')
      .eq('id', skillId)
      .single();

    if (error || !data) {
      throw APIError.notFound('Skill not found');
    }

    const { profiles, ...rest } = data as Record<string, unknown>;
    const skill = {
      ...rest,
      author: Array.isArray(profiles) ? profiles[0] : profiles,
    };

    return successResponse({ skill });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * PUT /api/skills/[skillId]
 * Update skill. Author only.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { skillId } = await params;
    const supabase = await createClient();
    const body = await request.json();

    const { data: existing } = await supabase
      .from('published_skills')
      .select('id, author_id')
      .eq('id', skillId)
      .single();

    if (!existing) throw APIError.notFound('Skill not found');
    if (existing.author_id !== userId) throw APIError.forbidden('Only the author can update this skill');

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = String(body.name).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 64);
    if (body.description !== undefined) updates.description = String(body.description).trim().slice(0, 500);
    if (body.content !== undefined) {
      const content = String(body.content).trim();
      if (content.length < 100) throw APIError.badRequest('content must be at least 100 characters');
      if (content.length > 10000) throw APIError.badRequest('content must be at most 10000 characters');
      updates.content = content;
    }
    if (body.keywords !== undefined) {
      const kw = Array.isArray(body.keywords) ? body.keywords.filter((k: unknown) => typeof k === 'string').map((k: string) => k.trim().toLowerCase()) : [];
      updates.keywords = kw.length ? kw : ['shopify', 'theme'];
    }
    if (body.version !== undefined) updates.version = String(body.version).slice(0, 20);
    if (body.category !== undefined) updates.category = body.category;
    if (body.theme_compatibility !== undefined) updates.theme_compatibility = Array.isArray(body.theme_compatibility) ? body.theme_compatibility : [];

    if (Object.keys(updates).length === 0) {
      const { data: current } = await supabase
        .from('published_skills')
        .select('*')
        .eq('id', skillId)
        .single();
      return successResponse({ skill: current });
    }

    const { data, error } = await supabase
      .from('published_skills')
      .update(updates)
      .eq('id', skillId)
      .eq('author_id', userId)
      .select('id, author_id, name, description, content, keywords, version, category, theme_compatibility, downloads, rating_sum, rating_count, is_featured, published_at, updated_at')
      .single();

    if (error) throw new APIError('Failed to update skill: ' + error.message, 'UPDATE_ERROR', 500);
    return successResponse({ skill: data });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * DELETE /api/skills/[skillId]
 * Delete skill. Author only.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { skillId } = await params;
    const supabase = await createClient();

    const { error } = await supabase
      .from('published_skills')
      .delete()
      .eq('id', skillId)
      .eq('author_id', userId);

    if (error) throw new APIError('Failed to delete skill: ' + error.message, 'DELETE_ERROR', 500);
    return successResponse({ deleted: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
