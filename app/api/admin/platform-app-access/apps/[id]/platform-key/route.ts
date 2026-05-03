import { NextRequest, NextResponse } from 'next/server';
import { rotatePlatformAppKey } from '@/lib/platform-app-keys';
import { authorizePlatformAppKey } from '@/lib/platform-broker';
import { handlePlatformRegistryError, readJsonBody, requireAdmin } from '../../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const body = await readJsonBody(req);
    const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : 'rotate';

    if (action === 'auth-check') {
      const rawKey = typeof body.rawKey === 'string' ? body.rawKey : '';
      const brokerAuth = await authorizePlatformAppKey(rawKey, 'platform:auth');
      if (!brokerAuth.ok) {
        return NextResponse.json({ error: brokerAuth.error, message: brokerAuth.message }, { status: brokerAuth.status });
      }
      if (brokerAuth.app.id !== id) {
        return NextResponse.json({ error: 'platform_app_mismatch', message: 'Platform App Key does not belong to this app.' }, { status: 403 });
      }

      return NextResponse.json({
        ok: true,
        app: {
          id: brokerAuth.app.id,
          appCode: brokerAuth.app.appCode,
          environment: brokerAuth.app.environment,
        },
      });
    }

    if (action !== 'rotate' && action !== 'regenerate') {
      return NextResponse.json({ error: 'invalid_action', message: 'Unsupported Platform App Key action.' }, { status: 400 });
    }

    const result = await rotatePlatformAppKey({
      appId: id,
      actorEmail: auth.session?.email ?? null,
    });

    if (!result) {
      return NextResponse.json({ error: 'app_not_found', message: 'App not found.' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      app: {
        id: result.app.id,
        appCode: result.app.appCode,
      },
      platformAppKey: {
        plaintext: result.plaintext,
        masked: result.masked,
        keyPrefix: result.keyPrefix,
        keyLast4: result.keyLast4,
        scopes: result.scopes,
      },
    });
  } catch (err) {
    return handlePlatformRegistryError('platform-app-access/apps/[id]/platform-key:POST', err);
  }
}