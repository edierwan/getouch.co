import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

const DEFAULT_ALLOWED_HOSTS = [
  'getouch.co',
  'portal.getouch.co',
  'auth.getouch.co',
  'ai.getouch.co',
  'wa.getouch.co',
  'db.getouch.co',
  'coolify.getouch.co',
];

function getAllowedHosts() {
  const configured = process.env.ADMIN_HEALTH_ALLOWED_HOSTS
    ?.split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return new Set(configured?.length ? configured : DEFAULT_ALLOWED_HOSTS);
}

function isIpAddress(hostname: string) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':');
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url param required' }, { status: 400 });
  }

  // Only allow checking getouch.co subdomains
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return NextResponse.json({ error: 'Forbidden URL' }, { status: 403 });
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowedHosts = getAllowedHosts();
  const allowed = allowedHosts.has(hostname);

  if (!allowed || hostname === 'localhost' || isIpAddress(hostname)) {
    return NextResponse.json({ error: 'Forbidden URL' }, { status: 403 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    return NextResponse.json({ ok: resp.ok, status: resp.status });
  } catch {
    return NextResponse.json({ ok: false, status: 0 });
  }
}
