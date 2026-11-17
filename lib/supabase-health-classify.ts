/**
 * Pure classifiers for Supabase stack health (GETOUCH-UAT-001).
 * No imports, so they can be unit-tested with `node --test --experimental-strip-types`.
 */

export type HealthTone = 'healthy' | 'active' | 'warning' | 'critical' | 'info';

export type ComponentHealth = {
  label: string;
  tone: HealthTone;
  detail: string;
  ok: boolean;
};

export type StudioAccess = ComponentHealth & {
  /** Only true when a live probe proved Cloudflare Access protects this exact hostname. */
  enabled: boolean;
  url: string | null;
};

export const STUDIO_NOT_CONFIGURED = 'Studio access not configured';

/** Kong without an API key must reject with 401 ("No API key found in request"). */
export function classifyGateway(code: number | null): ComponentHealth {
  if (code === 401) {
    return { label: 'ONLINE', tone: 'healthy', ok: true, detail: 'Kong rejects requests without an API key (401), as expected.' };
  }
  if (code === null) return { label: 'UNREACHABLE', tone: 'critical', ok: false, detail: 'Gateway did not answer.' };
  if (code === 200) {
    return { label: 'OPEN', tone: 'critical', ok: false, detail: 'Gateway answered 200 without an API key — key enforcement is not working.' };
  }
  return { label: `ERROR (${code})`, tone: 'critical', ok: false, detail: `Unexpected status ${code} without an API key.` };
}

/** GoTrue /auth/v1/health called with the stack's anon key. */
export function classifyAuth(code: number | null): ComponentHealth {
  if (code === 200) return { label: 'HEALTHY', tone: 'healthy', ok: true, detail: 'GoTrue /auth/v1/health answered 200 with an authorized key.' };
  if (code === null) return { label: 'NOT CHECKED', tone: 'info', ok: false, detail: 'Authenticated check unavailable (host probe failed).' };
  return { label: `FAILING (${code})`, tone: 'critical', ok: false, detail: `GoTrue health returned ${code} with an authorized key.` };
}

/** PostgREST /rest/v1/ called with the stack's anon key. */
export function classifyRest(code: number | null): ComponentHealth {
  if (code === 200) return { label: 'HEALTHY', tone: 'healthy', ok: true, detail: 'PostgREST answered 200 with an authorized key.' };
  if (code === null) return { label: 'NOT CHECKED', tone: 'info', ok: false, detail: 'Authenticated check unavailable (host probe failed).' };
  return { label: `FAILING (${code})`, tone: 'critical', ok: false, detail: `PostgREST returned ${code} with an authorized key.` };
}

/** `pg_isready` output from the stack's database container. */
export function classifyDatabase(pgIsReady: string | null): ComponentHealth {
  if (pgIsReady === null) return { label: 'NOT CHECKED', tone: 'info', ok: false, detail: 'Host probe unavailable.' };
  if (/accepting connections/.test(pgIsReady)) {
    return { label: 'READY', tone: 'healthy', ok: true, detail: 'pg_isready: accepting connections.' };
  }
  return { label: 'NOT READY', tone: 'critical', ok: false, detail: `pg_isready: ${pgIsReady.slice(0, 120) || 'no output'}` };
}

/**
 * Studio is only offered when the planned hostname redirects to Cloudflare Access for that same hostname.
 * Anything else (no DNS, 503 from the proxy, or — worst case — a 200 straight from Studio) keeps the button disabled.
 */
export function classifyStudio(
  studioUrl: string | null,
  probe: { code: number | null; location: string | null; error?: string | null },
  accessTeamHost = 'getouch.cloudflareaccess.com',
): StudioAccess {
  const off = (label: string, tone: HealthTone, detail: string): StudioAccess => ({
    label, tone, detail, ok: false, enabled: false, url: null,
  });
  if (!studioUrl) return off('NOT CONFIGURED', 'info', STUDIO_NOT_CONFIGURED);

  let host = '';
  try {
    host = new URL(studioUrl).hostname;
  } catch {
    return off('NOT CONFIGURED', 'info', STUDIO_NOT_CONFIGURED);
  }

  if (probe.code === null) return off('NOT CONFIGURED', 'info', `${STUDIO_NOT_CONFIGURED} (${host} does not resolve or is unreachable).`);

  if ((probe.code === 302 || probe.code === 303) && probe.location) {
    try {
      const loc = new URL(probe.location);
      if (loc.hostname === accessTeamHost && loc.pathname === `/cdn-cgi/access/login/${host}`) {
        return {
          label: 'ACCESS-PROTECTED', tone: 'healthy', ok: true, enabled: true, url: studioUrl,
          detail: `Cloudflare Access login required for ${host}.`,
        };
      }
    } catch {
      /* fall through */
    }
  }

  if (probe.code >= 200 && probe.code < 300) {
    return off('UNPROTECTED — BLOCKED', 'critical', `${host} served content without Cloudflare Access; Studio link withheld.`);
  }
  return off('NOT CONFIGURED', 'info', `${STUDIO_NOT_CONFIGURED} (${host} answered ${probe.code} instead of a Cloudflare Access login).`);
}

/** Overall stack label: never ONLINE unless gateway, auth, REST and database all passed. */
export function summarizeStack(parts: ComponentHealth[]): ComponentHealth {
  if (parts.every((p) => p.ok)) return { label: 'ONLINE', tone: 'healthy', ok: true, detail: 'Gateway, auth, REST and database checks passed.' };
  if (parts.some((p) => p.tone === 'critical')) return { label: 'DEGRADED', tone: 'critical', ok: false, detail: 'One or more checks failed.' };
  return { label: 'PARTIAL', tone: 'warning', ok: false, detail: 'Some checks could not run.' };
}

// Fixed allowlist: only these container prefixes / ids may be interpolated into the host script.
export const ALLOWED_PREFIXES = new Set(['getouch-sso', 'serapod-preprod']);
const SAFE_ID = /^[a-z0-9-]+$/;

/**
 * Host-side check script (run over the portal's existing SSH channel). The anon key is read on the host from the
 * stack's own Studio container and never leaves it; only status codes and pg_isready output are returned.
 */
export function buildSupabaseHostScript(targets: { id: string; apiUrl: string; containerPrefix: string }[]): string {
  const lines = targets
    .filter((t) => ALLOWED_PREFIXES.has(t.containerPrefix) && SAFE_ID.test(t.id))
    .map((t) => {
      const api = new URL(t.apiUrl).origin;
      return `check '${t.id}' '${t.containerPrefix}' '${api}'`;
    });
  return `set -u
check() {
  id="$1"; p="$2"; api="$3"
  key=$(docker inspect "$p-studio" -f '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | sed -n 's/^SUPABASE_ANON_KEY=//p' | head -1)
  if [ -n "$key" ]; then
    a=$(curl -s -o /dev/null -m 8 -w '%{http_code}' -H "apikey: $key" "$api/auth/v1/health" || echo 0)
    r=$(curl -s -o /dev/null -m 8 -w '%{http_code}' -H "apikey: $key" -H "Authorization: Bearer $key" "$api/rest/v1/" || echo 0)
  else a=0; r=0; fi
  d=$(docker exec "$p-db" pg_isready -h 127.0.0.1 2>&1 | tail -1 | tr -d '"\\\\')
  printf '{"id":"%s","auth":%s,"rest":%s,"db":"%s"}\\n' "$id" "$a" "$r" "$d"
}
${lines.join('\n')}
`;
}

