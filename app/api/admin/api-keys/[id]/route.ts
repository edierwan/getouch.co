import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  getApiKeyById,
  listAuditForKey,
  listUsageForKey,
  rotateApiKey,
  setApiKeyStatus,
} from '@/lib/api-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (session.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { session };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  const row = await getApiKeyById(id);
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const [usage, audit] = await Promise.all([listUsageForKey(id, 50), listAuditForKey(id, 50)]);

  return NextResponse.json({
    key: {
      id: row.id,
      name: row.name,
      environment: row.environment,
      keyPrefix: row.keyPrefix,
      status: row.status,
      services: row.services,
      scopes: row.scopes,
      allowedOrigins: row.allowedOrigins,
      tenantId: row.tenantId,
      createdAt: row.createdAt,
      createdByEmail: row.createdByEmail,
      expiresAt: row.expiresAt,
      lastUsedAt: row.lastUsedAt,
      revokedAt: row.revokedAt,
      validationSource: row.validationSource,
      notes: row.notes,
    },
    usage,
    audit,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* allow empty body */
  }
  const action = String(body.action ?? '').toLowerCase();

  if (action === 'rotate') {
    const result = await rotateApiKey({ id, actorEmail: auth.session!.email });
    if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({
      ok: true,
      plaintext: result.plaintext,
      key: { id: result.row.id, keyPrefix: result.row.keyPrefix, status: result.row.status },
    });
  }

  if (action === 'disable' || action === 'revoke') {
    const status = action === 'disable' ? 'disabled' : 'revoked';
    const row = await setApiKeyStatus({
      id,
      status,
      actorEmail: auth.session!.email,
      reason: typeof body.reason === 'string' ? body.reason : undefined,
    });
    if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, status: row.status });
  }

  if (action === 'enable') {
    const row = await setApiKeyStatus({ id, status: 'active', actorEmail: auth.session!.email });
    if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, status: row.status });
  }

  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
