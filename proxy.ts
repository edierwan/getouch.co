import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const getPortalAdminUrl = () => process.env.PORTAL_ADMIN_URL || 'https://portal.getouch.co';

const getSecret = () => {
  const secret = process.env.AUTH_SECRET;
  return new TextEncoder().encode(secret || 'dev-only-secret-not-for-production');
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Auth pages — redirect to /admin if already logged in (but not /auth/verify)
  if (pathname.startsWith('/auth/') && !pathname.startsWith('/auth/verify')) {
    const token = request.cookies.get('session')?.value;
    if (token) {
      try {
        const { payload } = await jwtVerify(token, getSecret());
        if (payload.role === 'admin') {
          return NextResponse.redirect(new URL(getPortalAdminUrl()));
        }
        return NextResponse.redirect(new URL('/portal', request.url));
      } catch {
        /* invalid token — let them access auth pages */
      }
    }
    return NextResponse.next();
  }

  // Admin pages — require valid session with admin role
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      const url = new URL('/auth/login', request.url);
      url.searchParams.set('from', pathname);
      return NextResponse.redirect(url);
    }
    try {
      const { payload } = await jwtVerify(token, getSecret());
      // Only admin users can access /admin
      if (payload.role !== 'admin') {
        return NextResponse.redirect(new URL('/portal', request.url));
      }
      return NextResponse.redirect(new URL(getPortalAdminUrl()));
    } catch {
      const url = new URL('/auth/login', request.url);
      url.searchParams.set('from', pathname);
      return NextResponse.redirect(url);
    }
  }

  // Portal pages — require valid session (any role except pending)
  if (pathname.startsWith('/portal')) {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      const url = new URL('/auth/login', request.url);
      url.searchParams.set('from', pathname);
      return NextResponse.redirect(url);
    }
    try {
      const { payload } = await jwtVerify(token, getSecret());
      if (payload.role === 'pending') {
        return NextResponse.redirect(new URL('/auth/login', request.url));
      }
      return NextResponse.next();
    } catch {
      const url = new URL('/auth/login', request.url);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/auth/:path*', '/portal/:path*'],
};
