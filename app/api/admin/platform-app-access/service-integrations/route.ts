import { NextRequest, NextResponse } from 'next/server';
import { createPlatformServiceIntegration } from '@/lib/platform-app-access-mutations';
import { handlePlatformRegistryError, readJsonBody, requireAdmin } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const body = await readJsonBody(req);
    const row = await createPlatformServiceIntegration(body);
    return NextResponse.json({ ok: true, serviceIntegration: { id: row.id, appId: row.appId } });
  } catch (err) {
    return handlePlatformRegistryError('platform-app-access/service-integrations:POST', err);
  }
}