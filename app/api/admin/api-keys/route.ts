import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  createApiKey,
  getApiKeyStats,
  getApiKeyPepperStatus,
  getGatewayServices,
  getSecretInventory,
  listApiKeys,
  listRecentAudit,
  SCOPE_CATALOG,
} from '@/lib/api-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (session.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const [keys, stats, audit] = await Promise.all([
      listApiKeys(),
      getApiKeyStats(),
      listRecentAudit(10),
    ]);

    // Never include keyHash in API responses
    const sanitized = keys.map((k) => ({
      id: k.id,
      name: k.name,
      tenantId: k.tenantId,
      environment: k.environment,
      keyPrefix: k.keyPrefix,
      status: k.status,
      services: k.services as string[],
      scopes: k.scopes as string[],
      allowedOrigins: k.allowedOrigins as string[],
      validationSource: k.validationSource,
      rateLimitCount: k.rateLimitCount,
      rateLimitWindowSeconds: k.rateLimitWindowSeconds,
      notes: k.notes,
      createdAt: k.createdAt,
      createdByEmail: k.createdByEmail,
      expiresAt: k.expiresAt,
      lastUsedAt: k.lastUsedAt,
      lastUsedService: k.lastUsedService,
      revokedAt: k.revokedAt,
    }));

    const gateways = getGatewayServices();

    return NextResponse.json({
      stats: { ...stats, gatewayServices: gateways.length },
      keys: sanitized,
      audit,
      gateways,
      secretInventory: getSecretInventory(),
      scopeCatalog: SCOPE_CATALOG,
      services: ['ai', 'whatsapp', 'voice', 'webhooks', 'internal'],
      hashing: getApiKeyPepperStatus(),
    });
  } catch (err) {
    console.error('[api-keys][GET] failed:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });
  if (name.length > 200) return NextResponse.json({ error: 'name_too_long' }, { status: 400 });

  const environment = body.environment === 'test' ? 'test' : 'live';
  const tenantId = typeof body.tenantId === 'string' && body.tenantId.length > 0 ? body.tenantId : null;

  const services = Array.isArray(body.services)
    ? (body.services as unknown[]).map((s) => String(s)).filter(Boolean).slice(0, 16)
    : [];
  const scopes = Array.isArray(body.scopes)
    ? (body.scopes as unknown[]).map((s) => String(s)).filter(Boolean).slice(0, 64)
    : [];
  const allowedOrigins = Array.isArray(body.allowedOrigins)
    ? (body.allowedOrigins as unknown[]).map((s) => String(s)).filter(Boolean).slice(0, 16)
    : [];

  const rateLimitCount = Number.isFinite(body.rateLimitCount) ? Number(body.rateLimitCount) : null;
  const rateLimitWindowSeconds = Number.isFinite(body.rateLimitWindowSeconds)
    ? Number(body.rateLimitWindowSeconds)
    : null;

  let expiresAt: Date | null = null;
  if (typeof body.expiresAt === 'string' && body.expiresAt.length > 0) {
    const parsed = new Date(body.expiresAt);
    if (Number.isFinite(parsed.getTime())) expiresAt = parsed;
  }

  try {
    const { row, plaintext } = await createApiKey({
      name,
      environment,
      tenantId,
      services,
      scopes,
      allowedOrigins,
      rateLimitCount,
      rateLimitWindowSeconds,
      expiresAt,
      createdByEmail: auth.session!.email,
      createdByUserId: auth.session!.userId,
    });

    return NextResponse.json({
      ok: true,
      // The full plaintext is shown ONCE here. Never persisted, never returned again.
      plaintext,
      key: {
        id: row.id,
        name: row.name,
        environment: row.environment,
        keyPrefix: row.keyPrefix,
        status: row.status,
        services: row.services,
        scopes: row.scopes,
        createdAt: row.createdAt,
      },
    });
  } catch (err) {
    console.error('[api-keys][POST] failed:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
