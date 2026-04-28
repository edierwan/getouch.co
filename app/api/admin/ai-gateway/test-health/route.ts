import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { runGatewayHealthCheck } from '@/lib/ai-gateway';

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
    const status = await runGatewayHealthCheck();
    return NextResponse.json({
      ok: status.enabled,
      message: status.enabled ? 'Gateway health check completed.' : 'Gateway is not enabled.',
      status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to run gateway health check';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}