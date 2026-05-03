import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getModelRuntimeManagerStatus } from '@/lib/model-runtime-manager';

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
    const status = await getModelRuntimeManagerStatus();
    return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load vLLM gateway dashboard';
    return NextResponse.json({ error: message, message }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-store',
        'X-Getouch-Degraded': '1',
      },
    });
  }
}