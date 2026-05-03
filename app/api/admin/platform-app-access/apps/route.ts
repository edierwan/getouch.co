import { NextRequest, NextResponse } from 'next/server';
import { createPlatformApp } from '@/lib/platform-app-access-mutations';
import { handlePlatformRegistryError, readJsonBody, requireAdmin } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const body = await readJsonBody(req);
    const result = await createPlatformApp(body);
    return NextResponse.json({
      ok: true,
      app: {
        id: result.app.id,
        appCode: result.app.appCode,
      },
      platformAppKey: {
        plaintext: result.platformAppKey.plaintext,
        masked: result.platformAppKey.masked,
        keyPrefix: result.platformAppKey.keyPrefix,
        keyLast4: result.platformAppKey.keyLast4,
        scopes: result.platformAppKey.scopes,
      },
    });
  } catch (err) {
    return handlePlatformRegistryError('platform-app-access/apps:POST', err);
  }
}