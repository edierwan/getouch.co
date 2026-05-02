import { NextRequest, NextResponse } from 'next/server';
import { createPlatformTenantBinding } from '@/lib/platform-app-access-mutations';
import { handlePlatformRegistryError, readJsonBody, requireAdmin } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const body = await readJsonBody(req);
    const row = await createPlatformTenantBinding(body);
    return NextResponse.json({ ok: true, tenantBinding: { id: row.id, appId: row.appId } });
  } catch (err) {
    return handlePlatformRegistryError('platform-app-access/tenant-bindings:POST', err);
  }
}