import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyOAuthService } from '@/lib/shopify/oauth';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const shop = searchParams.get('shop');
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const timestamp = searchParams.get('timestamp');
    const hmac = searchParams.get('hmac');

    console.log(`[OAuth Callback] shop=${shop} code=${code ? 'present' : 'missing'} state=${state ? 'present' : 'missing'} hmac=${hmac ? 'present' : 'missing'}`);

    if (!shop || !code || !state || !timestamp || !hmac) {
      throw APIError.badRequest('Missing required OAuth callback parameters');
    }

    const oauth = new ShopifyOAuthService();

    // Pass ALL query params so the HMAC covers `host` and any other Shopify-added keys
    const allParams: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      allParams[key] = value;
    });
    if (!oauth.validateHmac(allParams)) {
      throw APIError.unauthorized('Invalid HMAC signature');
    }

    let nonce: string;
    let userId: string;
    let projectId: string | undefined;
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
      nonce = decoded.nonce;
      userId = decoded.userId;
      projectId = decoded.projectId;
    } catch {
      throw APIError.badRequest('Invalid state parameter');
    }

    if (!nonce || !userId) {
      throw APIError.badRequest('Malformed state parameter');
    }

    const cookieStore = await cookies();
    const storedNonce = cookieStore.get('shopify_oauth_nonce')?.value;
    if (!storedNonce || storedNonce !== nonce) {
      throw APIError.unauthorized('Invalid or expired OAuth state');
    }

    cookieStore.delete('shopify_oauth_nonce');

    const tokenResponse = await oauth.exchangeCodeForToken(shop, code);
    const tokenManager = new ShopifyTokenManager();

    const accessToken = tokenResponse.access_token;
    await tokenManager.storeConnection(userId, shop, accessToken, oauth.scopes);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const redirectPath = projectId
      ? `/projects/${projectId}?shopify=connected`
      : '/onboarding?step=import&shopify=connected';
    return NextResponse.redirect(`${appUrl}${redirectPath}`);
  } catch (error) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

    if (error instanceof APIError) {
      return NextResponse.redirect(
        `${appUrl}/onboarding?step=connect&shopify_error=${encodeURIComponent(error.message)}`
      );
    }
    return handleAPIError(error);
  }
}
