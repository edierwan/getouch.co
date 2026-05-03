import { NextRequest, NextResponse } from 'next/server';
import { authorizePlatformAppRequest } from '@/lib/platform-broker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await authorizePlatformAppRequest(req.headers, 'platform:auth');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error, message: auth.message }, { status: auth.status });
  }

  return NextResponse.json({
    ok: true,
    app_code: auth.app.appCode,
    environment: auth.app.environment,
    ecosystem_access: 'enabled',
  });
}