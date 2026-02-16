import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { registerCustomProvider } from '@/lib/ai/get-provider';

/**
 * GET /api/providers
 * List all custom providers for the current user.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('custom_providers')
      .select('id, name, display_name, base_url, default_model, is_enabled, health_status, last_health_check, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw new APIError('Failed to fetch providers: ' + error.message, 'FETCH_ERROR', 500);
    return successResponse(data ?? []);
  } catch (err) {
    return handleAPIError(err);
  }
}

/**
 * POST /api/providers
 * Create a new custom provider.
 * Body: { name, displayName, baseURL, apiKey, defaultModel }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const supabase = await createClient();
    const body = await request.json();

    const { name, displayName, baseURL, apiKey, defaultModel } = body;

    if (!name || !baseURL || !apiKey || !defaultModel) {
      throw APIError.badRequest('Missing required fields: name, baseURL, apiKey, defaultModel');
    }

    // Validate URL format
    try {
      new URL(baseURL);
    } catch {
      throw APIError.badRequest('Invalid base URL format');
    }

    // Sanitize name: lowercase alphanumeric + hyphens only
    const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 32);

    const { data, error } = await supabase
      .from('custom_providers')
      .insert({
        user_id: userId,
        name: safeName,
        display_name: displayName || name,
        base_url: baseURL.replace(/\/+$/, ''),
        api_key_enc: apiKey,
        default_model: defaultModel,
        is_enabled: true,
        health_status: 'unknown',
      })
      .select('id, name, display_name, base_url, default_model, is_enabled, health_status, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw APIError.conflict('Provider with name "' + safeName + '" already exists');
      }
      throw new APIError('Failed to create provider: ' + error.message, 'CREATE_ERROR', 500);
    }

    // Register with the runtime provider registry
    registerCustomProvider({
      name: safeName,
      baseURL: data.base_url,
      apiKey,
      defaultModel,
    });

    return successResponse(data, 201);
  } catch (err) {
    return handleAPIError(err);
  }
}

/**
 * PUT /api/providers
 * Update a custom provider (pass id in body).
 * Body: { id, displayName?, baseURL?, apiKey?, defaultModel?, isEnabled? }
 */
export async function PUT(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const supabase = await createClient();
    const body = await request.json();

    const { id, displayName, baseURL, apiKey, defaultModel, isEnabled } = body;
    if (!id) throw APIError.badRequest('Missing provider id');

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (displayName !== undefined) updates.display_name = displayName;
    if (baseURL !== undefined) updates.base_url = baseURL.replace(/\/+$/, '');
    if (apiKey !== undefined) updates.api_key_enc = apiKey;
    if (defaultModel !== undefined) updates.default_model = defaultModel;
    if (isEnabled !== undefined) updates.is_enabled = isEnabled;

    const { data, error } = await supabase
      .from('custom_providers')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, name, display_name, base_url, default_model, is_enabled, health_status, created_at, updated_at')
      .single();

    if (error) throw new APIError('Failed to update provider: ' + error.message, 'UPDATE_ERROR', 500);
    if (!data) throw APIError.notFound('Provider not found');

    return successResponse(data);
  } catch (err) {
    return handleAPIError(err);
  }
}

/**
 * DELETE /api/providers
 * Delete a custom provider. Pass ?id=... as query param.
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const supabase = await createClient();
    const id = request.nextUrl.searchParams.get('id');
    if (!id) throw APIError.badRequest('Missing provider id');

    const { error } = await supabase
      .from('custom_providers')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw new APIError('Failed to delete provider: ' + error.message, 'DELETE_ERROR', 500);
    return successResponse({ deleted: true });
  } catch (err) {
    return handleAPIError(err);
  }
}