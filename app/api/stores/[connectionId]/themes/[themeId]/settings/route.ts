import { NextRequest } from 'next/server';

import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';

interface RouteParams {
  params: Promise<{ connectionId: string; themeId: string }>;
}

/**
 * PUT /api/stores/[connectionId]/themes/[themeId]/settings
 *
 * Persists section settings to Shopify's `config/settings_data.json`.
 *
 * Body: {
 *   settings: Record<string, unknown>  — flat settings map to merge
 *   sectionId?: string                 — if provided, merges into that section
 *   blocks?: Array<{ id: string; type: string; settings: Record<string, unknown> }>
 * }
 *
 * Flow:
 * 1. Authenticate request
 * 2. Build ShopifyAdminAPI from connection credentials
 * 3. getAsset(themeId, 'config/settings_data.json') — fetch current
 * 4. Deep-merge incoming settings
 * 5. putAsset(themeId, 'config/settings_data.json', JSON.stringify(merged))
 * 6. Return { success: true }
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { connectionId, themeId } = await params;
    const themeIdNum = parseInt(themeId, 10);

    if (isNaN(themeIdNum)) {
      throw APIError.badRequest('Invalid theme ID');
    }

    // Parse body
    const body = await request.json();
    const { settings, sectionId, blocks } = body as {
      settings?: Record<string, unknown>;
      sectionId?: string;
      blocks?: Array<{ id: string; type: string; settings: Record<string, unknown> }>;
    };

    if (!settings || typeof settings !== 'object') {
      throw APIError.badRequest('settings object is required');
    }

    // Build API client
    const api = await ShopifyAdminAPIFactory.create(connectionId);

    // Fetch current settings_data.json
    let currentData: Record<string, unknown>;
    try {
      const asset = await api.getAsset(themeIdNum, 'config/settings_data.json');
      currentData = JSON.parse(asset.value ?? '{}') as Record<string, unknown>;
    } catch {
      // If file doesn't exist, start with empty structure
      currentData = { current: {} };
    }

    // Shopify settings_data.json wraps everything in a "current" key
    const current = (currentData.current ?? {}) as Record<string, unknown>;

    if (sectionId) {
      // Merge into a specific section
      const sections = (current.sections ?? {}) as Record<string, unknown>;
      const existingSection = (sections[sectionId] ?? {}) as Record<string, unknown>;
      const existingSettings = (existingSection.settings ?? {}) as Record<string, unknown>;

      const updatedSection: Record<string, unknown> = {
        ...existingSection,
        settings: { ...existingSettings, ...settings },
      };

      // Merge blocks if provided
      if (blocks && Array.isArray(blocks)) {
        const blocksMap: Record<string, unknown> = {};
        const blockOrder: string[] = [];
        for (const block of blocks) {
          blocksMap[block.id] = { type: block.type, settings: block.settings };
          blockOrder.push(block.id);
        }
        updatedSection.blocks = blocksMap;
        updatedSection.block_order = blockOrder;
      }

      sections[sectionId] = updatedSection;
      current.sections = sections;
    } else {
      // Top-level theme settings merge
      Object.assign(current, settings);
    }

    currentData.current = current;

    // Write back to Shopify
    await api.putAsset(
      themeIdNum,
      'config/settings_data.json',
      JSON.stringify(currentData, null, 2),
    );

    return successResponse({ success: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
