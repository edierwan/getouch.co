import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getUnexpectedShutdownAnalysis } from '@/lib/unexpected-shutdown';

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

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  try {
    const analysis = await getUnexpectedShutdownAnalysis();
    return NextResponse.json(analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to gather shutdown diagnostics';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}