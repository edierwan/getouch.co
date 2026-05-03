import { and, eq, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authorizePlatformAppRequest, PLATFORM_BROKER_DEPENDENCY_FAILURE_STATUS } from '@/lib/platform-broker';
import { forwardPlatformAiChat } from '@/lib/platform-ai';
import { platformAppServiceCapabilities } from '@/lib/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function verifyAiCapability(appId: string) {
  const rows = await db
    .select({
      serviceName: platformAppServiceCapabilities.serviceName,
      capabilityStatus: platformAppServiceCapabilities.capabilityStatus,
    })
    .from(platformAppServiceCapabilities)
    .where(and(
      eq(platformAppServiceCapabilities.appId, appId),
      inArray(platformAppServiceCapabilities.serviceName, ['litellm', 'vllm']),
    ));

  const blocked = rows.find((row) => row.capabilityStatus === 'disabled');
  if (blocked) {
    return {
      ok: false as const,
      status: 403,
      error: 'platform_ai_disabled',
      message: `${blocked.serviceName} access is disabled for this app.`,
    };
  }

  const degraded = rows.find((row) => row.capabilityStatus === 'error');
  if (degraded) {
    return {
      ok: false as const,
      status: PLATFORM_BROKER_DEPENDENCY_FAILURE_STATUS,
      error: 'platform_ai_dependency_error',
      message: `${degraded.serviceName} capability is marked as error for this app.`,
    };
  }

  return { ok: true as const };
}

export async function POST(req: NextRequest) {
  const auth = await authorizePlatformAppRequest(req.headers, 'platform:ai');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error, message: auth.message }, { status: auth.status });
  }

  const capability = await verifyAiCapability(auth.app.id);
  if (!capability.ok) {
    return NextResponse.json({ error: capability.error, message: capability.message }, { status: capability.status });
  }

  const body = await req.json().catch(() => null);
  return forwardPlatformAiChat({
    appCode: auth.app.appCode,
    body,
  });
}