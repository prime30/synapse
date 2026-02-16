import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { healthCheck } from '@/lib/ai/providers/openai-compat';

/**
 * POST /api/providers/[providerId]/health
 * Run a health check against a custom provider endpoint.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const userId = await requireAuth(request);
    const { providerId } = await params;
    const supabase = await createClient();

    const { data: provider, error } = await supabase
      .from('custom_providers')
      .select('id, name, base_url, api_key_enc, default_model')
      .eq('id', providerId)
      .eq('user_id', userId)
      .single();

    if (error || !provider) {
      throw APIError.notFound('Provider not found');
    }

    const result = await healthCheck({
      name: provider.name,
      baseURL: provider.base_url,
      apiKey: provider.api_key_enc,
      defaultModel: provider.default_model,
    });

    // Update health status in DB
    const newStatus = result.ok ? 'healthy' : 'down';
    await supabase
      .from('custom_providers')
      .update({
        health_status: newStatus,
        last_health_check: new Date().toISOString(),
      })
      .eq('id', providerId)
      .eq('user_id', userId);

    return successResponse({
      ok: result.ok,
      latencyMs: result.latencyMs,
      error: result.error,
      status: newStatus,
    });
  } catch (err) {
    return handleAPIError(err);
  }
}