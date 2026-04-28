import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionSettings } from '@/lib/schema';
import { getEvolutionConfig, getSettings, recordEvent } from '@/lib/evolution';
import { requireAdmin } from '../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_EVENTS = new Set([
  'message.received', 'message.sent', 'message.failed',
  'session.connected', 'session.disconnected', 'qr.updated',
]);

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const settings = await getSettings();
  return NextResponse.json({
    settings,
    config: getEvolutionConfig(),
    apiKeyManagerScopes: ['whatsapp:send', 'whatsapp:read', 'whatsapp:session', 'whatsapp:webhook', 'whatsapp:admin'],
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const updates: Partial<typeof evolutionSettings.$inferInsert> = {
    updatedAt: new Date(),
    updatedByEmail: auth.session?.email ?? null,
  };
  if (Array.isArray(body.defaultWebhookEvents)) {
    updates.defaultWebhookEvents = (body.defaultWebhookEvents as unknown[])
      .map(String).filter((e) => ALLOWED_EVENTS.has(e));
  }
  if (typeof body.retryMaxAttempts === 'number' && body.retryMaxAttempts >= 0 && body.retryMaxAttempts <= 50) {
    updates.retryMaxAttempts = Math.floor(body.retryMaxAttempts);
  }
  if (typeof body.rateLimitPerMinute === 'number' && body.rateLimitPerMinute > 0 && body.rateLimitPerMinute <= 10000) {
    updates.rateLimitPerMinute = Math.floor(body.rateLimitPerMinute);
  }
  if (typeof body.sessionLimitPerTenant === 'number' && body.sessionLimitPerTenant > 0 && body.sessionLimitPerTenant <= 1000) {
    updates.sessionLimitPerTenant = Math.floor(body.sessionLimitPerTenant);
  }
  if (typeof body.tenantIsolationStrict === 'boolean') updates.tenantIsolationStrict = body.tenantIsolationStrict;
  if (typeof body.maintenanceMode === 'boolean') updates.maintenanceMode = body.maintenanceMode;

  await db.update(evolutionSettings).set(updates).where(eq(evolutionSettings.id, 1));
  const settings = await getSettings();

  await recordEvent({
    eventType: 'settings.updated',
    summary: 'Evolution settings updated',
    actorEmail: auth.session?.email ?? null,
    payload: { fields: Object.keys(updates) },
  });

  return NextResponse.json({ settings });
}
