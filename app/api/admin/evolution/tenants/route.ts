import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionTenantBindings } from '@/lib/schema';
import { listTenantBindings, recordEvent } from '@/lib/evolution';
import { requireAdmin } from '../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLAN_VALUES = new Set(['trial', 'starter', 'pro', 'business', 'enterprise']);
const STATUS_VALUES = new Set(['active', 'suspended', 'pending']);

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const tenants = await listTenantBindings();
  return NextResponse.json({ tenants });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const tenantId = String(body.tenantId ?? '').trim();
  if (!/^[0-9a-f-]{32,40}$/i.test(tenantId)) {
    return NextResponse.json({ error: 'tenant_id_invalid' }, { status: 400 });
  }
  const tenantName = typeof body.tenantName === 'string' ? body.tenantName.slice(0, 160) : null;
  const tenantDomain = typeof body.tenantDomain === 'string' ? body.tenantDomain.slice(0, 255) : null;
  const instanceId = typeof body.instanceId === 'string' && body.instanceId ? body.instanceId : null;
  const plan = PLAN_VALUES.has(String(body.plan)) ? (body.plan as 'trial') : 'trial';
  const status = STATUS_VALUES.has(String(body.status)) ? (body.status as 'active') : 'active';

  // upsert
  const existing = await db.select().from(evolutionTenantBindings).where(eq(evolutionTenantBindings.tenantId, tenantId)).limit(1);
  let row;
  if (existing.length === 0) {
    [row] = await db.insert(evolutionTenantBindings).values({
      tenantId, tenantName, tenantDomain, instanceId, plan, status,
    }).returning();
  } else {
    [row] = await db.update(evolutionTenantBindings).set({
      tenantName: tenantName ?? existing[0].tenantName,
      tenantDomain: tenantDomain ?? existing[0].tenantDomain,
      instanceId, plan, status, updatedAt: new Date(),
    }).where(eq(evolutionTenantBindings.tenantId, tenantId)).returning();
  }

  await recordEvent({
    eventType: 'tenant.bound',
    summary: `Tenant ${tenantId.slice(0, 8)} bound to instance`,
    actorEmail: auth.session?.email ?? null,
    tenantId, instanceId,
    payload: { plan, status },
  });

  return NextResponse.json({ tenant: row });
}
