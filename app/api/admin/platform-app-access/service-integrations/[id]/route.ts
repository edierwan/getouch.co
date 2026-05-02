import { NextRequest, NextResponse } from 'next/server';
import { deletePlatformServiceIntegration, disablePlatformServiceIntegration, updatePlatformServiceIntegration } from '@/lib/platform-app-access-mutations';
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
      ? await disablePlatformServiceIntegration(id)
      : await updatePlatformServiceIntegration(id, body);
    return NextResponse.json({ ok: true, serviceIntegration: { id: row?.id, status: row?.status } });
  } catch (err) {
    return handlePlatformRegistryError('platform-app-access/service-integrations/[id]:PATCH', err);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const row = await deletePlatformServiceIntegration(id);
    return NextResponse.json({ ok: true, serviceIntegration: { id: row?.id } });
  } catch (err) {
    return handlePlatformRegistryError('platform-app-access/service-integrations/[id]:DELETE', err);
  }
}