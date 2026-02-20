import { NextRequest, NextResponse } from 'next/server';

function noStoreHeaders(contentType?: string): HeadersInit {
  return {
    'Cache-Control': 'no-store',
    ...(contentType ? { 'Content-Type': contentType } : {}),
  };
}

function isScriptLike(pathname: string): boolean {
  return pathname.endsWith('.js') || pathname.endsWith('.mjs');
}

/**
 * Shopify preview can request many ephemeral /web-pixels* resources.
 * Returning stable 200/204 responses avoids repeated 404 churn/noise.
 */
export async function GET(request: NextRequest) {
  if (isScriptLike(request.nextUrl.pathname)) {
    return new NextResponse('// web-pixels stub\n', {
      status: 200,
      headers: noStoreHeaders('application/javascript; charset=utf-8'),
    });
  }
  return new NextResponse(null, {
    status: 204,
    headers: noStoreHeaders(),
  });
}

export async function POST() {
  return new NextResponse(null, {
    status: 204,
    headers: noStoreHeaders(),
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: noStoreHeaders(),
  });
}
