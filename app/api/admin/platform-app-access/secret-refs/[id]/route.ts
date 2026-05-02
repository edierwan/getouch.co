import { NextRequest, NextResponse } from 'next/server';
import { deletePlatformSecretRef, disablePlatformSecretRef, updatePlatformSecretRef } from '@/lib/platform-app-access-mutations';
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
      ? await disablePlatformSecretRef(id)
      : await updatePlatformSecretRef(id, body);
    return NextResponse.json({ ok: true, secretRef: { id: row?.id, status: row?.status } });
  } catch (err) {
    return handlePlatformRegistryError('platform-app-access/secret-refs/[id]:PATCH', err);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const row = await deletePlatformSecretRef(id);
    return NextResponse.json({ ok: true, secretRef: { id: row?.id } });
  } catch (err) {
    return handlePlatformRegistryError('platform-app-access/secret-refs/[id]:DELETE', err);
  }
}