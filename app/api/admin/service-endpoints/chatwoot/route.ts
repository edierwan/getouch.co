import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createDegradedChatwootDashboardStatus, getChatwootDashboardStatus } from '@/lib/service-endpoints-chatwoot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET() {
  const response = await requireAdmin();
  if (response) return response;

  try {
    return NextResponse.json(await getChatwootDashboardStatus(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Chatwoot service endpoint status';
    return NextResponse.json(createDegradedChatwootDashboardStatus(message), {
      headers: {
        'Cache-Control': 'no-store',
        'X-Getouch-Degraded': '1',
      },
    });
  }
}