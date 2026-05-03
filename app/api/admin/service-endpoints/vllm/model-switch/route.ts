import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { requestModelRuntimeSwitch } from '@/lib/model-runtime-manager';

async function requireAdmin() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function POST(req: NextRequest) {
  const response = await requireAdmin();
  if (response) return response;

  const body = await req.json().catch(() => null) as { modelId?: string } | null;
  const modelId = body?.modelId?.trim();
  if (!modelId) {
    return NextResponse.json({ error: 'Missing modelId' }, { status: 400 });
  }

  const result = await requestModelRuntimeSwitch(modelId);
  return NextResponse.json(result, { status: result.ok ? 200 : result.mode === 'manual' ? 409 : 500 });
}