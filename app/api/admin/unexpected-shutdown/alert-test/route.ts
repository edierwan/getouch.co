import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { sendUnexpectedShutdownAlert } from '@/lib/unexpected-shutdown';

async function requireAdmin() {
  const session = await getSession();

  if (!session) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  if (session.role !== 'admin') {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { response: null };
}

export async function POST(req: NextRequest) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const type = body?.type;
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';

  if (type !== 'unexpected-shutdown' && type !== 'back-online' && type !== 'critical-warning') {
    return NextResponse.json({ error: 'Invalid alert type' }, { status: 400 });
  }

  try {
    const result = await sendUnexpectedShutdownAlert(type, phone || undefined);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send alert';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}