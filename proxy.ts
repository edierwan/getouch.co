import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const getPortalAdminUrl = () => process.env.PORTAL_ADMIN_URL || 'https://portal.getouch.co';
const getPortalAdminHost = () => {
  const adminUrl = new URL(getPortalAdminUrl());
  return adminUrl.host;
};
const getPortalRootUrl = (request: NextRequest) => new URL('/', `https://${getPortalAdminHost()}`);
const isPortalHost = (request: NextRequest) => {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host') || '';
  return host.split(':')[0].toLowerCase() === getPortalAdminHost().toLowerCase();
};
const getPortalInternalPath = (pathname: string) => {
  if (pathname === '/' || pathname === '') {
    return '/admin';
  }

  return pathname.startsWith('/admin') ? pathname : `/admin${pathname}`;
};
const getPortalPublicPath = (pathname: string) => {
  if (pathname === '/admin') {
    return '/';
  }

  if (pathname.startsWith('/admin/')) {
    return pathname.slice('/admin'.length);
  }

  return pathname;
};
const getMainPortalUrl = (request: NextRequest) => new URL('/portal', request.url);
const getSecret = () => {
  const secret = process.env.AUTH_SECRET;
  return new TextEncoder().encode(secret || 'dev-only-secret-not-for-production');
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const portalHost = isPortalHost(request);

  if (portalHost) {
    if (pathname.startsWith('/portal')) {
      return NextResponse.redirect(getMainPortalUrl(request));
    }

    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      const publicPath = getPortalPublicPath(pathname);
      if (publicPath !== pathname) {
        return NextResponse.redirect(new URL(publicPath, request.url));
      }
    }

    const token = request.cookies.get('session')?.value;

    if (pathname.startsWith('/auth/') && !pathname.startsWith('/auth/verify')) {
      if (token) {
        try {
          const { payload } = await jwtVerify(token, getSecret());
          if (payload.role === 'admin') {
            return NextResponse.redirect(getPortalRootUrl(request));
          }
          return NextResponse.redirect(getMainPortalUrl(request));
        } catch {
          /* invalid token — let them access auth pages */
        }
      }
      return NextResponse.next();
    }

    if (!token) {
      const url = new URL('/auth/login', request.url);
      url.searchParams.set('from', pathname);
      return NextResponse.redirect(url);
    }

    try {
      const { payload } = await jwtVerify(token, getSecret());
      if (payload.role !== 'admin') {
        return NextResponse.redirect(getMainPortalUrl(request));
      }

      return NextResponse.rewrite(new URL(getPortalInternalPath(pathname), request.url));
    } catch {
      const url = new URL('/auth/login', request.url);
      url.searchParams.set('from', pathname);
      return NextResponse.redirect(url);
    }
  }

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
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff|woff2)$).*)',
  ],
};
