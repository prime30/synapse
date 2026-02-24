import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const MENTION_TYPES = ['file', 'plan', 'memory'] as const;
type MentionType = (typeof MENTION_TYPES)[number];

/**
 * GET /api/projects/[projectId]/mentions
 *
 * Typeahead search for @mentions.
 * Query params: type=file|plan|memory, q=search_term
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const url = request.nextUrl;
    const type = url.searchParams.get('type') as MentionType | null;
    const q = url.searchParams.get('q')?.trim() ?? '';

    if (!type || !MENTION_TYPES.includes(type)) {
      throw APIError.badRequest('type must be one of: file, plan, memory');
    }

    const supabase = await createClient();
    const results: Array<{ id: string; type: string; label: string; detail?: string }> = [];

    if (type === 'file') {
      const { data: files, error } = await supabase
        .from('files')
        .select('id, path, name')
        .eq('project_id', projectId)
        .ilike('path', `%${q}%`)
        .limit(10);

      if (error) throw error;
      for (const f of files ?? []) {
        results.push({
          id: f.id,
          type: 'file',
          label: f.path,
          detail: f.name !== f.path ? f.name : undefined,
        });
      }
    } else if (type === 'plan') {
      const { data: plans, error } = await supabase
        .from('plans')
        .select('id, name')
        .eq('project_id', projectId)
        .ilike('name', `%${q}%`)
        .limit(10);

      if (error) throw error;
      for (const p of plans ?? []) {
        results.push({
          id: p.id,
          type: 'plan',
          label: p.name,
        });
      }
    } else if (type === 'memory') {
      // Search developer_memory content (JSONB) - use text search on content
      const { data: memories, error } = await supabase
        .from('developer_memory')
        .select('id, content')
        .eq('project_id', projectId)
        .limit(50);

      if (error) {
        // Table may not exist in some environments
        if (error.code === '42P01' || error.code === 'PGRST204' || error.code === 'PGRST205') {
          return successResponse({ results: [] });
        }
        throw error;
      }

      const searchLower = q.toLowerCase();
      const matched = (memories ?? [])
        .filter((m) => {
          const contentStr = JSON.stringify(m.content ?? {}).toLowerCase();
          return !searchLower || contentStr.includes(searchLower);
        })
        .slice(0, 10);

      for (const m of matched) {
        const c = m.content as Record<string, unknown>;
        const label =
          (c.pattern as string) ??
          (c.choice as string) ??
          (c.preference as string) ??
          (c.context as string) ??
          'Memory';
        results.push({
          id: m.id,
          type: 'memory',
          label: String(label).slice(0, 100),
        });
      }
    }

    return successResponse({ results });
  } catch (error) {
    return handleAPIError(error);
  }
}
