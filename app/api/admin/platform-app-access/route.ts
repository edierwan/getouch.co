import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getPlatformAccessSnapshot } from '@/lib/platform-app-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (session.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { session };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const selectedAppCode = searchParams.get('appCode');
    const selectedTenantBindingId = searchParams.get('tenantBindingId');

    const snapshot = await getPlatformAccessSnapshot({
      selectedAppCode,
      selectedTenantBindingId,
    });

    return NextResponse.json(snapshot);
  } catch (err) {
    console.error('[platform-app-access][GET] failed:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}