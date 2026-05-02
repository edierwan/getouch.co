import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const getPortalAdminUrl = () => {
  const baseUrl = process.env.PORTAL_ADMIN_URL || 'https://portal.getouch.co';
  return new URL('/infra/servers', baseUrl).toString();
};
const getMcpPublicBaseUrl = () => process.env.MCP_PUBLIC_BASE_URL || 'https://mcp.getouch.co';
const getRequestHost = (request: NextRequest) => {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host') || '';
  return host.split(':')[0].toLowerCase();
};
const getPortalAdminHost = () => {
  const adminUrl = new URL(getPortalAdminUrl());
  return adminUrl.host;
};
const getMcpPublicHost = () => {
  const mcpUrl = new URL(getMcpPublicBaseUrl());
  return mcpUrl.host;
};
const getPortalRootUrl = (request: NextRequest) => new URL('/infra/servers', `https://${getPortalAdminHost()}`);
const isPortalHost = (request: NextRequest) => {
  return getRequestHost(request) === getPortalAdminHost().toLowerCase();
};
const isMcpHost = (request: NextRequest) => getRequestHost(request) === getMcpPublicHost().toLowerCase();
const GRAFANA_URL = 'https://grafana.getouch.co';
const LITELLM_URL = 'https://litellm.getouch.co';
const LANGFUSE_URL = 'https://langfuse.getouch.co';
const INFISICAL_URL = 'https://infisical.getouch.co';
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
const isAuthentikLegacyPath = (pathname: string) => {
  return pathname === '/system/authentik' || pathname === '/admin/system/authentik';
};
const isLangfuseLegacyPath = (pathname: string) => {
  return pathname === '/observability/langfuse'
    || pathname === '/admin/observability/langfuse'
    || pathname === '/operations/langfuse'
    || pathname === '/admin/operations/langfuse';
};
const isGrafanaLegacyPath = (pathname: string) => {
  return pathname === '/observability/grafana'
    || pathname === '/admin/observability/grafana';
};
const isInfisicalLegacyPath = (pathname: string) => {
  return pathname === '/security/infisical'
    || pathname === '/admin/security/infisical';
};
const isLiteLlmLegacyPath = (pathname: string) => {
  return pathname === '/ai/litellm'
    || pathname === '/admin/ai/litellm'
    || pathname === '/ai-services/litellm'
    || pathname === '/admin/ai-services/litellm'
    || pathname === '/service-endpoints/litellm'
    || pathname === '/admin/service-endpoints/litellm';
};
const LEGACY_PORTAL_PUBLIC_PATHS: Record<string, string> = {
  '/dashboard': '/infra/servers',
  '/system/dashboard': '/infra/servers',
  '/system/servers': '/infra/servers',
  '/service-endpoints/vllm': '/ai/vllm',
  '/service-endpoints/litellm': '/ai/litellm',
  '/service-endpoints/dify': '/ai/dify',
  '/service-endpoints/mcp': '/ai/mcp',
  '/service-endpoints/object-storage': '/infra/object-storage',
  '/service-endpoints/evolution': '/communications/evolution',
  '/service-endpoints/baileys': '/communications/baileys',
  '/service-endpoints/open-webui': '/communications/open-webui',
  '/service-endpoints/chatwoot': '/communications/chatwoot',
  '/service-endpoints/voice': '/communications/voice',
  '/servers': '/infra/servers',
  '/databases': '/infra/databases',
  '/api-keys': '/security/api-keys',
  '/quick-links': '/security/quick-links',
  '/messaging': '/communications/baileys',
  '/object-storage': '/infra/object-storage',
  '/whatsapp-services/evolution': '/communications/evolution',
  '/ai-services': '/ai/vllm',
  '/ai-services/vllm': '/ai/vllm',
  '/ai-services/litellm': '/ai/litellm',
  '/ai-services/dify': '/ai/dify',
  '/ai-services/mcp': '/ai/mcp',
  '/developer': '/security/api-keys',
  '/developer/api-keys': '/security/api-keys',
  '/developer/webhooks': '/automation/webhooks',
  '/developer/docs': '/security/docs',
  '/access': '/security/quick-links',
  '/access/quick-links': '/security/quick-links',
  '/infrastructure': '/infra/servers',
  '/infrastructure/servers': '/infra/servers',
  '/infrastructure/databases': '/infra/databases',
  '/infrastructure/object-storage': '/infra/object-storage',
  '/infrastructure/backups': '/infra/backups',
};
const getCanonicalPortalPublicPath = (pathname: string) => {
  return LEGACY_PORTAL_PUBLIC_PATHS[pathname] || pathname;
};
const getCanonicalAdminPath = (pathname: string) => {
  if (pathname === '/admin/system/servers' || pathname === '/admin/system/dashboard') {
    return '/admin/infra/servers';
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
  const mcpHost = isMcpHost(request);

  if (mcpHost) {
    if (pathname.startsWith('/api/mcp')) {
      return NextResponse.next();
    }

    return NextResponse.rewrite(new URL('/mcp-site', request.url));
  }

  // Public diagnostic endpoint — must work without auth so operators can
  // verify which build is actually live (commit SHA, nav labels, etc).
  const isPublicDiagnostic = pathname === '/api/build-info';
  const isPublicPortalApi = isPublicDiagnostic || pathname === '/api/auth/logout';
  const portalApiRequest =
    portalHost && pathname.startsWith('/api/') && !isPublicPortalApi;

  if (portalHost) {
    if (isAuthentikLegacyPath(pathname)) {
      return NextResponse.redirect('https://sso.getouch.co');
    }

    if (isLangfuseLegacyPath(pathname)) {
      return NextResponse.redirect(LANGFUSE_URL);
    }

    if (isGrafanaLegacyPath(pathname)) {
      return NextResponse.redirect(GRAFANA_URL);
    }

    if (isInfisicalLegacyPath(pathname)) {
      return NextResponse.redirect(INFISICAL_URL);
    }

    if (isLiteLlmLegacyPath(pathname)) {
      return NextResponse.redirect(LITELLM_URL);
    }

    // Public diagnostic — let it through without any auth/redirect logic.
    if (isPublicPortalApi) {
      return NextResponse.next();
    }

    if (pathname.startsWith('/portal')) {
      return NextResponse.redirect(getMainPortalUrl(request));
    }

    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      const publicPath = getCanonicalPortalPublicPath(getPortalPublicPath(pathname));
      if (publicPath !== pathname) {
        const url = request.nextUrl.clone();
        url.pathname = publicPath;
        return NextResponse.redirect(url);
      }
    }

    const canonicalPublicPath = getCanonicalPortalPublicPath(pathname);
    if (canonicalPublicPath !== pathname) {
      const url = request.nextUrl.clone();
      url.pathname = canonicalPublicPath;
      return NextResponse.redirect(url);
    }

    const token = request.cookies.get('session')?.value;

    if (portalApiRequest) {
      if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      try {
        const { payload } = await jwtVerify(token, getSecret());
        if (payload.role !== 'admin') {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        return NextResponse.next();
      } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

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
    const canonicalAdminPath = getCanonicalAdminPath(pathname);
    if (canonicalAdminPath !== pathname) {
      return NextResponse.redirect(new URL(canonicalAdminPath, request.url));
    }

    if (isAuthentikLegacyPath(pathname)) {
      return NextResponse.redirect('https://sso.getouch.co');
    }

    if (isGrafanaLegacyPath(pathname)) {
      return NextResponse.redirect(GRAFANA_URL);
    }

    if (isLangfuseLegacyPath(pathname)) {
      return NextResponse.redirect(LANGFUSE_URL);
    }

    if (isLiteLlmLegacyPath(pathname)) {
      return NextResponse.redirect(LITELLM_URL);
    }

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
