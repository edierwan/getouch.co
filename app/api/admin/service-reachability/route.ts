import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

/**
 * SERAPOD-INFRA-007: server-side reachability checks for services the AI console used to show as a
 * hardcoded ONLINE. Fixed allowlist only — callers cannot supply URLs.
 * "reachable" means the public route answered with a status that proves the app (not the proxy
 * catch-all) handled the request; it is not a functional test.
 */
const TARGETS = {
  dify: { url: 'https://dify.getouch.co/console/api/apps', expect: [401] },
  mcp: { url: 'https://mcp.getouch.co/healthz', expect: [200] },
  searxng: { url: 'https://search.getouch.co/', expect: [401] },
} as const;

type TargetKey = keyof typeof TARGETS;

async function probe(key: TargetKey) {
  const { url, expect } = TARGETS[key];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { cache: 'no-store', redirect: 'manual', signal: controller.signal });
    return { key, reachable: (expect as readonly number[]).includes(res.status), code: res.status };
  } catch (error) {
    return { key, reachable: false, code: null, error: error instanceof Error ? error.message : 'request failed' };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const results = await Promise.all((Object.keys(TARGETS) as TargetKey[]).map(probe));
  return NextResponse.json({ checkedAt: new Date().toISOString(), services: Object.fromEntries(results.map((r) => [r.key, r])) });
}
