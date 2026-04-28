import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionInstances, evolutionTenantBindings } from '@/lib/schema';
import {
  getEvolutionConfig,
  getOverviewStats,
  getSystemHealth,
  listRecentEvents,
} from '@/lib/evolution';
import { requireAdmin } from './_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const [stats, instances, tenants, events, health] = await Promise.all([
      getOverviewStats(),
      db.select().from(evolutionInstances).orderBy(desc(evolutionInstances.createdAt)).limit(10),
      db.select().from(evolutionTenantBindings).orderBy(desc(evolutionTenantBindings.updatedAt)).limit(10),
      listRecentEvents(8),
      getSystemHealth(),
    ]);

    return NextResponse.json({
      config: getEvolutionConfig(),
      stats,
      instances: instances.map(sanitizeInstance),
      tenants,
      events,
      systemHealth: health,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[evolution][overview] failed:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

function sanitizeInstance(i: typeof evolutionInstances.$inferSelect) {
  return {
    ...i,
    // never echo secrets even if accidentally stored in metadata
    metadata: redact(i.metadata as Record<string, unknown>),
  };
}

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    out[k] = /key|secret|token|password/i.test(k) ? '***' : v;
  }
  return out;
}
