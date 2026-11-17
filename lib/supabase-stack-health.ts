import { runRemoteScript } from './platform-services';
import {
  buildSupabaseHostScript,
  classifyAuth,
  classifyDatabase,
  classifyGateway,
  classifyRest,
  classifyStudio,
  summarizeStack,
  type ComponentHealth,
  type StudioAccess,
} from './supabase-health-classify';

/**
 * Live, per-stack Supabase health (GETOUCH-UAT-001).
 * - Gateway and Studio are probed from the portal over the public path (Cloudflare → tunnel → Traefik).
 * - Authenticated checks run on the host through the existing portal SSH channel. The anon key is read there from
 *   the stack's own Studio container and never leaves the host; only HTTP status codes come back.
 */

export type SupabaseStackTarget = {
  id: string;
  apiUrl: string;
  /** Docker container name prefix on the host, e.g. `getouch-sso` → getouch-sso-db, getouch-sso-studio. */
  containerPrefix: string;
  /** Planned protected Studio hostname; the button is enabled only if the live probe proves Cloudflare Access. */
  studioUrl: string | null;
};

export type SupabaseStackHealth = {
  overall: ComponentHealth;
  gateway: ComponentHealth;
  auth: ComponentHealth;
  rest: ComponentHealth;
  database: ComponentHealth;
  studio: StudioAccess;
};

export type SupabaseHealthReport = { checkedAt: string; stacks: Record<string, SupabaseStackHealth> };

const TIMEOUT_MS = 5000;

async function probe(url: string): Promise<{ code: number | null; location: string | null; error: string | null }> {
  try {
    const res = await fetch(url, { cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { code: res.status, location: res.headers.get('location'), error: null };
  } catch (error) {
    return { code: null, location: null, error: error instanceof Error ? error.message : 'request failed' };
  }
}

type HostResult = { id: string; auth: number; rest: number; db: string };

async function runHostChecks(targets: SupabaseStackTarget[]): Promise<Record<string, HostResult>> {
  try {
    const out = await runRemoteScript(buildSupabaseHostScript(targets));
    const results: Record<string, HostResult> = {};
    for (const line of out.split('\n')) {
      if (!line.trim().startsWith('{')) continue;
      const parsed = JSON.parse(line) as HostResult;
      results[parsed.id] = parsed;
    }
    return results;
  } catch {
    return {};
  }
}

export async function getSupabaseStackHealth(targets: SupabaseStackTarget[]): Promise<SupabaseHealthReport> {
  const [host, publicProbes] = await Promise.all([
    runHostChecks(targets),
    Promise.all(
      targets.map(async (t) => ({
        id: t.id,
        gateway: await probe(`${new URL(t.apiUrl).origin}/rest/v1/`),
        studio: t.studioUrl ? await probe(t.studioUrl) : { code: null, location: null, error: 'not configured' },
      })),
    ),
  ]);

  const stacks: Record<string, SupabaseStackHealth> = {};
  for (const t of targets) {
    const pub = publicProbes.find((p) => p.id === t.id)!;
    const h = host[t.id];
    const gateway = classifyGateway(pub.gateway.code);
    const auth = classifyAuth(h && h.auth > 0 ? h.auth : null);
    const rest = classifyRest(h && h.rest > 0 ? h.rest : null);
    const database = classifyDatabase(h ? h.db : null);
    const studio = classifyStudio(t.studioUrl, pub.studio);
    stacks[t.id] = { overall: summarizeStack([gateway, auth, rest, database]), gateway, auth, rest, database, studio };
  }
  return { checkedAt: new Date().toISOString(), stacks };
}
