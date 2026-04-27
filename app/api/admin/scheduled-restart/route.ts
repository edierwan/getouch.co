import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getScheduledRestartOverview, saveScheduledRestart } from '@/lib/scheduled-restart';

async function requireAdmin() {
  const session = await getSession();

  if (!session) {
    return { session: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  if (session.role !== 'admin') {
    return { session: null, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { session, response: null };
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const overview = await getScheduledRestartOverview();
  return NextResponse.json(overview);
}

export async function PUT(req: NextRequest) {
  const { session, response } = await requireAdmin();
  if (response || !session) return response;

  const body = await req.json().catch(() => null);

  try {
    const overview = await saveScheduledRestart(body || {}, session);
    return NextResponse.json(overview);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save scheduled restart';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}