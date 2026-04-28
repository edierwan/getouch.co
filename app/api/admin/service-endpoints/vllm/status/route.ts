import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getVllmDashboardStatus } from '@/lib/service-endpoints-vllm';

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
    const status = await getVllmDashboardStatus();
    return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load vLLM gateway dashboard';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}