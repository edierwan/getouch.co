import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createDegradedVoiceDashboardStatus, getVoiceDashboardStatus } from '@/lib/service-endpoints-voice';
import { emptyVoiceConsoleExtras, getVoiceConsoleExtras } from '@/lib/voice-console-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET() {
  const response = await requireAdmin();
  if (response) return response;

  try {
    const [dashboard, extras] = await Promise.all([
      getVoiceDashboardStatus(),
      getVoiceConsoleExtras(),
    ]);
    return NextResponse.json({ ...dashboard, extras }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load FusionPBX voice service endpoint status';
    return NextResponse.json(
      { ...createDegradedVoiceDashboardStatus(message), extras: emptyVoiceConsoleExtras(message) },
      { headers: { 'Cache-Control': 'no-store', 'X-Getouch-Degraded': '1' } },
    );
  }
}