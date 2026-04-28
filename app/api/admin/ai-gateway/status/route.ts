import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getGatewayStatus } from '@/lib/ai-gateway';

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
    const status = await getGatewayStatus();
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load AI gateway status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}