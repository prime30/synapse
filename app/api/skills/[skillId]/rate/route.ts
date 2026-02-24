import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';

interface RouteParams {
  params: Promise<{ skillId: string }>;
}

/**
 * POST /api/skills/[skillId]/rate
 * Rate/review a skill. Body: { rating: 1-5, review?: string }
 * Upserts (user can change their rating). Updates published_skills rating_sum and rating_count.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { skillId } = await params;
    const supabase = await createClient();
    const admin = createServiceClient();
    const body = await request.json();

    const rating = body?.rating;
    const review = body?.review;

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      throw APIError.badRequest('rating must be a number between 1 and 5');
    }

    const { data: skill } = await supabase
      .from('published_skills')
      .select('id')
      .eq('id', skillId)
      .single();

    if (!skill) throw APIError.notFound('Skill not found');

    const { data: existing } = await supabase
      .from('skill_ratings')
      .select('rating')
      .eq('skill_id', skillId)
      .eq('user_id', userId)
      .single();

    const { error: upsertError } = await supabase
      .from('skill_ratings')
      .upsert(
        {
          skill_id: skillId,
          user_id: userId,
          rating: Math.round(rating),
          review: typeof review === 'string' ? review.trim().slice(0, 1000) : null,
        },
        { onConflict: 'skill_id,user_id' }
      );

    if (upsertError) throw new APIError('Failed to save rating: ' + upsertError.message, 'RATE_ERROR', 500);

    const oldRating = existing?.rating ?? 0;
    const newRating = Math.round(rating);
    const delta = newRating - oldRating;

    if (delta !== 0) {
      const { data: ps } = await admin
        .from('published_skills')
        .select('rating_sum, rating_count')
        .eq('id', skillId)
        .single();

      const currentSum = ps?.rating_sum ?? 0;
      const currentCount = ps?.rating_count ?? 0;
      const ratingSum = currentSum + delta;
      const ratingCount = existing ? currentCount : currentCount + 1;

      await admin
        .from('published_skills')
        .update({
          rating_sum: ratingSum,
          rating_count: ratingCount,
        })
        .eq('id', skillId);
    }

    return successResponse({ rating: Math.round(rating), review: review ?? null });
  } catch (error) {
    return handleAPIError(error);
  }
}
