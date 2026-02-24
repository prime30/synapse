import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';

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

const MIN_CONTENT = 100;
const MAX_CONTENT = 10000;

/**
 * POST /api/skills/publish
 * Publish a new skill. Requires auth.
 * Body: { name, description, content, keywords, category, themeCompatibility?, version? }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const supabase = await createClient();
    const body = await request.json();

    const {
      name,
      description,
      content,
      keywords,
      category,
      themeCompatibility,
      version = '1.0.0',
    } = body;

    if (!name || typeof name !== 'string') {
      throw APIError.badRequest('name is required');
    }
    if (!description || typeof description !== 'string') {
      throw APIError.badRequest('description is required');
    }
    if (!content || typeof content !== 'string') {
      throw APIError.badRequest('content is required');
    }
    if (!keywords || !Array.isArray(keywords)) {
      throw APIError.badRequest('keywords must be an array');
    }
    if (!category || !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
      throw APIError.badRequest('category must be one of: ' + CATEGORIES.join(', '));
    }

    if (content.length < MIN_CONTENT) {
      throw APIError.badRequest(`content must be at least ${MIN_CONTENT} characters`);
    }
    if (content.length > MAX_CONTENT) {
      throw APIError.badRequest(`content must be at most ${MAX_CONTENT} characters`);
    }

    const keywordsArray = keywords
      .filter((k: unknown) => typeof k === 'string')
      .map((k: string) => k.trim().toLowerCase())
      .filter(Boolean);

    const themeCompat = Array.isArray(themeCompatibility)
      ? themeCompatibility.filter((t: unknown) => typeof t === 'string') || []
      : [];

    const safeName = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 64);

    const { data, error } = await supabase
      .from('published_skills')
      .insert({
        author_id: userId,
        name: safeName,
        description: description.trim().slice(0, 500),
        content: content.trim(),
        keywords: keywordsArray.length ? keywordsArray : ['shopify', 'theme'],
        version: String(version || '1.0.0').slice(0, 20),
        category,
        theme_compatibility: themeCompat,
      })
      .select('id, author_id, name, description, content, keywords, version, category, theme_compatibility, downloads, rating_sum, rating_count, is_featured, published_at, updated_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw APIError.conflict('A skill with this name already exists');
      }
      throw new APIError('Failed to publish skill: ' + error.message, 'PUBLISH_ERROR', 500);
    }

    return successResponse({ skill: data }, 201);
  } catch (error) {
    return handleAPIError(error);
  }
}
