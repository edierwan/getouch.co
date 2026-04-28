import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { runVllmQuickTest } from '@/lib/service-endpoints-vllm';

async function requireAdmin() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function POST() {
  const response = await requireAdmin();
  if (response) return response;

  const result = await runVllmQuickTest('health');
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}