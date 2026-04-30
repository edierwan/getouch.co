import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { runFusionPbxHealthCheck, runVoiceApiHealthCheck } from '@/lib/service-endpoints-voice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function POST() {
  const response = await requireAdmin();
  if (response) return response;

  try {
    const [pbx, voiceApi] = await Promise.all([
      runFusionPbxHealthCheck(),
      runVoiceApiHealthCheck(),
    ]);

    return NextResponse.json({
      ok: pbx.ok && voiceApi.ok,
      message: `PBX: ${pbx.message} Voice API: ${voiceApi.message}`,
      checks: { pbx, voiceApi },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to run FusionPBX health check';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}