import { NextRequest } from 'next/server';
import crypto from 'crypto';

import { createClient } from '@/lib/supabase/server';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';
import { successResponse, errorResponse } from '@/lib/api/response';

/**
 * Verify the Shopify webhook HMAC-SHA256 signature.
 * Shopify signs the raw body with the app's API secret and sends
 * the base64-encoded digest in the X-Shopify-Hmac-Sha256 header.
 */
function verifyWebhookHmac(rawBody: string, hmacHeader: string): boolean {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) return false;

  const generatedHmac = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmacHeader),
      Buffer.from(generatedHmac)
    );
  } catch {
    // Buffers with different lengths throw — treat as invalid
    return false;
  }
}

/**
 * POST /api/shopify/webhooks
 * Handles incoming Shopify webhook events.
 *
 * Supported topics:
 * - themes/update: marks all synced theme files as pending for re-sync
 * - app/uninstalled: deletes all connections for the uninstalled store
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256');
    const topic = request.headers.get('x-shopify-topic');
    const shopDomain = request.headers.get('x-shopify-shop-domain');

    if (!hmacHeader || !topic || !shopDomain) {
      return errorResponse(
        'Missing required webhook headers',
        'INVALID_WEBHOOK',
        401
      );
    }

    if (!verifyWebhookHmac(rawBody, hmacHeader)) {
      return errorResponse(
        'Invalid webhook signature',
        'INVALID_HMAC',
        401
      );
    }

    const supabase = await createClient();

    switch (topic) {
      case 'themes/update': {
        // Mark all synced theme files as pending for affected connections
        const { data: connections } = await supabase
          .from('shopify_connections')
          .select('id')
          .eq('store_domain', shopDomain);

        if (connections) {
          for (const conn of connections) {
            await supabase
              .from('theme_files')
              .update({
                sync_status: 'pending',
                updated_at: new Date().toISOString(),
              })
              .eq('connection_id', conn.id)
              .eq('sync_status', 'synced');
          }
        }
        break;
      }

      case 'app/uninstalled': {
        // Remove all connections for the uninstalled store
        const { data: connections } = await supabase
          .from('shopify_connections')
          .select('id')
          .eq('store_domain', shopDomain);

        if (connections) {
          const tokenManager = new ShopifyTokenManager();
          for (const conn of connections) {
            await tokenManager.deleteConnection(conn.id);
          }
        }
        break;
      }

      default:
        // Acknowledge unhandled topics with 200 so Shopify doesn't retry
        break;
    }

    return successResponse({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return errorResponse(
      'Webhook processing failed',
      'WEBHOOK_ERROR',
      500
    );
  }
}
