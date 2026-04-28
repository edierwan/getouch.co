import { NextResponse } from 'next/server';
import { sql as dsql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { evolutionMessageLogs, evolutionSessions, evolutionWebhooks } from '@/lib/schema';
import { requireAdmin } from '../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [series, byTenant, byStatus, sessionTrend, webhookHealth] = await Promise.all([
    // messages per day, last 7d
    db.execute(dsql`
      select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
             count(*) as total,
             count(*) filter (where status = 'failed') as failed
      from evolution_message_logs
      where created_at >= ${since7d}
      group by 1 order by 1 asc
    `),
    db.execute(dsql`
      select tenant_id, count(*) as total
      from evolution_message_logs
      where created_at >= ${since7d}
      group by tenant_id
      order by total desc
      limit 10
    `),
    db.select({
      total: dsql<number>`count(*)`,
      sent: dsql<number>`count(*) filter (where status in ('sent','delivered','read'))`,
      failed: dsql<number>`count(*) filter (where status = 'failed')`,
      received: dsql<number>`count(*) filter (where status = 'received')`,
    }).from(evolutionMessageLogs),
    db.select({
      total: dsql<number>`count(*)`,
      connected: dsql<number>`count(*) filter (where status = 'connected')`,
    }).from(evolutionSessions),
    db.select({
      total: dsql<number>`count(*)`,
      active: dsql<number>`count(*) filter (where status = 'active')`,
      failing: dsql<number>`count(*) filter (where status = 'failing')`,
      deliveries: dsql<number>`coalesce(sum(delivery_count), 0)`,
      failures: dsql<number>`coalesce(sum(failure_count), 0)`,
    }).from(evolutionWebhooks),
  ]);

  const totals = byStatus[0] ?? { total: 0, sent: 0, failed: 0, received: 0 };
  const successRate = Number(totals.total) > 0
    ? Math.round((Number(totals.sent) / Number(totals.total)) * 1000) / 10
    : null;

  return NextResponse.json({
    timeSeries: series,
    topTenants: byTenant,
    totals,
    successRate,
    sessionTrend: sessionTrend[0] ?? { total: 0, connected: 0 },
    webhookHealth: webhookHealth[0] ?? { total: 0, active: 0, failing: 0, deliveries: 0, failures: 0 },
  });
}
