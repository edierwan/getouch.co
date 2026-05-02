import { NextRequest, NextResponse } from 'next/server';
import { deletePlatformTenantBinding, disablePlatformTenantBinding, updatePlatformTenantBinding } from '@/lib/platform-app-access-mutations';
import { handlePlatformRegistryError, readJsonBody, requireAdmin } from '../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const body = await readJsonBody(req);
    const row = body.action === 'disable'
      ? await disablePlatformTenantBinding(id)
      : await updatePlatformTenantBinding(id, body);
    return NextResponse.json({ ok: true, tenantBinding: { id: row?.id, status: row?.status } });
  } catch (err) {
    return handlePlatformRegistryError('platform-app-access/tenant-bindings/[id]:PATCH', err);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const row = await deletePlatformTenantBinding(id);
    return NextResponse.json({ ok: true, tenantBinding: { id: row?.id } });
  } catch (err) {
    return handlePlatformRegistryError('platform-app-access/tenant-bindings/[id]:DELETE', err);
  }
}