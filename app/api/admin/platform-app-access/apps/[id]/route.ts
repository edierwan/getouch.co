import { NextRequest, NextResponse } from 'next/server';
import { deletePlatformApp, disablePlatformApp, updatePlatformApp } from '@/lib/platform-app-access-mutations';
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
      ? await disablePlatformApp(id)
      : await updatePlatformApp(id, body);
    return NextResponse.json({ ok: true, app: { id: row?.id, appCode: row?.appCode, status: row?.status } });
  } catch (err) {
    return handlePlatformRegistryError('platform-app-access/apps/[id]:PATCH', err);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const body = await readJsonBody(req);
    const row = await deletePlatformApp(id, {
      appCodeConfirmation: typeof body.appCodeConfirmation === 'string' ? body.appCodeConfirmation : null,
    });
    return NextResponse.json({ ok: true, app: { id: row?.id, appCode: row?.appCode } });
  } catch (err) {
    return handlePlatformRegistryError('platform-app-access/apps/[id]:DELETE', err);
  }
}