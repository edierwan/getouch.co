import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { runChatwootHealthCheck } from '@/lib/service-endpoints-chatwoot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function POST() {
  const response = await requireAdmin();
  if (response) return response;

  try {
    const check = await runChatwootHealthCheck();
    return NextResponse.json({
      ok: check.ok,
      message: check.message,
      check,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to run Chatwoot health check';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}