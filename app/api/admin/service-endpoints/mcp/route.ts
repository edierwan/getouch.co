import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  createMcpAccessKey,
  createMcpServerRegistration,
  getMcpDashboardStatus,
  getMcpHealthSnapshot,
} from '@/lib/mcp-service';

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
    const dashboard = await getMcpDashboardStatus();
    return NextResponse.json(dashboard);
  } catch (err) {
    console.error('[mcp-admin][GET] failed:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const action = String(body.action ?? '').toLowerCase();

  try {
    if (action === 'run_health_check') {
      const health = await getMcpHealthSnapshot();
      return NextResponse.json({ ok: true, health });
    }

    if (action === 'generate_access_key') {
      const result = await createMcpAccessKey({
        clientName: String(body.clientName ?? ''),
        clientType: typeof body.clientType === 'string' ? body.clientType : undefined,
        tenantId: typeof body.tenantId === 'string' && body.tenantId.trim() ? body.tenantId.trim() : null,
        keyName: typeof body.keyName === 'string' ? body.keyName : null,
        scopes: Array.isArray(body.scopes) ? body.scopes.map((value) => String(value)) : undefined,
        expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
        actorEmail: auth.session!.email,
        actorUserId: auth.session!.userId,
      });

      return NextResponse.json({ ok: true, ...result });
    }

    if (action === 'register_server') {
      const server = await createMcpServerRegistration({
        name: String(body.name ?? ''),
        slug: typeof body.slug === 'string' ? body.slug : undefined,
        description: typeof body.description === 'string' ? body.description : null,
        runtimeTarget: typeof body.runtimeTarget === 'string' ? body.runtimeTarget : null,
        actorEmail: auth.session!.email,
      });

      return NextResponse.json({ ok: true, server });
    }

    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal_error';
    if (
      message === 'client_name_required' ||
      message === 'server_name_required' ||
      message === 'server_registration_failed'
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error('[mcp-admin][POST] failed:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}