import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSessionCookieDomain() {
  if (process.env.NODE_ENV !== 'production') {
    return undefined;
  }

  return process.env.SESSION_COOKIE_DOMAIN || '.getouch.co';
}

function getPublicOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedHost) {
    return `${forwardedProto || 'https'}://${forwardedHost}`;
  }

  const host = request.headers.get('host');
  if (host && host !== '0.0.0.0:3000' && host !== '0.0.0.0') {
    return `${request.nextUrl.protocol.replace(/:$/, '') || 'https'}://${host}`;
  }

  return process.env.PORTAL_ADMIN_URL || 'https://portal.getouch.co';
}

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/auth/login', getPublicOrigin(request)), 303);
  const domain = getSessionCookieDomain();

  response.cookies.set('session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
    ...(domain ? { domain } : {}),
  });

  return response;
}