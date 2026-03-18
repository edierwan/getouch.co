import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const getSecret = () => {
  const secret = process.env.AUTH_SECRET;
  return new TextEncoder().encode(secret || 'dev-only-secret-not-for-production');
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Auth pages — redirect to /admin if already logged in
  if (pathname.startsWith('/auth/')) {
    const token = request.cookies.get('session')?.value;
    if (token) {
      try {
        await jwtVerify(token, getSecret());
        return NextResponse.redirect(new URL('/admin', request.url));
      } catch {
        /* invalid token — let them access auth pages */
      }
    }
    return NextResponse.next();
  }

  // Admin pages — require valid session
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      const url = new URL('/auth/login', request.url);
      url.searchParams.set('from', pathname);
      return NextResponse.redirect(url);
    }
    try {
      await jwtVerify(token, getSecret());
      return NextResponse.next();
    } catch {
      const url = new URL('/auth/login', request.url);
      url.searchParams.set('from', pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/auth/:path*'],
};
