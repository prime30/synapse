import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyOAuthService } from '@/lib/shopify/oauth';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';
import type { ShopifyOAuthParams } from '@/lib/types/shopify';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const shop = searchParams.get('shop');
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const timestamp = searchParams.get('timestamp');
    const hmac = searchParams.get('hmac');

    if (!shop || !code || !state || !timestamp || !hmac) {
      throw APIError.badRequest('Missing required OAuth callback parameters');
    }

    const oauth = new ShopifyOAuthService();

    // Validate HMAC signature from Shopify
    const oauthParams: ShopifyOAuthParams = { shop, code, state, timestamp, hmac };
    if (!oauth.validateHmac(oauthParams)) {
      throw APIError.unauthorized('Invalid HMAC signature');
    }

    // Decode state to retrieve nonce and userId
    let nonce: string;
    let userId: string;
    let projectId: string | undefined;
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
      nonce = decoded.nonce;
      userId = decoded.userId;
      projectId = decoded.projectId; // legacy compat
    } catch {
      throw APIError.badRequest('Invalid state parameter');
    }

    if (!nonce || !userId) {
      throw APIError.badRequest('Malformed state parameter');
    }

    // Verify nonce against the cookie set during install
    const cookieStore = await cookies();
    const storedNonce = cookieStore.get('shopify_oauth_nonce')?.value;
    if (!storedNonce || storedNonce !== nonce) {
      throw APIError.unauthorized('Invalid or expired OAuth state');
    }

    // Clear the nonce cookie
    cookieStore.delete('shopify_oauth_nonce');

    // Exchange authorization code for a permanent access token
    const accessToken = await oauth.exchangeCodeForToken(shop, code);

    // Store the encrypted connection with all Phase 1 scopes (user-scoped, auto-activates)
    const tokenManager = new ShopifyTokenManager();
    await tokenManager.storeConnection(userId, shop, accessToken, oauth.scopes);

    // Redirect back into the onboarding wizard at the Import Theme step
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const redirectPath = projectId
      ? `/projects/${projectId}?shopify=connected`
      : '/onboarding?step=import&shopify=connected';
    return NextResponse.redirect(`${appUrl}${redirectPath}`);
  } catch (error) {
    // For OAuth callback errors, redirect with error param instead of returning JSON
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    if (error instanceof APIError) {
      return NextResponse.redirect(
        `${appUrl}/onboarding?step=connect&shopify_error=${encodeURIComponent(error.message)}`
      );
    }
    return handleAPIError(error);
  }
}
