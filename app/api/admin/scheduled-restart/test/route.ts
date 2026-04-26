import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { runScheduledRestartDryTest } from '@/lib/scheduled-restart';

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

export async function POST() {
  const { session, response } = await requireAdmin();
  if (response || !session) return response;

  try {
    const overview = await runScheduledRestartDryTest(session);
    return NextResponse.json(overview);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to run restart dry test';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}