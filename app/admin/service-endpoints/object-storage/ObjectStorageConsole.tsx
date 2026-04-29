'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/* ─── Types ─────────────────────────────────────────────────── */
type TabId = 'overview' | 'buckets' | 'tenants' | 'access-keys' | 'browser' | 'activity' | 'settings';

interface MasterStatus {
  reachable: boolean;
  total: number | null;
  free: number | null;
  active: number | null;
  error?: string;
}

interface Endpoints {
  fileConsole: string;
  s3Api: string;
  internal: string;
  master: string;
  filer: string;
}

interface StorageInfo {
  dataPath: string;
  region: string;
  signatureVersion: string;
  pathStyle: boolean;
  defaultBucket: string;
}

interface BucketInfo {
  name: string;
  objectCount: number | null;
  sizeBytes: number | null;
  createdAt: string | null;
}

interface ActivityEvent {
  id: string;
  eventType: string;
  tenantId: string | null;
  bucket: string | null;
  objectKey: string | null;
  actor: string | null;
  actorKeyPrefix?: string | null;
  sourceIp: string | null;
  status: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

interface OverviewData {
  status: 'online' | 'degraded';
  health: string;
  master: MasterStatus;
  endpoints: Endpoints;
  storage: StorageInfo;
  metrics: {
    bucketCount: number;
    tenantCount: number;
    activeKeyCount: number;
    totalObjects: number;
    totalUsedBytes: number;
    totalCapacityBytes: number | null;
    freeBytes: number | null;
    activity24hCount: number;
  };
  buckets: BucketInfo[];
  recentActivity: ActivityEvent[];
}

interface TenantMapping {
  id: string;
  tenantId: string;
  tenantName: string | null;
  bucket: string;
  prefix: string;
  services: string[];
  quotaBytes: number | null;
  policy: string;
  retentionDays: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface AccessKey {
  id: string;
  label: string;
  tenantId: string | null;
  bucket: string | null;
  prefix: string | null;
  permission: string;
  keyPrefix: string;
  service: string | null;
  ipAllowlist: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  status: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ObjectEntry {
  name: string;
  fullPath: string;
  isFolder: boolean;
  type: string;
  size: number;
  lastModified: string | null;
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'buckets', label: 'Buckets' },
  { id: 'tenants', label: 'Tenants' },
  { id: 'access-keys', label: 'Access Keys' },
  { id: 'browser', label: 'Browser' },
  { id: 'activity', label: 'Activity' },
  { id: 'settings', label: 'Settings' },
];

type ActionIntent = 'create-bucket' | 'create-access-key' | null;

const SERVICE_OPTIONS = ['whatsapp', 'chatwoot', 'dify', 'voice', 'backups', 'temp', 'media'];
const PERMISSION_OPTIONS = ['read', 'write', 'read-write', 'presign'];

/* ─── Helpers ───────────────────────────────────────────────── */
function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), u.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${u[i]}`;
}

function fmtNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return '—';
  const sec = Math.round((Date.now() - d) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function statusPill(status: string): string {
  const s = status.toLowerCase();
  if (['online', 'healthy', 'active', 'ok', 'connected'].includes(s)) return 'os-pill os-pill-good';
  if (['pending', 'rotating', 'connecting'].includes(s)) return 'os-pill os-pill-info';
  if (['suspended', 'paused', 'archived'].includes(s)) return 'os-pill os-pill-muted';
  if (['revoked', 'expired', 'failed', 'degraded', 'error'].includes(s)) return 'os-pill os-pill-bad';
  return 'os-pill os-pill-muted';
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return JSON.parse(text) as T;
}

function normalizePrefix(value: string) {
  const trimmed = value.replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed ? `${trimmed}/` : '';
}

function normalizeSegment(value: string) {
  return value.replace(/^\/+/, '').replace(/\/+$/, '');
}

/* ─── Top-level component ───────────────────────────────────── */
export function ObjectStorageConsole() {
  const [tab, setTab] = useState<TabId>('overview');
  const [actionIntent, setActionIntent] = useState<ActionIntent>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const reloadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const data = await fetchJson<OverviewData>('/api/admin/object-storage/overview');
      setOverview(data);
      setOverviewError(null);
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : 'load_failed');
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadOverview();
  }, [reloadOverview]);

  const handleConsoleMutation = useCallback(() => {
    void reloadOverview();
  }, [reloadOverview]);

  const openBucketComposer = useCallback(() => {
    setActionIntent('create-bucket');
    setTab('buckets');
  }, []);

  const openAccessKeyComposer = useCallback(() => {
    setActionIntent('create-access-key');
    setTab('access-keys');
  }, []);

  return (
    <div className="os-shell">
      <ConsoleHeader
        overview={overview}
        onCreateBucket={openBucketComposer}
        onCreateAccessKey={openAccessKeyComposer}
      />

      <div className="os-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`os-tab${tab === t.id ? ' os-tab-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {overviewError && tab === 'overview' ? <div className="os-banner os-banner-warn">⚠ {overviewError}</div> : null}

      <div className="os-tabpanel">
        {tab === 'overview' && (
          <OverviewTab
            data={overview}
            loading={overviewLoading}
            onRefresh={reloadOverview}
            onCreateBucket={openBucketComposer}
            onCreateAccessKey={openAccessKeyComposer}
            onSelectTab={setTab}
          />
        )}
        {tab === 'buckets' && (
          <BucketsTab
            onChange={handleConsoleMutation}
            requestedOpen={actionIntent === 'create-bucket'}
            onActionHandled={() => setActionIntent(null)}
          />
        )}
        {tab === 'tenants' && <TenantsTab buckets={overview?.buckets ?? []} onChange={handleConsoleMutation} />}
        {tab === 'access-keys' && (
          <AccessKeysTab
            buckets={overview?.buckets ?? []}
            onChange={handleConsoleMutation}
            requestedOpen={actionIntent === 'create-access-key'}
            onActionHandled={() => setActionIntent(null)}
          />
        )}
        {tab === 'browser' && <BrowserTab buckets={overview?.buckets ?? []} onChange={handleConsoleMutation} />}
        {tab === 'activity' && <ActivityTab />}
        {tab === 'settings' && <SettingsTab data={overview} />}
      </div>

      <ConsoleStyles />
    </div>
  );
}

/* ─── Header ────────────────────────────────────────────────── */
function ConsoleHeader({
  overview,
  onCreateBucket,
  onCreateAccessKey,
}: {
  overview: OverviewData | null;
  onCreateBucket: () => void;
  onCreateAccessKey: () => void;
}) {
  const runtimeLabel = !overview
    ? null
    : overview.metrics.bucketCount === 0 && overview.metrics.tenantCount === 0 && overview.metrics.totalUsedBytes === 0
      ? 'Fresh install'
      : overview.status === 'online'
        ? 'Operational'
        : 'Degraded';

  return (
    <header className="os-page-head">
      <div className="os-page-head-row">
        <div className="os-page-copy">
          <h1 className="os-title">Object Storage Gateway</h1>
          <p className="os-subtitle">
            <code>s3.getouch.co</code> is the file/browser console.{' '}
            <code>s3api.getouch.co</code> is the S3-compatible API endpoint.
          </p>
          <div className="os-badges">
            <span className="os-badge os-badge-violet">◉ Multi-tenant ready</span>
            <span className="os-badge os-badge-cyan">◎ S3 Compatible</span>
            {runtimeLabel ? <span className="os-badge os-badge-emerald">● {runtimeLabel}</span> : null}
          </div>
        </div>
        <div className="os-head-actions">
          <a href="https://s3.getouch.co" target="_blank" rel="noopener noreferrer" className="os-btn os-btn-ghost">
            <span className="os-btn-ico">▤</span> Open File Console
          </a>
          <a
            href="https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html"
            target="_blank"
            rel="noopener noreferrer"
            className="os-btn os-btn-ghost"
          >
            <span className="os-btn-ico">⌨</span> API Docs
          </a>
          <button type="button" className="os-btn os-btn-primary os-btn-primary-soft" onClick={onCreateBucket}>
            <span className="os-btn-ico">＋</span> Create Bucket
          </button>
          <button type="button" className="os-btn os-btn-primary" onClick={onCreateAccessKey}>
            <span className="os-btn-ico">✦</span> Generate Access Key
          </button>
        </div>
      </div>
    </header>
  );
}

/* ─── OVERVIEW TAB ──────────────────────────────────────────── */
function OverviewTab({
  data,
  loading,
  onRefresh,
  onCreateBucket,
  onCreateAccessKey,
  onSelectTab,
}: {
  data: OverviewData | null;
  loading: boolean;
  onRefresh: () => void;
  onCreateBucket: () => void;
  onCreateAccessKey: () => void;
  onSelectTab: (tab: TabId) => void;
}) {
  const [tenantMappings, setTenantMappings] = useState<TenantMapping[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [tenantsDegraded, setTenantsDegraded] = useState(false);
  const [accessKeys, setAccessKeys] = useState<AccessKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [keysDegraded, setKeysDegraded] = useState(false);
  const [previewBucket, setPreviewBucket] = useState('');
  const [previewPrefix, setPreviewPrefix] = useState('');
  const [previewObjects, setPreviewObjects] = useState<ObjectEntry[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const bucketByName = useMemo(
    () => new Map((data?.buckets ?? []).map((bucket) => [bucket.name, bucket])),
    [data?.buckets],
  );
  const previewBreadcrumb = useMemo(() => previewPrefix.split('/').filter(Boolean), [previewPrefix]);

  useEffect(() => {
    if (!data || previewBucket) return;
    const nextBucket = data.storage.defaultBucket || data.buckets[0]?.name || '';
    if (nextBucket) setPreviewBucket(nextBucket);
  }, [data, previewBucket]);

  const loadOverviewCollections = useCallback(async () => {
    if (!data) {
      setTenantMappings([]);
      setAccessKeys([]);
      return;
    }

    setTenantsLoading(true);
    setKeysLoading(true);

    const [tenantResult, keyResult] = await Promise.allSettled([
      fetchJson<{ tenants: TenantMapping[]; degraded?: boolean }>('/api/admin/object-storage/tenants'),
      fetchJson<{ keys: AccessKey[]; degraded?: boolean }>('/api/admin/object-storage/access-keys'),
    ]);

    if (tenantResult.status === 'fulfilled') {
      setTenantMappings(tenantResult.value.tenants);
      setTenantsDegraded(Boolean(tenantResult.value.degraded));
    } else {
      setTenantMappings([]);
      setTenantsDegraded(true);
    }
    setTenantsLoading(false);

    if (keyResult.status === 'fulfilled') {
      setAccessKeys(keyResult.value.keys);
      setKeysDegraded(Boolean(keyResult.value.degraded));
    } else {
      setAccessKeys([]);
      setKeysDegraded(true);
    }
    setKeysLoading(false);
  }, [data]);

  useEffect(() => {
    if (!data) return;
    void loadOverviewCollections();
  }, [data, loadOverviewCollections]);

  const loadPreview = useCallback(async () => {
    if (!data || !previewBucket) {
      setPreviewObjects([]);
      setPreviewError(null);
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const url = new URL('/api/admin/object-storage/objects', window.location.origin);
      url.searchParams.set('bucket', previewBucket);
      if (previewPrefix) url.searchParams.set('prefix', previewPrefix);
      const payload = await fetchJson<{ objects: ObjectEntry[] }>(url.toString());
      setPreviewObjects(payload.objects);
    } catch (err) {
      setPreviewObjects([]);
      setPreviewError(err instanceof Error ? err.message : 'load_failed');
    } finally {
      setPreviewLoading(false);
    }
  }, [data, previewBucket, previewPrefix]);

  useEffect(() => {
    if (!data) return;
    void loadPreview();
  }, [data, loadPreview]);

  async function handlePreviewUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !previewBucket) return;

    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', previewBucket);
      formData.append('prefix', previewPrefix);
      const response = await fetch('/api/admin/object-storage/objects', { method: 'POST', body: formData });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      event.target.value = '';
      await loadPreview();
      onRefresh();
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'upload_failed');
    } finally {
      setPreviewBusy(false);
    }
  }

  async function handlePreviewDelete(key: string) {
    if (!previewBucket) return;
    if (!confirm(`Delete ${key}?`)) return;

    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const url = new URL('/api/admin/object-storage/objects', window.location.origin);
      url.searchParams.set('bucket', previewBucket);
      url.searchParams.set('key', key);
      const response = await fetch(url.toString(), { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      await loadPreview();
      onRefresh();
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'delete_failed');
    } finally {
      setPreviewBusy(false);
    }
  }

  async function handlePreviewCreateFolder() {
    if (!previewBucket) return;
    const folderName = normalizeSegment(prompt('Folder name') ?? '');
    if (!folderName) return;

    setPreviewBusy(true);
    setPreviewError(null);
    try {
      const formData = new FormData();
      const marker = new File([new Uint8Array()], '.keep', { type: 'text/plain' });
      formData.append('file', marker);
      formData.append('bucket', previewBucket);
      formData.append('prefix', `${normalizePrefix(previewPrefix)}${folderName}/`);
      const response = await fetch('/api/admin/object-storage/objects', { method: 'POST', body: formData });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      await loadPreview();
      onRefresh();
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'create_folder_failed');
    } finally {
      setPreviewBusy(false);
    }
  }

  if (loading && !data) return <div className="os-empty">Loading…</div>;
  if (!data) return <div className="os-empty">No data.</div>;

  const { metrics, master, endpoints, storage, buckets, recentActivity } = data;
  const usedPercent =
    metrics.totalCapacityBytes && metrics.totalCapacityBytes > 0
      ? Math.max(0, Math.min(100, Math.round((metrics.totalUsedBytes / metrics.totalCapacityBytes) * 100)))
      : null;
  const statusSubtitle =
    data.status === 'online'
      ? metrics.bucketCount === 0 && metrics.tenantCount === 0 && metrics.totalUsedBytes === 0
        ? 'Fresh install'
        : 'All systems operational'
      : master.error ?? 'Backend unreachable';
  const requestCardSubtitle =
    metrics.activity24hCount > 0
      ? `${fmtNumber(metrics.activity24hCount)} admin events logged`
      : 'No request telemetry wired yet';

  return (
    <div className="os-overview">
      <div className="os-stat-grid">
        <StatCard
          label="STATUS"
          value={data.status === 'online' ? 'Online' : 'Degraded'}
          tone={data.status === 'online' ? 'good' : 'bad'}
          sub={statusSubtitle}
          icon="◉"
        />
        <StatCard
          label="BUCKETS"
          value={fmtNumber(metrics.bucketCount)}
          sub={metrics.bucketCount === 0 ? 'No buckets yet' : `${buckets.length} indexed`}
          icon="▦"
        />
        <StatCard
          label="TENANTS"
          value={fmtNumber(metrics.tenantCount)}
          sub={metrics.tenantCount === 0 ? 'No mappings yet' : 'Active tenant mappings'}
          icon="◌"
        />
        <StatCard
          label="STORAGE USED"
          value={fmtBytes(metrics.totalUsedBytes)}
          sub={metrics.totalCapacityBytes ? `of ${fmtBytes(metrics.totalCapacityBytes)}` : 'Capacity unavailable'}
          icon="▥"
        />
        <StatCard label="REQUESTS (24h)" value="Unavailable" sub={requestCardSubtitle} icon="↗" />
        <StatCard
          label="API HEALTH"
          value={master.reachable ? 'Healthy' : 'Down'}
          tone={master.reachable ? 'good' : 'bad'}
          sub={master.reachable ? 'S3 API operational' : 'Master unreachable'}
          icon="♡"
        />
      </div>

      <div className="os-dashboard-grid">
        <Panel
          title="Tenant Buckets"
          right={
            <div className="os-panel-actions">
              <button type="button" className="os-btn-mini" onClick={() => onSelectTab('tenants')}>Manage tenants</button>
              <button type="button" className="os-btn-mini" onClick={onCreateBucket}>Create bucket</button>
            </div>
          }
        >
          {tenantsLoading ? (
            <div className="os-empty">Loading tenant mappings…</div>
          ) : tenantMappings.length === 0 ? (
            <EmptyState
              title={tenantsDegraded ? 'Tenant mappings unavailable' : 'No tenant storage mappings yet'}
              hint={
                tenantsDegraded
                  ? 'Tenant mapping data needs the latest object-storage migrations.'
                  : 'Assign a Portal tenant to a bucket/prefix to populate this dashboard.'
              }
            />
          ) : (
            <div className="os-table os-table-dashboard-tenants">
              <div className="os-thead">
                <div>Tenant</div>
                <div>Bucket / Prefix</div>
                <div>Region</div>
                <div>Objects</div>
                <div>Usage</div>
                <div>Status</div>
              </div>
              {tenantMappings.slice(0, 8).map((mapping) => {
                const mappedBucket = bucketByName.get(mapping.bucket);
                return (
                  <div key={mapping.id} className="os-tr">
                    <div className="os-bucket-cell">
                      <span className="os-avatar os-avatar-violet">{(mapping.tenantName ?? mapping.tenantId).slice(0, 2).toUpperCase()}</span>
                      <div>
                        <div className="os-strong">{mapping.tenantName ?? mapping.tenantId}</div>
                        <div className="os-muted-sm">{mapping.tenantId}</div>
                      </div>
                    </div>
                    <div className="os-data-stack">
                      <div className="os-strong os-mono">{mapping.bucket}/{mapping.prefix}</div>
                      <div className="os-muted-sm">{(mapping.services ?? []).join(', ') || 'No service scope set'}</div>
                    </div>
                    <div>{storage.region}</div>
                    <div className="os-data-stack">
                      <div>{mappedBucket ? fmtNumber(mappedBucket.objectCount) : 'Unavailable'}</div>
                      <div className="os-muted-sm">bucket total</div>
                    </div>
                    <div className="os-data-stack">
                      <div>{mappedBucket ? fmtBytes(mappedBucket.sizeBytes) : 'Unavailable'}</div>
                      <div className="os-muted-sm">bucket total</div>
                    </div>
                    <div><span className={statusPill(mapping.status)}>{mapping.status}</span></div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Usage & Capacity">
          <div className="os-capacity-row">
            <CapacityRing label="Total Capacity" value={metrics.totalCapacityBytes} accent="#a855f7" />
            <CapacityRing label="Used Storage" value={metrics.totalUsedBytes} accent="#22c55e" />
            <CapacityRing label="Free" value={metrics.freeBytes} accent="#06b6d4" />
          </div>
          <div className="os-capacity-progress-block">
            <div className="os-capacity-progress-head">
              <span>Overall capacity</span>
              <span>{usedPercent === null ? 'Unavailable' : `${usedPercent}% used`}</span>
            </div>
            <div className="os-capacity-progress-track">
              <span style={{ width: usedPercent === null ? '0%' : `${usedPercent}%` }} />
            </div>
          </div>
          <div className="os-metric-grid">
            <MiniMetricCard label="Bucket Objects" value={fmtNumber(metrics.totalObjects)} hint="Across indexed buckets" />
            <MiniMetricCard label="API Traffic (24h)" value="Unavailable" hint="Request telemetry not wired" />
            <MiniMetricCard label="Active Nodes" value={fmtNumber(master.active)} hint="SeaweedFS master status" />
            <MiniMetricCard label="Free Volumes" value={fmtNumber(master.free)} hint="Remaining volume slots" />
          </div>
          <div className="os-divider" />
          <div className="os-info-rows">
            <InfoRow label="Storage path" value={storage.dataPath} mono />
            <InfoRow label="Volumes (max)" value={fmtNumber(master.total)} />
            <InfoRow label="Volumes (free)" value={fmtNumber(master.free)} />
            <InfoRow label="Active nodes" value={fmtNumber(master.active)} />
          </div>
          <div className="os-divider" />
          <div className="os-top-tenants">
            <div className="os-section-label">Top Tenants by Usage</div>
            <EmptyState
              title={tenantMappings.length === 0 ? 'No tenant mappings yet' : 'Per-tenant usage unavailable'}
              hint={
                tenantMappings.length === 0
                  ? 'Tenant usage becomes meaningful after Portal tenant mappings exist.'
                  : 'Bucket totals are available, but per-prefix usage telemetry is not tracked yet.'
              }
            />
          </div>
        </Panel>
      </div>

      <div className="os-dashboard-grid">
        <Panel
          title="Access Keys & Policies"
          right={
            <div className="os-panel-actions">
              <button type="button" className="os-btn-mini" onClick={onCreateAccessKey}>Generate</button>
              <button type="button" className="os-btn-mini" onClick={() => onSelectTab('access-keys')}>View all</button>
            </div>
          }
        >
          {keysLoading ? (
            <div className="os-empty">Loading access keys…</div>
          ) : accessKeys.length === 0 ? (
            <EmptyState
              title={keysDegraded ? 'Access key inventory unavailable' : 'No access keys issued'}
              hint={
                keysDegraded
                  ? 'Access key metadata requires the latest object-storage migrations.'
                  : 'Generate an S3-compatible key to populate this section.'
              }
            />
          ) : (
            <div className="os-table os-table-dashboard-keys">
              <div className="os-thead">
                <div>App / Service</div>
                <div>Tenant</div>
                <div>Key Prefix</div>
                <div>Scope / Policy</div>
                <div>Last Used</div>
                <div>Status</div>
              </div>
              {accessKeys.slice(0, 5).map((key) => (
                <div key={key.id} className="os-tr">
                  <div className="os-data-stack">
                    <div className="os-strong">{key.service ?? key.label}</div>
                    <div className="os-muted-sm">{key.label}</div>
                  </div>
                  <div>{key.tenantId ?? 'Global'}</div>
                  <div className="os-mono">{key.keyPrefix.slice(0, 8)}…{key.keyPrefix.slice(-4)}</div>
                  <div className="os-data-stack">
                    <div className="os-mono">{key.bucket ?? '*'}/{key.prefix ?? '*'}</div>
                    <div className="os-muted-sm">{key.permission}</div>
                  </div>
                  <div>{timeAgo(key.lastUsedAt)}</div>
                  <div><span className={statusPill(key.status)}>{key.status}</span></div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Recent Activity"
          right={<button type="button" className="os-btn-mini" onClick={() => onSelectTab('activity')}>View all</button>}
        >
          {recentActivity.length === 0 ? (
            <EmptyState title="No activity yet" hint="Admin actions appear here." />
          ) : (
            <div className="os-activity-list">
              {recentActivity.map((event) => (
                <div key={event.id} className="os-activity-item">
                  <div className="os-activity-icon">{eventIcon(event.eventType)}</div>
                  <div className="os-activity-body">
                    <div className="os-strong">{humanizeEvent(event.eventType)}</div>
                    <div className="os-muted-sm">
                      {event.bucket ? `${event.bucket}` : '—'}
                      {event.objectKey ? ` · ${event.objectKey}` : ''}
                      {event.tenantId ? ` · tenant ${event.tenantId}` : ''}
                    </div>
                  </div>
                  <div className="os-activity-time">{timeAgo(event.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="os-dashboard-grid">
        <Panel
          title="Object Browser / File Console Preview"
          right={
            <div className="os-panel-actions">
              <button type="button" className="os-btn-mini" onClick={() => onSelectTab('browser')}>Full browser</button>
              <a className="os-btn-mini" href={endpoints.fileConsole} target="_blank" rel="noopener noreferrer">File console</a>
            </div>
          }
        >
          <div className="os-browser-toolbar os-browser-toolbar-compact">
            <select
              className="os-input os-input-narrow"
              value={previewBucket}
              onChange={(event) => {
                setPreviewBucket(event.target.value);
                setPreviewPrefix('');
              }}
            >
              {buckets.length === 0 ? <option value="">— no buckets —</option> : null}
              {buckets.map((bucket) => (
                <option key={bucket.name} value={bucket.name}>{bucket.name}</option>
              ))}
            </select>
            <div className="os-breadcrumb-row">
              <button type="button" className="os-crumb" onClick={() => setPreviewPrefix('')}>{previewBucket || '/'}</button>
              {previewBreadcrumb.map((part, index) => (
                <span key={`${part}-${index}`} className="os-crumb-wrap">
                  <span className="os-crumb-sep">/</span>
                  <button
                    type="button"
                    className="os-crumb"
                    onClick={() => setPreviewPrefix(`${previewBreadcrumb.slice(0, index + 1).join('/')}/`)}
                  >
                    {part}
                  </button>
                </span>
              ))}
            </div>
            <div className="os-spacer" />
            <label className="os-btn os-btn-primary" style={{ cursor: previewBucket ? 'pointer' : 'not-allowed' }}>
              <span className="os-btn-ico">↑</span> {previewBusy ? 'Uploading…' : 'Upload'}
              <input type="file" hidden disabled={!previewBucket || previewBusy} onChange={handlePreviewUpload} />
            </label>
            <button type="button" className="os-btn os-btn-ghost" disabled={!previewBucket || previewBusy} onClick={handlePreviewCreateFolder}>
              <span className="os-btn-ico">▣</span> Create Folder
            </button>
          </div>

          {previewError ? <div className="os-banner os-banner-warn">⚠ {previewError}</div> : null}

          <div className="os-table os-table-objects os-table-preview">
            <div className="os-thead">
              <div>Name</div>
              <div>Type</div>
              <div>Size</div>
              <div>Last Modified</div>
              <div className="os-th-actions">Actions</div>
            </div>
            {previewLoading ? (
              <div className="os-empty">Loading preview…</div>
            ) : !previewBucket ? (
              <EmptyState title="No bucket selected" hint="Create or select a bucket to preview objects." />
            ) : previewObjects.length === 0 ? (
              <EmptyState title="Empty bucket or prefix" hint="Upload a file or create a folder to populate this preview." />
            ) : (
              previewObjects.slice(0, 8).map((object) => (
                <div key={object.fullPath} className="os-tr">
                  <div className="os-bucket-cell">
                    <span className="os-avatar os-avatar-muted">{object.isFolder ? '▥' : '▤'}</span>
                    {object.isFolder ? (
                      <button
                        type="button"
                        className="os-link-strong"
                        onClick={() => setPreviewPrefix(`${normalizePrefix(previewPrefix)}${normalizeSegment(object.name)}/`)}
                      >
                        {object.name}/
                      </button>
                    ) : (
                      <span className="os-strong">{object.name}</span>
                    )}
                  </div>
                  <div className="os-mono os-muted-sm">{object.type}</div>
                  <div>{object.isFolder ? '—' : fmtBytes(object.size)}</div>
                  <div>{timeAgo(object.lastModified)}</div>
                  <div className="os-actions">
                    {object.isFolder ? (
                      <button
                        type="button"
                        className="os-btn-mini"
                        onClick={() => setPreviewPrefix(`${normalizePrefix(previewPrefix)}${normalizeSegment(object.name)}/`)}
                      >
                        Browse
                      </button>
                    ) : (
                      <>
                        <a
                          className="os-btn-mini"
                          href={`https://s3.getouch.co/${previewBucket}/${previewPrefix}${object.name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open
                        </a>
                        <button
                          type="button"
                          className="os-btn-mini os-btn-mini-danger"
                          onClick={() => handlePreviewDelete(previewPrefix ? `${previewPrefix}${object.name}` : object.name)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel title="Endpoints">
          <div className="os-endpoint-grid">
            <EndpointRow label="File Console (Browser)" url={endpoints.fileConsole} />
            <EndpointRow label="API Endpoint (S3 Compatible)" url={endpoints.s3Api} />
            <EndpointRow label="Internal Gateway URL" url={endpoints.internal} />
            <InfoRow label="S3 Compatibility" value={<span className={statusPill('active')}>S3 Compatible</span>} />
            <InfoRow label="Signature Version" value={storage.signatureVersion} />
            <InfoRow label="Region" value={storage.region} />
          </div>
          <div className="os-divider" />
          <div className="os-endpoint-actions">
            <a className="os-btn os-btn-ghost" href={endpoints.fileConsole} target="_blank" rel="noopener noreferrer">
              <span className="os-btn-ico">↗</span> Open browser console
            </a>
            <a className="os-btn os-btn-ghost" href={endpoints.s3Api} target="_blank" rel="noopener noreferrer">
              <span className="os-btn-ico">⌘</span> Open API endpoint
            </a>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon, tone }: { label: string; value: string; sub?: string; icon: string; tone?: 'good' | 'bad' | 'info' }) {
  return (
    <section className="os-stat-card">
      <div className="os-stat-head">
        <span className="os-stat-icon">{icon}</span>
        <span className="os-stat-label">{label}</span>
      </div>
      <div className={`os-stat-value${tone ? ` os-stat-value-${tone}` : ''}`}>{value}</div>
      {sub ? <div className="os-stat-sub">{sub}</div> : null}
    </section>
  );
}

function MiniMetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="os-mini-metric">
      <div className="os-mini-metric-label">{label}</div>
      <div className="os-mini-metric-value">{value}</div>
      <div className="os-mini-metric-hint">{hint}</div>
    </div>
  );
}

function CapacityRing({ label, value, accent }: { label: string; value: number | null; accent: string }) {
  return (
    <div className="os-ring-wrap">
      <div className="os-ring" style={{ borderColor: accent }}>
        <div className="os-ring-value">{fmtBytes(value)}</div>
        <div className="os-ring-label">{label}</div>
      </div>
    </div>
  );
}

function KeySummary({ activeCount }: { activeCount: number }) {
  return (
    <div className="os-key-summary">
      <div className="os-key-stat">
        <div className="os-key-stat-value">{activeCount}</div>
        <div className="os-key-stat-label">Active access keys</div>
      </div>
      <div className="os-key-note">
        Generate, scope, and revoke S3-compatible access keys from the <strong>Access Keys</strong> tab. Secrets are
        shown once at creation and never persisted in plaintext.
      </div>
    </div>
  );
}

function EndpointRow({ label, url }: { label: string; url: string }) {
  return (
    <div className="os-endpoint-row">
      <span className="os-endpoint-label">{label}</span>
      <a className="os-endpoint-url" href={url} target="_blank" rel="noopener noreferrer">{url}</a>
      <button
        type="button"
        className="os-btn-icon"
        onClick={() => navigator.clipboard?.writeText(url)}
        aria-label={`Copy ${label}`}
      >
        ⎘
      </button>
    </div>
  );
}

function eventIcon(type: string): string {
  if (type.startsWith('bucket.')) return '▦';
  if (type.startsWith('object.uploaded')) return '↑';
  if (type.startsWith('object.downloaded')) return '↓';
  if (type.startsWith('object.deleted')) return '✕';
  if (type.startsWith('access_key.')) return '⚿';
  if (type.startsWith('presigned')) return '⎘';
  if (type.startsWith('tenant.')) return '◌';
  return '•';
}

function humanizeEvent(type: string): string {
  return type
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─── BUCKETS TAB ───────────────────────────────────────────── */
function BucketsTab({
  onChange,
  requestedOpen,
  onActionHandled,
}: {
  onChange: () => void;
  requestedOpen?: boolean;
  onActionHandled?: () => void;
}) {
  const [buckets, setBuckets] = useState<BucketInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ buckets: BucketInfo[] }>('/api/admin/object-storage/buckets');
      setBuckets(data.buckets);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'load_failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (requestedOpen) {
      setShowCreate(true);
      onActionHandled?.();
    }
  }, [onActionHandled, requestedOpen]);

  async function handleDelete(name: string) {
    if (!confirm(`Delete bucket "${name}"? This requires the bucket to be empty (or use force).`)) return;
    setBusy(name);
    try {
      const force = confirm('Force delete (recursively remove all objects)?');
      const url = force
        ? `/api/admin/object-storage/buckets/${encodeURIComponent(name)}?force=1`
        : `/api/admin/object-storage/buckets/${encodeURIComponent(name)}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await reload();
      onChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'delete_failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="os-tab-head">
        <div>
          <h2 className="os-tab-title">Buckets</h2>
          <p className="os-tab-sub">Manage S3 buckets backed by SeaweedFS. One bucket per service is recommended.</p>
        </div>
        <button type="button" className="os-btn os-btn-primary" onClick={() => setShowCreate(true)}>
          <span className="os-btn-ico">＋</span> Create Bucket
        </button>
      </div>

      {error ? <div className="os-banner os-banner-warn">⚠ {error}</div> : null}

      <Panel title="">
        <div className="os-table os-table-buckets">
          <div className="os-thead">
            <div>Name</div>
            <div>Region</div>
            <div>Objects</div>
            <div>Used</div>
            <div>Versioning</div>
            <div>Status</div>
            <div className="os-th-actions">Actions</div>
          </div>
          {loading ? (
            <div className="os-empty">Loading…</div>
          ) : buckets.length === 0 ? (
            <EmptyState title="No buckets yet" hint='Click "Create Bucket" to get started.' />
          ) : (
            buckets.map((b) => (
              <div key={b.name} className="os-tr">
                <div className="os-bucket-cell">
                  <span className="os-avatar os-avatar-violet">{b.name.slice(0, 2).toUpperCase()}</span>
                  <div className="os-strong">{b.name}</div>
                </div>
                <div>us-east-1</div>
                <div>{fmtNumber(b.objectCount)}</div>
                <div>{fmtBytes(b.sizeBytes)}</div>
                <div><span className="os-pill os-pill-muted">Off</span></div>
                <div><span className={statusPill('active')}>Active</span></div>
                <div className="os-actions">
                  <button
                    type="button"
                    className="os-btn-mini"
                    onClick={() => navigator.clipboard?.writeText(`https://s3api.getouch.co/${b.name}`)}
                  >
                    Copy URL
                  </button>
                  <button
                    type="button"
                    className="os-btn-mini os-btn-mini-danger"
                    disabled={busy === b.name}
                    onClick={() => handleDelete(b.name)}
                  >
                    {busy === b.name ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>

      {showCreate ? (
        <CreateBucketModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void reload();
            onChange();
          }}
        />
      ) : null}
    </div>
  );
}

function CreateBucketModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'global' | 'tenant' | 'service'>('global');
  const [tenantId, setTenantId] = useState('');
  const [service, setService] = useState('media');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/object-storage/buckets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), tenantId: scope === 'tenant' ? tenantId : null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'create_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Create Bucket" onClose={onClose}>
      <Field label="Bucket name">
        <input
          className="os-input"
          value={name}
          onChange={(e) => setName(e.target.value.toLowerCase())}
          placeholder="getouch-media"
        />
      </Field>
      <Field label="Tenant scope">
        <div className="os-radio-row">
          {(['global', 'tenant', 'service'] as const).map((s) => (
            <label key={s} className="os-radio">
              <input type="radio" checked={scope === s} onChange={() => setScope(s)} /> {s}
            </label>
          ))}
        </div>
      </Field>
      {scope === 'tenant' ? (
        <Field label="Tenant ID">
          <input className="os-input" value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="ten_abc123" />
        </Field>
      ) : null}
      <Field label="Service">
        <select className="os-input" value={service} onChange={(e) => setService(e.target.value)}>
          {SERVICE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </Field>
      {error ? <div className="os-banner os-banner-warn">⚠ {error}</div> : null}
      <div className="os-modal-actions">
        <button type="button" className="os-btn os-btn-ghost" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="os-btn os-btn-primary"
          disabled={!name.trim() || busy || (scope === 'tenant' && !tenantId.trim())}
          onClick={submit}
        >
          {busy ? 'Creating…' : 'Create Bucket'}
        </button>
      </div>
    </Modal>
  );
}

/* ─── TENANTS TAB ───────────────────────────────────────────── */
function TenantsTab({ buckets, onChange }: { buckets: BucketInfo[]; onChange?: () => void }) {
  const [tenants, setTenants] = useState<TenantMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ tenants: TenantMapping[]; degraded?: boolean }>(
        '/api/admin/object-storage/tenants',
      );
      setTenants(data.tenants);
      setDegraded(Boolean(data.degraded));
    } catch {
      setDegraded(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  async function handleDelete(id: string) {
    if (!confirm('Remove tenant mapping?')) return;
    await fetch(`/api/admin/object-storage/tenants?id=${id}`, { method: 'DELETE' });
    void reload();
    onChange?.();
  }

  return (
    <div>
      <div className="os-tab-head">
        <div>
          <h2 className="os-tab-title">Tenants</h2>
          <p className="os-tab-sub">
            Map Portal tenant_id → bucket/prefix. Default pattern:{' '}
            <code>getouch-media/&lt;tenant_id&gt;/&lt;service&gt;/</code>
          </p>
        </div>
        <button type="button" className="os-btn os-btn-primary" onClick={() => setShowCreate(true)}>
          <span className="os-btn-ico">＋</span> Assign Tenant Storage
        </button>
      </div>

      {degraded ? (
        <div className="os-banner os-banner-info">
          ⓘ Tenant mappings table is not initialized yet. Run the latest migrations to enable persistent assignments.
        </div>
      ) : null}

      <Panel title="">
        <div className="os-table os-table-tenants">
          <div className="os-thead">
            <div>Tenant</div>
            <div>Bucket / Prefix</div>
            <div>Services</div>
            <div>Quota</div>
            <div>Status</div>
            <div className="os-th-actions">Actions</div>
          </div>
          {loading ? (
            <div className="os-empty">Loading…</div>
          ) : tenants.length === 0 ? (
            <EmptyState title="No tenant mappings" hint="Assign a Portal tenant to a bucket prefix to begin." />
          ) : (
            tenants.map((t) => (
              <div key={t.id} className="os-tr">
                <div className="os-bucket-cell">
                  <span className="os-avatar os-avatar-cyan">{(t.tenantName ?? t.tenantId).slice(0, 2).toUpperCase()}</span>
                  <div>
                    <div className="os-strong">{t.tenantName ?? t.tenantId}</div>
                    <div className="os-muted-sm">{t.tenantId}</div>
                  </div>
                </div>
                <div className="os-mono">{t.bucket}/{t.prefix}</div>
                <div>{(t.services ?? []).join(', ') || '—'}</div>
                <div>{t.quotaBytes ? fmtBytes(t.quotaBytes) : 'Unlimited'}</div>
                <div><span className={statusPill(t.status)}>{t.status}</span></div>
                <div className="os-actions">
                  <button type="button" className="os-btn-mini os-btn-mini-danger" onClick={() => handleDelete(t.id)}>
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>

      {showCreate ? (
        <CreateTenantModal
          buckets={buckets}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void reload();
            onChange?.();
          }}
        />
      ) : null}
    </div>
  );
}

function CreateTenantModal({ buckets, onClose, onCreated }: { buckets: BucketInfo[]; onClose: () => void; onCreated: () => void }) {
  const [tenantId, setTenantId] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [bucket, setBucket] = useState(buckets[0]?.name ?? 'getouch-media');
  const [prefix, setPrefix] = useState('');
  const [services, setServices] = useState<string[]>([]);
  const [quota, setQuota] = useState('');
  const [policy, setPolicy] = useState('read-write');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const computedPrefix = prefix.trim() || (tenantId.trim() ? `${tenantId.trim()}/` : '');

  function toggleService(s: string) {
    setServices((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/object-storage/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenantId.trim(),
          tenantName: tenantName.trim() || null,
          bucket,
          prefix: computedPrefix,
          services,
          quotaBytes: quota ? Math.round(Number(quota) * 1024 * 1024 * 1024) : null,
          policy,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'create_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Assign Tenant Storage" onClose={onClose}>
      <div className="os-grid-2-form">
        <Field label="Tenant ID">
          <input className="os-input" value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="ten_abc123" />
        </Field>
        <Field label="Display name">
          <input className="os-input" value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="Tenant Alpha" />
        </Field>
        <Field label="Bucket">
          <select className="os-input" value={bucket} onChange={(e) => setBucket(e.target.value)}>
            {(buckets.length ? buckets.map((b) => b.name) : ['getouch-media']).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </Field>
        <Field label={`Prefix (default ${tenantId || 'tenant_id'}/)`}>
          <input className="os-input" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder={`${tenantId || 'ten_abc123'}/`} />
        </Field>
        <Field label="Quota (GB)">
          <input className="os-input" type="number" min={0} value={quota} onChange={(e) => setQuota(e.target.value)} placeholder="Unlimited" />
        </Field>
        <Field label="Policy">
          <select className="os-input" value={policy} onChange={(e) => setPolicy(e.target.value)}>
            <option value="read-write">Read / Write</option>
            <option value="read">Read only</option>
            <option value="write">Write only</option>
          </select>
        </Field>
      </div>
      <Field label="Allowed services">
        <div className="os-chip-row">
          {SERVICE_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`os-chip${services.includes(s) ? ' os-chip-active' : ''}`}
              onClick={() => toggleService(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </Field>
      <div className="os-info-rows">
        <InfoRow label="Resolved path" value={<code>{bucket}/{computedPrefix || `${tenantId || 'tenant_id'}/`}</code>} />
      </div>
      {error ? <div className="os-banner os-banner-warn">⚠ {error}</div> : null}
      <div className="os-modal-actions">
        <button type="button" className="os-btn os-btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="os-btn os-btn-primary" disabled={!tenantId.trim() || !bucket || busy} onClick={submit}>
          {busy ? 'Saving…' : 'Save Mapping'}
        </button>
      </div>
    </Modal>
  );
}

/* ─── ACCESS KEYS TAB ───────────────────────────────────────── */
function AccessKeysTab({
  buckets,
  onChange,
  requestedOpen,
  onActionHandled,
}: {
  buckets: BucketInfo[];
  onChange?: () => void;
  requestedOpen?: boolean;
  onActionHandled?: () => void;
}) {
  const [keys, setKeys] = useState<AccessKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<{ accessKeyId: string; secretAccessKey: string } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ keys: AccessKey[]; degraded?: boolean }>('/api/admin/object-storage/access-keys');
      setKeys(data.keys);
      setDegraded(Boolean(data.degraded));
    } catch {
      setDegraded(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (requestedOpen) {
      setShowCreate(true);
      onActionHandled?.();
    }
  }, [onActionHandled, requestedOpen]);

  async function revoke(id: string) {
    if (!confirm('Revoke this access key?')) return;
    await fetch(`/api/admin/object-storage/access-keys?id=${id}`, { method: 'DELETE' });
    void reload();
    onChange?.();
  }

  async function rotate(id: string) {
    await fetch(`/api/admin/object-storage/access-keys?id=${id}&action=rotate`, { method: 'DELETE' });
    void reload();
    onChange?.();
  }

  return (
    <div>
      <div className="os-tab-head">
        <div>
          <h2 className="os-tab-title">Access Keys</h2>
          <p className="os-tab-sub">
            S3-compatible credentials. Secrets are shown <strong>once</strong>; only a SHA-256 hash is persisted.
          </p>
        </div>
        <button type="button" className="os-btn os-btn-primary" onClick={() => setShowCreate(true)}>
          <span className="os-btn-ico">＋</span> Generate Access Key
        </button>
      </div>

      {degraded ? (
        <div className="os-banner os-banner-info">
          ⓘ Access keys table is not initialized yet. Run the latest migrations to enable key issuance.
        </div>
      ) : null}

      <div className="os-banner os-banner-info">
        ⓘ Generated keys are recorded in the portal control plane. To authorize them against the actual SeaweedFS S3
        gateway, an operator must add the matching identity to <code>/home/deploy/apps/getouch.co/infra/seaweedfs/s3.json</code>{' '}
        and restart <code>seaweed-s3</code>. See <em>Settings → Maintenance</em>.
      </div>

      <Panel title="">
        <div className="os-table os-table-keys">
          <div className="os-thead">
            <div>Label</div>
            <div>Key prefix</div>
            <div>Tenant</div>
            <div>Scope</div>
            <div>Permission</div>
            <div>Last used</div>
            <div>Status</div>
            <div className="os-th-actions">Actions</div>
          </div>
          {loading ? (
            <div className="os-empty">Loading…</div>
          ) : keys.length === 0 ? (
            <EmptyState title="No access keys" hint='Click "Generate Access Key" to issue one.' />
          ) : (
            keys.map((k) => (
              <div key={k.id} className="os-tr">
                <div className="os-strong">{k.label}</div>
                <div className="os-mono">{k.keyPrefix.slice(0, 8)}…{k.keyPrefix.slice(-4)}</div>
                <div>{k.tenantId ?? '—'}</div>
                <div className="os-mono">{k.bucket ?? '*'}/{k.prefix ?? '*'}</div>
                <div><span className="os-pill os-pill-info">{k.permission}</span></div>
                <div>{timeAgo(k.lastUsedAt)}</div>
                <div><span className={statusPill(k.status)}>{k.status}</span></div>
                <div className="os-actions">
                  <button type="button" className="os-btn-mini" onClick={() => rotate(k.id)}>Rotate</button>
                  <button type="button" className="os-btn-mini os-btn-mini-danger" onClick={() => revoke(k.id)}>Revoke</button>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>

      {showCreate ? (
        <CreateAccessKeyModal
          buckets={buckets}
          onClose={() => setShowCreate(false)}
          onCreated={(secret) => {
            setShowCreate(false);
            setCreatedSecret(secret);
            void reload();
            onChange?.();
          }}
        />
      ) : null}

      {createdSecret ? (
        <Modal title="Save your secret now" onClose={() => setCreatedSecret(null)}>
          <div className="os-banner os-banner-warn">
            ⚠ This secret is shown <strong>once</strong>. Copy it now — it cannot be retrieved later.
          </div>
          <div className="os-info-rows">
            <InfoRow label="S3_ACCESS_KEY_ID" value={<code>{createdSecret.accessKeyId}</code>} />
            <InfoRow label="S3_SECRET_ACCESS_KEY" value={<code>{createdSecret.secretAccessKey}</code>} />
          </div>
          <pre className="os-snippet">{`S3_ENDPOINT=https://s3api.getouch.co
S3_REGION=us-east-1
S3_BUCKET=getouch-media
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY_ID=${createdSecret.accessKeyId}
S3_SECRET_ACCESS_KEY=${createdSecret.secretAccessKey}`}</pre>
          <div className="os-modal-actions">
            <button
              type="button"
              className="os-btn os-btn-ghost"
              onClick={() => navigator.clipboard?.writeText(`${createdSecret.accessKeyId}:${createdSecret.secretAccessKey}`)}
            >
              Copy
            </button>
            <button type="button" className="os-btn os-btn-primary" onClick={() => setCreatedSecret(null)}>I saved it</button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function CreateAccessKeyModal({
  buckets,
  onClose,
  onCreated,
}: {
  buckets: BucketInfo[];
  onClose: () => void;
  onCreated: (secret: { accessKeyId: string; secretAccessKey: string }) => void;
}) {
  const [label, setLabel] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [bucket, setBucket] = useState(buckets[0]?.name ?? 'getouch-media');
  const [prefix, setPrefix] = useState('');
  const [permission, setPermission] = useState('read-write');
  const [service, setService] = useState('media');
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/object-storage/access-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          tenantId: tenantId.trim() || null,
          bucket,
          prefix: prefix.trim() || null,
          permission,
          service,
          expiresAt: expiry || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = await res.json();
      onCreated({ accessKeyId: body.key.accessKeyId, secretAccessKey: body.key.secretAccessKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'create_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Generate Access Key" onClose={onClose}>
      <div className="os-grid-2-form">
        <Field label="Label">
          <input className="os-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="WAPI media" />
        </Field>
        <Field label="Tenant (optional)">
          <input className="os-input" value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="ten_abc123" />
        </Field>
        <Field label="Bucket">
          <select className="os-input" value={bucket} onChange={(e) => setBucket(e.target.value)}>
            {(buckets.length ? buckets.map((b) => b.name) : ['getouch-media']).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </Field>
        <Field label="Prefix scope">
          <input className="os-input" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="ten_abc123/whatsapp/" />
        </Field>
        <Field label="Permission">
          <select className="os-input" value={permission} onChange={(e) => setPermission(e.target.value)}>
            {PERMISSION_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Service">
          <select className="os-input" value={service} onChange={(e) => setService(e.target.value)}>
            {SERVICE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Expires at (optional)">
          <input className="os-input" type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
      </div>
      {error ? <div className="os-banner os-banner-warn">⚠ {error}</div> : null}
      <div className="os-modal-actions">
        <button type="button" className="os-btn os-btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="os-btn os-btn-primary" disabled={!label.trim() || busy} onClick={submit}>
          {busy ? 'Generating…' : 'Generate Key'}
        </button>
      </div>
    </Modal>
  );
}

/* ─── BROWSER TAB ───────────────────────────────────────────── */
function BrowserTab({ buckets, onChange }: { buckets: BucketInfo[]; onChange?: () => void }) {
  const [bucket, setBucket] = useState<string>('');
  const [prefix, setPrefix] = useState('');
  const [objects, setObjects] = useState<ObjectEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!bucket && buckets[0]) setBucket(buckets[0].name);
  }, [buckets, bucket]);

  const reload = useCallback(async () => {
    if (!bucket) return;
    setLoading(true);
    setError(null);
    try {
      const url = new URL('/api/admin/object-storage/objects', window.location.origin);
      url.searchParams.set('bucket', bucket);
      if (prefix) url.searchParams.set('prefix', prefix);
      const data = await fetchJson<{ objects: ObjectEntry[] }>(url.toString());
      setObjects(data.objects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'load_failed');
    } finally {
      setLoading(false);
    }
  }, [bucket, prefix]);

  useEffect(() => { void reload(); }, [reload]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !bucket) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('bucket', bucket);
      fd.append('prefix', prefix);
      const res = await fetch('/api/admin/object-storage/objects', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      e.target.value = '';
      await reload();
      onChange?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'upload_failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(key: string) {
    if (!confirm(`Delete ${key}?`)) return;
    const url = new URL('/api/admin/object-storage/objects', window.location.origin);
    url.searchParams.set('bucket', bucket);
    url.searchParams.set('key', key);
    await fetch(url.toString(), { method: 'DELETE' });
    void reload();
    onChange?.();
  }

  async function handleCreateFolder() {
    if (!bucket) return;
    const folderName = normalizeSegment(prompt('Folder name') ?? '');
    if (!folderName) return;

    setUploading(true);
    try {
      const fd = new FormData();
      const marker = new File([new Uint8Array()], '.keep', { type: 'text/plain' });
      fd.append('file', marker);
      fd.append('bucket', bucket);
      fd.append('prefix', `${normalizePrefix(prefix)}${folderName}/`);
      const res = await fetch('/api/admin/object-storage/objects', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await reload();
      onChange?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'create_folder_failed');
    } finally {
      setUploading(false);
    }
  }

  const breadcrumb = useMemo(() => prefix.split('/').filter(Boolean), [prefix]);

  return (
    <div>
      <div className="os-tab-head">
        <div>
          <h2 className="os-tab-title">Browser</h2>
          <p className="os-tab-sub">Browse, upload, and delete objects within a bucket. Respect tenant prefix isolation in production.</p>
        </div>
      </div>

      <Panel title="">
        <div className="os-browser-toolbar">
          <select className="os-input os-input-narrow" value={bucket} onChange={(e) => { setBucket(e.target.value); setPrefix(''); }}>
            {buckets.length === 0 ? <option value="">— no buckets —</option> : null}
            {buckets.map((b) => (
              <option key={b.name} value={b.name}>{b.name}</option>
            ))}
          </select>
          <div className="os-breadcrumb-row">
            <button type="button" className="os-crumb" onClick={() => setPrefix('')}>{bucket || '/'}</button>
            {breadcrumb.map((p, i) => (
              <span key={i} className="os-crumb-wrap">
                <span className="os-crumb-sep">/</span>
                <button
                  type="button"
                  className="os-crumb"
                  onClick={() => setPrefix(breadcrumb.slice(0, i + 1).join('/') + '/')}
                >
                  {p}
                </button>
              </span>
            ))}
          </div>
          <div className="os-spacer" />
          <label className="os-btn os-btn-primary" style={{ cursor: 'pointer' }}>
            <span className="os-btn-ico">↑</span> {uploading ? 'Uploading…' : 'Upload'}
            <input type="file" hidden onChange={handleUpload} disabled={!bucket || uploading} />
          </label>
          <button type="button" className="os-btn os-btn-ghost" onClick={handleCreateFolder} disabled={!bucket || uploading}>
            <span className="os-btn-ico">▣</span> Create Folder
          </button>
          <button type="button" className="os-btn os-btn-ghost" onClick={reload}>↻ Refresh</button>
        </div>

        {error ? <div className="os-banner os-banner-warn">⚠ {error}</div> : null}

        <div className="os-table os-table-objects">
          <div className="os-thead">
            <div>Name</div>
            <div>Type</div>
            <div>Size</div>
            <div>Last Modified</div>
            <div className="os-th-actions">Actions</div>
          </div>
          {loading ? (
            <div className="os-empty">Loading…</div>
          ) : objects.length === 0 ? (
            <EmptyState title="Empty prefix" hint="Upload a file to populate this prefix." />
          ) : (
            objects.map((o) => (
              <div key={o.fullPath} className="os-tr">
                <div className="os-bucket-cell">
                  <span className="os-avatar os-avatar-muted">{o.isFolder ? '▥' : '▤'}</span>
                  {o.isFolder ? (
                    <button
                      type="button"
                      className="os-link-strong"
                      onClick={() => setPrefix(`${prefix}${prefix.endsWith('/') || !prefix ? '' : '/'}${o.name}/`.replace(/^\/+/, ''))}
                    >
                      {o.name}/
                    </button>
                  ) : (
                    <span className="os-strong">{o.name}</span>
                  )}
                </div>
                <div className="os-mono os-muted-sm">{o.type}</div>
                <div>{o.isFolder ? '—' : fmtBytes(o.size)}</div>
                <div>{timeAgo(o.lastModified)}</div>
                <div className="os-actions">
                  {!o.isFolder ? (
                    <>
                      <a
                        className="os-btn-mini"
                        href={`https://s3.getouch.co/${bucket}/${prefix}${o.name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open
                      </a>
                      <button
                        type="button"
                        className="os-btn-mini os-btn-mini-danger"
                        onClick={() => handleDelete(prefix ? `${prefix}${o.name}` : o.name)}
                      >
                        Delete
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

/* ─── ACTIVITY TAB ──────────────────────────────────────────── */
function ActivityTab() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [filter, setFilter] = useState({ event: '', tenant: '', bucket: '' });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL('/api/admin/object-storage/activity', window.location.origin);
      url.searchParams.set('limit', '200');
      if (filter.event) url.searchParams.set('event', filter.event);
      if (filter.tenant) url.searchParams.set('tenant', filter.tenant);
      if (filter.bucket) url.searchParams.set('bucket', filter.bucket);
      const data = await fetchJson<{ events: ActivityEvent[]; degraded?: boolean }>(url.toString());
      setEvents(data.events);
      setDegraded(Boolean(data.degraded));
    } catch {
      setDegraded(true);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <div>
      <div className="os-tab-head">
        <div>
          <h2 className="os-tab-title">Activity</h2>
          <p className="os-tab-sub">Audit trail of admin-initiated actions. Secrets are never logged.</p>
        </div>
        <button type="button" className="os-btn os-btn-ghost" onClick={reload}>↻ Refresh</button>
      </div>

      {degraded ? (
        <div className="os-banner os-banner-info">
          ⓘ Activity table is not initialized yet. Run the latest migrations to enable persistent audit logs.
        </div>
      ) : null}

      <Panel title="">
        <div className="os-filter-row">
          <input className="os-input os-input-narrow" placeholder="event type" value={filter.event} onChange={(e) => setFilter((f) => ({ ...f, event: e.target.value }))} />
          <input className="os-input os-input-narrow" placeholder="tenant id" value={filter.tenant} onChange={(e) => setFilter((f) => ({ ...f, tenant: e.target.value }))} />
          <input className="os-input os-input-narrow" placeholder="bucket" value={filter.bucket} onChange={(e) => setFilter((f) => ({ ...f, bucket: e.target.value }))} />
        </div>

        <div className="os-table os-table-activity">
          <div className="os-thead">
            <div>Time</div>
            <div>Event</div>
            <div>Tenant</div>
            <div>Bucket</div>
            <div>Object / Detail</div>
            <div>Actor</div>
            <div>Status</div>
          </div>
          {loading ? (
            <div className="os-empty">Loading…</div>
          ) : events.length === 0 ? (
            <EmptyState title="No activity recorded" hint="Admin actions and key events will appear here." />
          ) : (
            events.map((e) => (
              <div key={e.id} className="os-tr">
                <div className="os-muted-sm">{timeAgo(e.createdAt)}</div>
                <div className="os-strong">{humanizeEvent(e.eventType)}</div>
                <div>{e.tenantId ?? '—'}</div>
                <div>{e.bucket ?? '—'}</div>
                <div className="os-mono os-muted-sm">{e.objectKey ?? '—'}</div>
                <div>{e.actor ?? '—'}</div>
                <div><span className={statusPill(e.status)}>{e.status}</span></div>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

/* ─── SETTINGS TAB ──────────────────────────────────────────── */
function SettingsTab({ data }: { data: OverviewData | null }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; steps: Array<{ step: string; ok: boolean; detail?: string }> } | null>(null);

  async function runSmoketest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/object-storage/test?op=roundtrip', { method: 'POST' });
      const body = await res.json();
      setTestResult(body);
    } catch (err) {
      setTestResult({ ok: false, steps: [{ step: 'request', ok: false, detail: err instanceof Error ? err.message : 'failed' }] });
    } finally {
      setTesting(false);
    }
  }

  if (!data) return <div className="os-empty">Loading settings…</div>;

  return (
    <div>
      <div className="os-tab-head">
        <div>
          <h2 className="os-tab-title">Settings</h2>
          <p className="os-tab-sub">Storage gateway configuration and health.</p>
        </div>
      </div>

      <div className="os-grid-2">
        <Panel title="Endpoints">
          <div className="os-info-rows">
            <InfoRow label="File Console" value={<a href={data.endpoints.fileConsole} target="_blank" rel="noopener noreferrer">{data.endpoints.fileConsole}</a>} />
            <InfoRow label="S3 API" value={<a href={data.endpoints.s3Api} target="_blank" rel="noopener noreferrer">{data.endpoints.s3Api}</a>} />
            <InfoRow label="Internal" value={data.endpoints.internal} mono />
            <InfoRow label="Region" value={data.storage.region} />
            <InfoRow label="Signature" value={data.storage.signatureVersion} />
            <InfoRow label="Path-style" value={data.storage.pathStyle ? 'Supported' : 'Off'} />
          </div>
        </Panel>

        <Panel title="Storage backend">
          <div className="os-info-rows">
            <InfoRow label="Engine" value="SeaweedFS" />
            <InfoRow label="Data path" value={data.storage.dataPath} mono />
            <InfoRow label="Volumes (max)" value={fmtNumber(data.master.total)} />
            <InfoRow label="Volumes (free)" value={fmtNumber(data.master.free)} />
            <InfoRow label="Active nodes" value={fmtNumber(data.master.active)} />
            <InfoRow label="Health" value={<span className={statusPill(data.master.reachable ? 'healthy' : 'degraded')}>{data.master.reachable ? 'Healthy' : 'Degraded'}</span>} />
          </div>
        </Panel>
      </div>

      <div className="os-grid-2">
        <Panel title="Multi-tenant policy">
          <div className="os-info-rows">
            <InfoRow label="Bucket strategy" value="Service bucket + tenant prefix" />
            <InfoRow label="Default bucket" value={data.storage.defaultBucket} mono />
            <InfoRow label="tenant_id source" value="Portal control plane" />
            <InfoRow label="Quota enforcement" value="Portal-side metadata only" />
          </div>
        </Panel>

        <Panel title="Security">
          <div className="os-info-rows">
            <InfoRow label="Admin console protection" value={<span className={statusPill('healthy')}>Cloudflare Access + Portal auth</span>} />
            <InfoRow label="HTTPS" value={<span className={statusPill('healthy')}>Enforced</span>} />
            <InfoRow label="Secret persistence" value={<span className={statusPill('healthy')}>Hashed only</span>} />
            <InfoRow label="CORS" value="Managed at edge (Caddy)" />
            <InfoRow label="Origins" value="https://*.getouch.co" />
          </div>
        </Panel>
      </div>

      <Panel title="Maintenance">
        <div className="os-info-rows">
          <InfoRow
            label="S3 round-trip test"
            value={
              <div className="os-test-row">
                <button type="button" className="os-btn os-btn-ghost" onClick={runSmoketest} disabled={testing}>
                  {testing ? 'Running…' : 'Run create/upload/list/delete'}
                </button>
                {testResult ? (
                  <span className={statusPill(testResult.ok ? 'healthy' : 'degraded')}>
                    {testResult.ok ? 'Pass' : 'Fail'}
                  </span>
                ) : null}
              </div>
            }
          />
          <InfoRow
            label="s3.json (auth file)"
            value={<code>/home/deploy/apps/getouch.co/infra/seaweedfs/s3.json</code>}
          />
          <InfoRow
            label="Restart S3 gateway"
            value={<code>docker restart seaweed-s3</code>}
          />
        </div>
        {testResult ? (
          <div className="os-test-detail">
            {testResult.steps.map((s) => (
              <div key={s.step} className="os-test-step">
                <span className={statusPill(s.ok ? 'healthy' : 'degraded')}>{s.ok ? '✓' : '✗'}</span>
                <span className="os-strong">{s.step}</span>
                {s.detail ? <span className="os-muted-sm">{s.detail}</span> : null}
              </div>
            ))}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

/* ─── Reusable bits ─────────────────────────────────────────── */
function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="os-panel">
      {title || right ? (
        <header className="os-panel-head">
          {title ? <h3 className="os-panel-title">{title}</h3> : <span />}
          {right}
        </header>
      ) : null}
      <div className="os-panel-body">{children}</div>
    </section>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="os-info-row">
      <span className="os-info-label">{label}</span>
      <span className={`os-info-value${mono ? ' os-mono' : ''}`}>{value}</span>
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="os-empty-state">
      <div className="os-empty-title">{title}</div>
      {hint ? <div className="os-empty-hint">{hint}</div> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="os-field">
      <span className="os-field-label">{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="os-modal-backdrop" onClick={onClose}>
      <div className="os-modal" onClick={(e) => e.stopPropagation()}>
        <header className="os-modal-head">
          <h3>{title}</h3>
          <button type="button" className="os-btn-icon" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="os-modal-body">{children}</div>
      </div>
    </div>
  );
}

/* ─── Styles ────────────────────────────────────────────────── */
function ConsoleStyles() {
  return (
    <style jsx global>{`
      .os-shell { color: #e2e8f0; }
      .os-page-head { padding: 24px 0 16px; }
      .os-breadcrumb { font-size: 12px; color: #94a3b8; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 8px; }
      .os-crumb-muted { color: #64748b; }
      .os-crumb-active { color: #cbd5e1; }
      .os-crumb-sep { margin: 0 6px; color: #475569; }
      .os-page-head-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; flex-wrap: wrap; }
      .os-page-copy { max-width: 760px; }
      .os-title { font-size: 28px; font-weight: 700; margin: 0 0 6px; color: #f1f5f9; }
      .os-subtitle { font-size: 13px; color: #94a3b8; margin: 0 0 12px; }
      .os-subtitle code { background: rgba(148, 163, 184, 0.12); padding: 1px 6px; border-radius: 4px; font-size: 12px; }
      .os-badges { display: flex; gap: 8px; flex-wrap: wrap; }
      .os-badge { font-size: 11px; letter-spacing: 0.04em; padding: 4px 10px; border-radius: 999px; border: 1px solid; }
      .os-badge-violet { color: #c4b5fd; border-color: rgba(168, 85, 247, 0.4); background: rgba(168, 85, 247, 0.1); }
      .os-badge-cyan { color: #67e8f9; border-color: rgba(34, 211, 238, 0.4); background: rgba(34, 211, 238, 0.08); }
      .os-badge-muted { color: #94a3b8; border-color: rgba(148, 163, 184, 0.3); background: rgba(148, 163, 184, 0.06); }
      .os-badge-emerald { color: #86efac; border-color: rgba(34, 197, 94, 0.28); background: rgba(34, 197, 94, 0.1); }
      .os-head-actions { display: flex; gap: 8px; flex-wrap: wrap; }

      .os-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; border: 1px solid; cursor: pointer; transition: all 0.15s; text-decoration: none; }
      .os-btn-ghost { background: rgba(30, 41, 59, 0.6); border-color: rgba(148, 163, 184, 0.2); color: #e2e8f0; }
      .os-btn-ghost:hover { background: rgba(51, 65, 85, 0.8); border-color: rgba(148, 163, 184, 0.4); }
      .os-btn-primary { background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); border-color: transparent; color: #fff; box-shadow: 0 4px 12px rgba(168, 85, 247, 0.25); }
      .os-btn-primary:hover { filter: brightness(1.1); }
      .os-btn-primary-soft { background: linear-gradient(135deg, rgba(124, 58, 237, 0.3) 0%, rgba(168, 85, 247, 0.24) 100%); border-color: rgba(168, 85, 247, 0.4); }
      .os-btn-primary:disabled, .os-btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
      .os-btn-ico { font-size: 14px; }

      .os-btn-mini { padding: 4px 10px; border-radius: 6px; font-size: 12px; border: 1px solid rgba(148, 163, 184, 0.25); background: rgba(30, 41, 59, 0.4); color: #cbd5e1; cursor: pointer; text-decoration: none; }
      .os-btn-mini:hover { background: rgba(51, 65, 85, 0.6); }
      .os-btn-mini-danger { color: #fca5a5; border-color: rgba(239, 68, 68, 0.3); }
      .os-btn-mini-danger:hover { background: rgba(239, 68, 68, 0.1); }

      .os-btn-icon { background: transparent; border: 0; color: #94a3b8; cursor: pointer; padding: 4px 6px; border-radius: 4px; }
      .os-btn-icon:hover { color: #e2e8f0; background: rgba(148, 163, 184, 0.1); }

      .os-tabs { display: flex; gap: 4px; border-bottom: 1px solid rgba(148, 163, 184, 0.15); margin-bottom: 24px; overflow-x: auto; }
      .os-tab { background: transparent; border: 0; color: #94a3b8; padding: 10px 16px; font-size: 13px; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; }
      .os-tab:hover { color: #cbd5e1; }
      .os-tab-active { color: #f1f5f9; border-bottom-color: #a855f7; font-weight: 600; }
      .os-tabpanel { min-height: 400px; }

      .os-tab-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
      .os-tab-title { font-size: 20px; font-weight: 600; margin: 0 0 4px; color: #f1f5f9; }
      .os-tab-sub { font-size: 13px; color: #94a3b8; margin: 0; }
      .os-tab-sub code { background: rgba(148, 163, 184, 0.12); padding: 1px 5px; border-radius: 3px; }

      .os-banner { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
      .os-banner-warn { background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); color: #fcd34d; }
      .os-banner-info { background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); color: #93c5fd; }
      .os-banner code { background: rgba(0,0,0,0.25); padding: 1px 5px; border-radius: 3px; font-size: 12px; }

      .os-stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
      .os-stat-card { background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(148, 163, 184, 0.12); border-radius: 12px; padding: 16px; }
      .os-stat-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .os-stat-icon { width: 32px; height: 32px; border-radius: 8px; background: rgba(168, 85, 247, 0.15); color: #c4b5fd; display: flex; align-items: center; justify-content: center; font-size: 16px; }
      .os-stat-label { font-size: 11px; color: #94a3b8; letter-spacing: 0.06em; text-transform: uppercase; }
      .os-stat-value { font-size: 24px; font-weight: 600; color: #f1f5f9; }
      .os-stat-value-good { color: #4ade80; }
      .os-stat-value-bad { color: #f87171; }
      .os-stat-sub { font-size: 11px; color: #64748b; margin-top: 4px; }

      .os-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
      @media (max-width: 1100px) { .os-grid-2 { grid-template-columns: 1fr; } }
      .os-dashboard-grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(300px, 0.95fr); gap: 16px; margin-bottom: 16px; }
      @media (max-width: 1100px) { .os-dashboard-grid { grid-template-columns: 1fr; } }
      .os-grid-2-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      @media (max-width: 700px) { .os-grid-2-form { grid-template-columns: 1fr; } }

      .os-panel { background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(148, 163, 184, 0.12); border-radius: 12px; overflow: hidden; }
      .os-panel-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid rgba(148, 163, 184, 0.1); }
      .os-panel-title { font-size: 13px; font-weight: 600; color: #cbd5e1; margin: 0; letter-spacing: 0.04em; }
      .os-panel-body { padding: 14px 18px; }
      .os-panel-actions { display: inline-flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }

      .os-table { display: grid; gap: 0; }
      .os-thead, .os-tr { display: grid; padding: 10px 0; align-items: center; gap: 12px; }
      .os-thead { grid-template-columns: 2fr 1fr 1fr 1fr; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #64748b; border-bottom: 1px solid rgba(148, 163, 184, 0.08); }
      .os-tr { grid-template-columns: 2fr 1fr 1fr 1fr; border-bottom: 1px solid rgba(148, 163, 184, 0.05); font-size: 13px; }
      .os-tr:last-child { border-bottom: 0; }
      .os-table-dashboard-tenants .os-thead, .os-table-dashboard-tenants .os-tr { grid-template-columns: 1.3fr 1.9fr 0.8fr 0.9fr 0.9fr 0.8fr; }
      .os-table-dashboard-keys .os-thead, .os-table-dashboard-keys .os-tr { grid-template-columns: 1.45fr 0.9fr 1fr 1.6fr 0.9fr 0.8fr; }
      .os-table-buckets .os-thead, .os-table-buckets .os-tr { grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr 1.4fr; }
      .os-table-tenants .os-thead, .os-table-tenants .os-tr { grid-template-columns: 1.6fr 2fr 1.4fr 1fr 1fr 1.2fr; }
      .os-table-keys .os-thead, .os-table-keys .os-tr { grid-template-columns: 1.4fr 1.2fr 1fr 1.6fr 1fr 1fr 1fr 1.2fr; }
      .os-table-objects .os-thead, .os-table-objects .os-tr { grid-template-columns: 2.4fr 1fr 0.8fr 1fr 1.2fr; }
      .os-table-activity .os-thead, .os-table-activity .os-tr { grid-template-columns: 0.8fr 1.2fr 1fr 1fr 2fr 1fr 0.8fr; }
      .os-th-actions { text-align: right; }
      .os-actions { display: flex; gap: 6px; justify-content: flex-end; }

      .os-bucket-cell { display: flex; align-items: center; gap: 10px; }
  .os-data-stack { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .os-avatar { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; flex-shrink: 0; }
      .os-avatar-violet { background: rgba(168, 85, 247, 0.15); color: #c4b5fd; }
      .os-avatar-cyan { background: rgba(34, 211, 238, 0.15); color: #67e8f9; }
      .os-avatar-muted { background: rgba(148, 163, 184, 0.12); color: #94a3b8; }

      .os-strong { color: #f1f5f9; font-weight: 500; }
      .os-muted-sm { color: #64748b; font-size: 11px; }
      .os-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace; font-size: 12px; color: #cbd5e1; }
      .os-link { background: transparent; border: 0; color: #a855f7; cursor: pointer; font-size: 12px; }
      .os-link-strong { background: transparent; border: 0; color: #c4b5fd; cursor: pointer; font-weight: 500; padding: 0; }

      .os-pill { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 500; letter-spacing: 0.02em; }
      .os-pill-good { background: rgba(34, 197, 94, 0.12); color: #4ade80; }
      .os-pill-info { background: rgba(59, 130, 246, 0.12); color: #93c5fd; }
      .os-pill-muted { background: rgba(148, 163, 184, 0.1); color: #94a3b8; }
      .os-pill-bad { background: rgba(239, 68, 68, 0.12); color: #f87171; }

      .os-empty, .os-empty-state { padding: 32px 16px; text-align: center; color: #64748b; font-size: 13px; }
      .os-empty-title { color: #cbd5e1; font-size: 14px; margin-bottom: 6px; }
      .os-empty-hint { font-size: 12px; }

      .os-capacity-row { display: flex; gap: 16px; justify-content: space-around; padding: 8px 0 16px; }
  .os-capacity-progress-block { margin-bottom: 14px; }
  .os-capacity-progress-head { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: #94a3b8; margin-bottom: 8px; }
  .os-capacity-progress-track { height: 9px; border-radius: 999px; background: rgba(51, 65, 85, 0.8); overflow: hidden; }
  .os-capacity-progress-track span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #8b5cf6 0%, #c084fc 100%); }
      .os-ring { width: 110px; height: 110px; border-radius: 50%; border: 6px solid; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
      .os-ring-value { font-size: 14px; font-weight: 600; color: #f1f5f9; }
      .os-ring-label { font-size: 10px; color: #94a3b8; margin-top: 2px; letter-spacing: 0.04em; }
      .os-divider { height: 1px; background: rgba(148, 163, 184, 0.1); margin: 8px 0; }
  .os-metric-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 8px; }
  .os-mini-metric { border: 1px solid rgba(148, 163, 184, 0.1); border-radius: 12px; padding: 12px; background: rgba(15, 23, 42, 0.42); }
  .os-mini-metric-label { font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
  .os-mini-metric-value { font-size: 18px; font-weight: 600; color: #f1f5f9; }
  .os-mini-metric-hint { margin-top: 4px; font-size: 11px; color: #94a3b8; }
  .os-top-tenants { display: flex; flex-direction: column; gap: 10px; }
  .os-section-label { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #94a3b8; }

      .os-info-rows { display: flex; flex-direction: column; gap: 6px; }
      .os-info-row { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid rgba(148, 163, 184, 0.06); font-size: 13px; }
      .os-info-row:last-child { border-bottom: 0; }
      .os-info-label { color: #94a3b8; }
      .os-info-value { color: #e2e8f0; text-align: right; }
      .os-info-value code { background: rgba(0,0,0,0.25); padding: 1px 5px; border-radius: 3px; font-size: 12px; }

      .os-key-summary { display: flex; gap: 16px; align-items: center; }
      .os-key-stat-value { font-size: 36px; font-weight: 600; color: #c4b5fd; line-height: 1; }
      .os-key-stat-label { font-size: 11px; color: #94a3b8; letter-spacing: 0.04em; text-transform: uppercase; margin-top: 4px; }
      .os-key-note { font-size: 12px; color: #94a3b8; flex: 1; line-height: 1.5; }
      .os-key-note strong { color: #cbd5e1; }

      .os-activity-list { display: flex; flex-direction: column; gap: 8px; }
      .os-activity-item { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(148, 163, 184, 0.05); }
      .os-activity-item:last-child { border-bottom: 0; }
      .os-activity-icon { width: 32px; height: 32px; border-radius: 8px; background: rgba(168, 85, 247, 0.1); color: #c4b5fd; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }
      .os-activity-body { flex: 1; min-width: 0; }
      .os-activity-time { font-size: 11px; color: #64748b; white-space: nowrap; }

      .os-endpoint-grid { display: flex; flex-direction: column; gap: 8px; }
      .os-endpoint-row { display: grid; grid-template-columns: 1fr 1.2fr auto; align-items: center; gap: 12px; padding: 6px 0; font-size: 13px; }
      .os-endpoint-label { color: #94a3b8; }
      .os-endpoint-url { color: #67e8f9; font-family: ui-monospace, monospace; font-size: 12px; text-decoration: none; }
      .os-endpoint-url:hover { text-decoration: underline; }
      .os-endpoint-actions { display: flex; gap: 8px; flex-wrap: wrap; }

      .os-input { background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 6px; color: #e2e8f0; padding: 8px 10px; font-size: 13px; width: 100%; box-sizing: border-box; }
      .os-input:focus { outline: none; border-color: #a855f7; }
      .os-input-narrow { width: auto; max-width: 220px; }
      .os-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
      .os-field-label { font-size: 11px; color: #94a3b8; letter-spacing: 0.04em; text-transform: uppercase; }
      .os-radio-row { display: flex; gap: 12px; flex-wrap: wrap; }
      .os-radio { font-size: 13px; color: #cbd5e1; display: flex; align-items: center; gap: 6px; cursor: pointer; }
      .os-check { font-size: 13px; color: #cbd5e1; display: flex; align-items: center; gap: 6px; cursor: pointer; }
      .os-chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
      .os-chip { padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(148, 163, 184, 0.2); background: rgba(15, 23, 42, 0.4); color: #94a3b8; font-size: 12px; cursor: pointer; }
      .os-chip-active { background: rgba(168, 85, 247, 0.15); border-color: rgba(168, 85, 247, 0.5); color: #c4b5fd; }

      .os-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
      .os-modal { background: #0f172a; border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 12px; max-width: 640px; width: 100%; max-height: 90vh; overflow-y: auto; }
      .os-modal-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid rgba(148, 163, 184, 0.1); }
      .os-modal-head h3 { margin: 0; font-size: 16px; color: #f1f5f9; }
      .os-modal-body { padding: 20px; }
      .os-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }

      .os-snippet { background: rgba(0,0,0,0.4); border: 1px solid rgba(148, 163, 184, 0.1); border-radius: 6px; padding: 12px; font-size: 12px; font-family: ui-monospace, monospace; color: #cbd5e1; overflow-x: auto; white-space: pre; margin: 12px 0; }

      .os-browser-toolbar { display: flex; gap: 8px; align-items: center; padding: 8px 0 12px; border-bottom: 1px solid rgba(148, 163, 184, 0.08); margin-bottom: 12px; flex-wrap: wrap; }
      .os-browser-toolbar-compact { padding-top: 0; }
      .os-spacer { flex: 1; }
      .os-breadcrumb-row { display: flex; align-items: center; gap: 4px; font-size: 13px; flex: 1; min-width: 200px; }
      .os-crumb { background: transparent; border: 0; color: #c4b5fd; cursor: pointer; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
      .os-crumb:hover { background: rgba(168, 85, 247, 0.1); }
      .os-crumb-wrap { display: inline-flex; align-items: center; }

      .os-filter-row { display: flex; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid rgba(148, 163, 184, 0.08); margin-bottom: 12px; flex-wrap: wrap; }

      .os-test-row { display: inline-flex; align-items: center; gap: 8px; }
      .os-test-detail { margin-top: 12px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px; }
      .os-test-step { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; }

      @media (max-width: 900px) {
        .os-metric-grid { grid-template-columns: 1fr; }
      }

      @media (max-width: 720px) {
        .os-head-actions { width: 100%; }
        .os-head-actions .os-btn { flex: 1 1 auto; justify-content: center; }
      }
    `}</style>
  );
}
