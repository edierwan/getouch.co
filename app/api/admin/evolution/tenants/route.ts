import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionInstances, evolutionTenantBindings } from '@/lib/schema';
import {
  buildUniqueEvolutionTenantKey,
  DEFAULT_INTERNAL_EVOLUTION_TENANT_KEY,
  listTenantBindings,
  recordEvent,
} from '@/lib/evolution';
import { requireAdmin } from '../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLAN_VALUES = new Set(['trial', 'starter', 'pro', 'business', 'enterprise']);
const STATUS_VALUES = new Set(['active', 'suspended', 'pending']);

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const tenants = await listTenantBindings();
  const sortedTenants = [...tenants].sort((left, right) => {
    const leftInternal = left.tenantKey === DEFAULT_INTERNAL_EVOLUTION_TENANT_KEY;
    const rightInternal = right.tenantKey === DEFAULT_INTERNAL_EVOLUTION_TENANT_KEY;
    if (leftInternal === rightInternal) return 0;
    return leftInternal ? -1 : 1;
  });
  const defaultTenant = sortedTenants.find((tenant) => tenant.tenantKey === DEFAULT_INTERNAL_EVOLUTION_TENANT_KEY) ?? null;
  return NextResponse.json({ tenants: sortedTenants, defaultTenantId: defaultTenant?.tenantId ?? null });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const tenantName = String(body.tenantName ?? '').trim();
  if (!tenantName || tenantName.length > 160) {
    return NextResponse.json({ error: 'tenant_name_required' }, { status: 400 });
  }

  const tenantDomain = typeof body.tenantDomain === 'string'
    ? body.tenantDomain.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase().slice(0, 255) || null
    : null;
  const instanceId = typeof body.instanceId === 'string' && body.instanceId ? body.instanceId : null;
  const plan = PLAN_VALUES.has(String(body.plan)) ? (body.plan as 'trial') : 'trial';
  const status = STATUS_VALUES.has(String(body.status)) ? (body.status as 'active') : 'active';
  const requestedTenantKey = typeof body.tenantKey === 'string' ? body.tenantKey.trim() : '';

  if (instanceId) {
    const [instance] = await db.select({ id: evolutionInstances.id }).from(evolutionInstances).where(eq(evolutionInstances.id, instanceId)).limit(1);
    if (!instance) return NextResponse.json({ error: 'instance_not_found' }, { status: 404 });
  }

  const tenantKey = await buildUniqueEvolutionTenantKey(requestedTenantKey || tenantName);
  const [row] = await db.insert(evolutionTenantBindings).values({
    tenantId: randomUUID(),
    tenantKey,
    tenantName,
    tenantDomain,
    instanceId,
    plan,
    status,
    metadata: { internal: false },
  }).returning();

  await recordEvent({
    eventType: 'tenant.bound',
    summary: `Tenant "${tenantName}" created`,
    actorEmail: auth.session?.email ?? null,
    tenantId: row.tenantId,
    instanceId,
    payload: { tenantKey, plan, status },
  });

  return NextResponse.json({ tenant: row });
}
