import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getVllmUsageSnapshot } from '@/lib/service-endpoints-vllm';

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
    const usage = await getVllmUsageSnapshot();
    return NextResponse.json(usage, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load vLLM usage';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}