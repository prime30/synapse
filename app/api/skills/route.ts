import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';

const CATEGORIES = [
  'theme-type',
  'task-type',
  'component',
  'workflow',
  'debugging',
  'performance',
  'accessibility',
  'cx-optimization',
  'migration',
  'internationalization',
] as const;

const SORT_OPTIONS = ['downloads', 'rating', 'recent'] as const;

export type PublishedSkill = {
  id: string;
  author_id: string;
  name: string;
  description: string;
  content: string;
  keywords: string[];
  version: string;
  category: string;
  theme_compatibility: string[];
  downloads: number;
  rating_sum: number;
  rating_count: number;
  is_featured: boolean;
  published_at: string;
  updated_at: string;
  author?: { full_name: string | null; email: string };
};

/**
 * GET /api/skills
 * Public browse/search of published skills.
 * Query params: q (search), category, sort (downloads|rating|recent), limit, offset
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.trim() || '';
    const category = url.searchParams.get('category')?.trim();
    const sort = (url.searchParams.get('sort') || 'downloads') as (typeof SORT_OPTIONS)[number];
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '24', 10), 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

    if (category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
      return successResponse({ skills: [], total: 0 });
    }

    let query = supabase
      .from('published_skills')
      .select('id, author_id, name, description, content, keywords, version, category, theme_compatibility, downloads, rating_sum, rating_count, is_featured, published_at, updated_at, profiles!author_id(full_name, email)', {
        count: 'exact',
      });

    if (q) {
      const safe = q.replace(/%/g, '\\%').replace(/_/g, '\\_');
      query = query.or(
        `name.ilike.%${safe}%,description.ilike.%${safe}%,keywords.ov.{${safe}}`
      );
    }
    if (category) {
      query = query.eq('category', category);
    }

    switch (sort) {
      case 'rating':
        query = query.order('rating_count', { ascending: false }).order('rating_sum', { ascending: false });
        break;
      case 'recent':
        query = query.order('published_at', { ascending: false });
        break;
      default:
        query = query.order('downloads', { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    const skills = (data || []).map((row: Record<string, unknown>) => {
      const { profiles, ...rest } = row;
      return {
        ...rest,
        author: Array.isArray(profiles) ? profiles[0] : profiles,
      };
    });

    return successResponse({
      skills,
      total: count ?? 0,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
