import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSessionCookieDomain() {
  if (process.env.NODE_ENV !== 'production') {
    return undefined;
  }

  return process.env.SESSION_COOKIE_DOMAIN || '.getouch.co';
}

export async function POST(request: NextRequest) {
  void request;
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: '/auth/login' },
  });
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