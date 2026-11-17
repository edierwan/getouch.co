import { sql } from 'drizzle-orm';
import { db } from './db';
import type { PlatformDisplayStatus } from './platform-service-shared';

/**
 * Evidence-based probes for the Databases page (SERAPOD-INFRA-007).
 * Every label here comes from a live check made while rendering the page; nothing is hardcoded ONLINE.
 */

export type DatabaseProbes = {
  checkedAt: string;
  postgres: PlatformDisplayStatus;
  pgadmin: PlatformDisplayStatus;
};

const PROBE_TIMEOUT_MS = 5000;

async function fetchStatus(url: string): Promise<{ code: number; location: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: 'no-store', redirect: 'manual', signal: controller.signal });
    return { code: res.status, location: res.headers.get('location') };
  } finally {
    clearTimeout(timer);
  }
}

async function probePostgres(): Promise<PlatformDisplayStatus> {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return { label: 'HEALTHY', tone: 'healthy', detail: `Portal connection answered select 1 in ${Date.now() - started} ms.` };
  } catch (error) {
    return { label: 'OFFLINE', tone: 'critical', detail: error instanceof Error ? error.message : 'Query failed.' };
  }
}

async function probePgAdmin(): Promise<PlatformDisplayStatus> {
  try {
    const { code, location } = await fetchStatus('https://db.getouch.co/');
    if ((code === 302 || code === 303) && location?.includes('cloudflareaccess.com')) {
      return {
        label: 'ACCESS-PROTECTED',
        tone: 'info',
        detail: 'Route is live behind Cloudflare Access. The pgAdmin login itself is not probed from the portal.',
      };
    }
    return { label: `UNEXPECTED (${code})`, tone: 'warning', detail: 'Expected a Cloudflare Access redirect on db.getouch.co.' };
  } catch (error) {
    return { label: 'UNREACHABLE', tone: 'critical', detail: error instanceof Error ? error.message : 'Request failed.' };
  }
}

// Supabase stacks are probed separately in lib/supabase-stack-health.ts (GETOUCH-UAT-001).
export async function getDatabaseProbes(): Promise<DatabaseProbes> {
  const [postgres, pgadmin] = await Promise.all([probePostgres(), probePgAdmin()]);
  return { checkedAt: new Date().toISOString(), postgres, pgadmin };
}
