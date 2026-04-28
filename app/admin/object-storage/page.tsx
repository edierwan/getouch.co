import { PageIntro, InfoPanel, ServicePanel, ActionBar } from '../ui';
import type { ResourceRow } from '../data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type VolumeStatus = {
  ok: boolean;
  total: number | null;
  free: number | null;
  active: number | null;
  error?: string;
};

async function fetchVolumeStatus(): Promise<VolumeStatus> {
  const url = process.env.SEAWEED_MASTER_STATUS_URL ?? 'http://seaweed-master:9333/dir/status';
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (!res.ok) {
      return { ok: false, total: null, free: null, active: null, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as { Topology?: { Max?: number; Free?: number; Active?: number } };
    const topology = json.Topology ?? {};
    return {
      ok: true,
      total: topology.Max ?? null,
      free: topology.Free ?? null,
      active: topology.Active ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      total: null,
      free: null,
      active: null,
      error: err instanceof Error ? err.message : 'fetch_failed',
    };
  }
}

const SERVICES: ResourceRow[] = [
  {
    name: 'Filestash console',
    description: 'Operator UI for browsing buckets (custom login at /s3-login.html).',
    type: 'CONSOLE',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://s3.getouch.co',
  },
  {
    name: 'S3 API gateway',
    description: 'S3-compatible endpoint used by applications (AWS SDK).',
    type: 'API',
    status: 'ONLINE',
    tone: 'healthy',
    href: 'https://s3api.getouch.co',
  },
  {
    name: 'Master',
    description: 'seaweed-master:9333 — internal-only, not publicly exposed.',
    type: 'INTERNAL',
    status: 'INTERNAL',
    tone: 'active',
  },
  {
    name: 'Volume',
    description: 'seaweed-volume:8080 — bind-mount /srv/archive/seaweedfs/volume, max=200.',
    type: 'INTERNAL',
    status: 'INTERNAL',
    tone: 'active',
  },
  {
    name: 'Filer',
    description: 'seaweed-filer:8888 — internal-only.',
    type: 'INTERNAL',
    status: 'INTERNAL',
    tone: 'active',
  },
];

const ACTIONS = [
  { label: 'Open Filestash', href: 'https://s3.getouch.co', external: true },
  { label: 'WAPI tenant view', href: 'https://wa.getouch.co/admin/storage', external: true },
];

export default async function ObjectStoragePage() {
  const status = await fetchVolumeStatus();

  return (
    <div className="portal-body">
      <PageIntro
        title="Object Storage"
        subtitle="Self-hosted SeaweedFS, S3-compatible. One filer + one volume + S3 gateway, fronted by Caddy. Used by news-media, WAPI tenant uploads, and operator scratch space."
      />

      <ActionBar actions={ACTIONS} />

      <InfoPanel
        title="VOLUME HEALTH"
        rows={[
          { label: 'Reachable', value: status.ok ? 'Yes' : `No (${status.error ?? 'unknown'})` },
          { label: 'Max volumes', value: status.total != null ? String(status.total) : '—' },
          { label: 'Free volumes', value: status.free != null ? String(status.free) : '—' },
          { label: 'Active nodes', value: status.active != null ? String(status.active) : '—' },
          { label: 'Source', value: 'seaweed-master:9333/dir/status' },
        ]}
      />

      <ServicePanel title="ENDPOINTS" rows={SERVICES} />

      <InfoPanel
        title="BUCKETS"
        rows={[
          { label: 'myfiles', value: 'Filestash personal scratch (operator UI default).' },
          { label: 'news-media', value: 'News CMS media uploads.' },
          { label: 'test-bucket', value: 'Smoke-test bucket; do not delete (used by ops scripts).' },
          { label: 'wapi-assets', value: 'WAPI multi-tenant uploads. Prefix: tenants/{tenantId}/...' },
        ]}
      />

      <InfoPanel
        title="IDENTITIES"
        rows={[
          { label: 'admin', value: 'Cluster-wide. Operator-only. Never used by application code.' },
          { label: 'wapi-app', value: 'Bucket-scoped to wapi-assets only. Used by WAPI app; cannot read other buckets.' },
        ]}
      />

      <InfoPanel
        title="RUNBOOK"
        rows={[
          {
            label: 'Add identity',
            value: 'Edit /home/deploy/apps/getouch.co/infra/seaweedfs/s3.json on host, append entry, then docker compose restart seaweed-s3.',
          },
          {
            label: 'Rotate secret',
            value: 'Replace credentials block in s3.json, restart s3 gateway, update consumer env.',
          },
          {
            label: 'Smoke test',
            value: 'aws-cli PUT/GET/LIST/DEL on the scoped bucket; AccessDenied on others.',
          },
          {
            label: 'Full procedure',
            value: 'getouch.co/docs/s3-object-storage-2026-04-26.md',
          },
        ]}
      />
    </div>
  );
}
