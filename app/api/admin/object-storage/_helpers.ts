import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function requireAdmin() {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }), session: null };
  }
  if (session.role !== 'admin') {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }), session: null };
  }
  return { error: null, session };
}
