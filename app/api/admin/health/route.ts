import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  const allowed =
    parsed.hostname === 'getouch.co' ||
    parsed.hostname.endsWith('.getouch.co') ||
    parsed.hostname === 'localhost';

  if (!allowed) {
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
