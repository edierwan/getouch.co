import { NextResponse } from 'next/server';
import { ADMIN_NAV } from '@/app/admin/data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Public build-info endpoint.
 *
 * Exposes only non-sensitive build/runtime metadata so we can verify which
 * code is actually live. Does NOT return any secret env values.
 */
export async function GET() {
  const navLabels = ADMIN_NAV.flatMap((s) => [
    `[${s.label}]`,
    ...s.items.map((i) => `${s.label}: ${i.label} -> ${i.href}`),
  ]);

  const body = {
    commit:
      process.env.SOURCE_COMMIT ||
      process.env.COOLIFY_GIT_COMMIT_SHA ||
      process.env.GIT_COMMIT_SHA ||
      process.env.NEXT_PUBLIC_BUILD_SHA ||
      null,
    buildId: process.env.NEXT_BUILD_ID || null,
    buildTime: process.env.BUILD_TIME || null,
    nodeEnv: process.env.NODE_ENV || null,
    runtime: 'next-standalone-node',
    sidebarConfigSource: 'app/admin/data.ts (ADMIN_NAV)',
    sidebarHasObjectStorage: ADMIN_NAV.some((s) =>
      s.items.some((i) => i.label === 'Object Storage'),
    ),
    nav: navLabels,
    serverTime: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'CDN-Cache-Control': 'no-store',
    },
  });
}
