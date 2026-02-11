import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { requireAuth } from '@/lib/middleware/auth';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyOAuthService } from '@/lib/shopify/oauth';

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const shop = request.nextUrl.searchParams.get('shop');
    const projectId = request.nextUrl.searchParams.get('projectId'); // optional legacy compat

    if (!shop) {
      throw APIError.badRequest('shop query parameter is required');
    }

    // Validate shop domain format (must be *.myshopify.com)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)) {
      throw APIError.badRequest('Invalid shop domain format. Expected: store-name.myshopify.com');
    }

    const oauth = new ShopifyOAuthService();
    const nonce = oauth.generateState();

    // Encode userId (and optional projectId) into the state
    const state = Buffer.from(JSON.stringify({ nonce, userId, projectId })).toString('base64url');

    // Store nonce in httpOnly cookie for CSRF validation on callback
    const cookieStore = await cookies();
    cookieStore.set('shopify_oauth_nonce', nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    const installUrl = oauth.getInstallUrl(shop, state);
    return NextResponse.redirect(installUrl);
  } catch (error) {
    return handleAPIError(error);
  }
}
