'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PreprodBackupEntry, PreprodBackupOverview } from '@/lib/preprod-backups';
import {
  describeClickHouse,
  describeLangfuse,
  describeRedis,
  type PlatformServicesSnapshot,
  type PlatformTone,
} from '@/lib/platform-service-shared';
import { Breadcrumb, PageIntro, SummaryGrid } from '../ui';
import { ObjectStorageConsole } from '../service-endpoints/object-storage/ObjectStorageConsole';
import { BackupNowForm, RestoreBackupDialog } from './DatabaseActions';

const FALLBACK_TIME_ZONE = 'Asia/Kuala_Lumpur';
const BACKUP_RETENTION_DAYS = 4;

const PGADMIN_URL = 'https://db.getouch.co';
const SUPABASE_SSO_STUDIO = 'https://st-sso.getouch.co';
const SUPABASE_PREPROD_STUDIO = 'https://st-stg-serapod.getouch.co';

type TabId = 'overview' | 'databases' | 'supabase' | 'storage' | 'backups';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'databases', label: 'Databases' },
  { id: 'supabase', label: 'Supabase' },
  { id: 'storage', label: 'Storage' },
  { id: 'backups', label: 'Backups' },
];

function isTabId(value: string | null | undefined): value is TabId {
  return (
    value === 'overview' ||
    value === 'databases' ||
    value === 'supabase' ||
    value === 'storage' ||
    value === 'backups'
  );
}

function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIME_ZONE;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

function formatLocalBackupDateTime(isoTimestamp: string | null | undefined, timeZone: string) {
  if (!isoTimestamp) return null;
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-MY', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const parts = formatter.formatToParts(date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  const day = lookup.get('day');
  const month = lookup.get('month');
  const year = lookup.get('year');
  const hour = lookup.get('hour');
  const minute = lookup.get('minute');
  const dayPeriod = lookup.get('dayPeriod')?.toUpperCase();
  if (!day || !month || !year || !hour || !minute || !dayPeriod) {
    return formatter.format(date);
  }
  return `${day} ${month} ${year}, ${hour}:${minute} ${dayPeriod}`;
}

function getBackupPrimaryLabel(entry: PreprodBackupEntry, timeZone: string) {
  return formatLocalBackupDateTime(entry.createdAtIso, timeZone) || `Backup ID ${entry.name}`;
}

function getBackupTechnicalLabel(entry: PreprodBackupEntry, timeZone: string) {
  return formatLocalBackupDateTime(entry.createdAtIso, timeZone)
    ? `Backup ID ${entry.name}`
    : 'Created time unavailable';
}

function getLatestBackupLabel(entry: PreprodBackupEntry, timeZone: string) {
  const formatted = formatLocalBackupDateTime(entry.createdAtIso, timeZone);
  if (!formatted) return `Backup ID ${entry.name}`;
  return `${formatted} · Backup ID ${entry.name}`;
}

function getRestoreBackupLabel(entry: PreprodBackupEntry, timeZone: string) {
  const formatted = formatLocalBackupDateTime(entry.createdAtIso, timeZone);
  if (!formatted) return 'the selected backup';
  return `the backup created at ${formatted}`;
}

function buildBackupSuccessNotice(entry: PreprodBackupEntry | undefined, timeZone: string) {
  if (!entry) return 'Preprod backup created successfully.';
  const formatted = formatLocalBackupDateTime(entry.createdAtIso, timeZone);
  if (!formatted) return `Preprod backup created successfully. Backup ID ${entry.name}.`;
  return `Preprod backup created: ${formatted}. Backup ID ${entry.name}.`;
}

function mapTone(tone: PlatformTone): 'healthy' | 'active' | 'warning' {
  if (tone === 'healthy') return 'healthy';
  if (tone === 'warning' || tone === 'critical') return 'warning';
  return 'active';
}

function statusBadge(tone: PlatformTone, label: string) {
  if (tone === 'warning' || tone === 'critical') return <span className="portal-status portal-status-warning">{label}</span>;
  if (tone === 'healthy') return <span className="portal-status portal-status-good">{label}</span>;
  return <span className="portal-status portal-status-active">{label}</span>;
}

/** Filter entries to only the most recent N days based on createdAtIso. */
function filterRecentBackups(entries: PreprodBackupEntry[], days: number): PreprodBackupEntry[] {
  if (!entries.length) return entries;
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const recent = entries.filter((entry) => {
    if (!entry.createdAtIso) return true;
    const ts = Date.parse(entry.createdAtIso);
    if (!Number.isFinite(ts)) return true;
    return ts >= cutoffMs;
  });
  if (recent.length === 0) return entries.slice(0, days);
  return recent;
}

function buildSummaryCards({
  health,
  engineCount,
  supabaseCount,
  latestLabel,
}: {
  health: { tone: PlatformTone; label: string };
  engineCount: number;
  supabaseCount: number;
  latestLabel: string;
}) {
  return [
    { label: 'Database Health', value: health.label, tone: mapTone(health.tone), icon: '♡' },
    {
      label: 'Database Engines',
      value: String(engineCount),
      tone: 'active' as const,
      icon: '▤',
      detail: 'Active engine services',
    },
    {
      label: 'Supabase Stacks',
      value: String(supabaseCount),
      tone: 'active' as const,
      icon: '◫',
      detail: 'Running environments',
    },
    { label: 'Latest Backup', value: latestLabel, icon: '◷', detail: 'Most recent restore point' },
    { label: 'Backup Retention', value: `${BACKUP_RETENTION_DAYS} days`, icon: '⟲', detail: 'Retention window' },
  ];
}

interface SupabaseStack {
  id: string;
  name: string;
  environment: string;
  status: string;
  tone: PlatformTone;
  studioUrl: string;
  apiUrl?: string;
  description: string;
}

const SUPABASE_STACKS: SupabaseStack[] = [
  {
    id: 'sso',
    name: 'Getouch SSO',
    environment: 'Production',
    status: 'ONLINE',
    tone: 'healthy',
    studioUrl: SUPABASE_SSO_STUDIO,
    apiUrl: 'https://sb-sso.getouch.co',
    description: 'Central shared sign-in and identity provider for Getouch services.',
  },
  {
    id: 'preprod',
    name: 'Serapod Preprod',
    environment: 'Preprod',
    status: 'ONLINE',
    tone: 'active',
    studioUrl: SUPABASE_PREPROD_STUDIO,
    apiUrl: 'https://sb-stg-serapod.getouch.co',
    description: 'Isolated Supabase stack for Serapod product preprod.',
  },
];

export function DatabasesClient({
  initialOverview,
  initialNotice,
  initialError,
  platform,
}: {
  initialOverview: PreprodBackupOverview | null;
  initialNotice?: string;
  initialError?: string;
  platform: PlatformServicesSnapshot;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams?.get('tab') ?? null;
  const initialTab: TabId = isTabId(tabFromUrl) ? tabFromUrl : 'overview';

  const [tab, setTab] = useState<TabId>(initialTab);
  const [overview, setOverview] = useState(initialOverview);
  const [notice, setNotice] = useState(initialNotice || '');
  const [error, setError] = useState(initialError || '');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [browserTimeZone, setBrowserTimeZone] = useState(FALLBACK_TIME_ZONE);

  useEffect(() => {
    setBrowserTimeZone(getBrowserTimeZone());
  }, []);

  // Sync tab → URL.
  useEffect(() => {
    const current = searchParams?.get('tab') ?? null;
    if (current === tab || (tab === 'overview' && !current)) return;
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (tab === 'overview') params.delete('tab');
    else params.set('tab', tab);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Sync URL → tab (browser back/forward).
  useEffect(() => {
    const next = searchParams?.get('tab') ?? null;
    const nextTab: TabId = isTabId(next) ? next : 'overview';
    if (nextTab !== tab) setTab(nextTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const langfuseStatus = describeLangfuse(platform);
  const clickhouseStatus = describeClickHouse(platform);
  const redisStatus = describeRedis(platform);

  const filteredEntries = useMemo(
    () => filterRecentBackups(overview?.entries || [], BACKUP_RETENTION_DAYS),
    [overview?.entries],
  );
  const hiddenCount = (overview?.entries.length || 0) - filteredEntries.length;

  const overallTone: PlatformTone = useMemo(() => {
    const tones: PlatformTone[] = [clickhouseStatus.tone, redisStatus.tone, langfuseStatus.tone];
    if (tones.includes('critical')) return 'critical';
    if (tones.includes('warning')) return 'warning';
    if (tones.every((t) => t === 'healthy')) return 'healthy';
    return 'active';
  }, [clickhouseStatus.tone, redisStatus.tone, langfuseStatus.tone]);
  const overallLabel =
    overallTone === 'healthy' ? 'Healthy' : overallTone === 'warning' || overallTone === 'critical' ? 'Degraded' : 'Active';

  const latestEntry = overview?.latest || filteredEntries[0];
  const latestLabel = latestEntry
    ? formatLocalBackupDateTime(latestEntry.createdAtIso, browserTimeZone) || latestEntry.name
    : 'No backups yet';

  const summaryCards = useMemo(
    () =>
      buildSummaryCards({
        health: { tone: overallTone, label: overallLabel },
        engineCount: 5,
        supabaseCount: SUPABASE_STACKS.length,
        latestLabel,
      }),
    [overallTone, overallLabel, latestLabel],
  );

  const switchTab = useCallback((next: TabId) => setTab(next), []);

  return (
    <div className="portal-body">
      <Breadcrumb category="Infra & Persistence" page="Databases" />
      <PageIntro
        title="Database & Backup Control"
        subtitle="Central view for PostgreSQL, Supabase stacks, object storage, and recent backup restore points."
      />

      <SummaryGrid cards={summaryCards} />

      <div className="portal-db-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`portal-tab${tab === t.id ? ' portal-tab-active' : ''}`}
            onClick={() => switchTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice ? <div className="portal-banner portal-banner-success">{notice}</div> : null}
      {error ? <div className="portal-banner portal-banner-error">{error}</div> : null}
      {isBackingUp ? (
        <div className="portal-banner portal-banner-info" aria-live="polite">
          Backup is running on the preprod host. The history, count, and latest backup card will refresh automatically when it
          finishes.
        </div>
      ) : null}

      {tab === 'overview' ? (
        <OverviewTab langfuseStatus={langfuseStatus} latestLabel={latestLabel} onSelectTab={switchTab} />
      ) : null}

      {tab === 'databases' ? (
        <DatabasesTab
          platform={platform}
          langfuseStatus={langfuseStatus}
          clickhouseStatus={clickhouseStatus}
          redisStatus={redisStatus}
        />
      ) : null}

      {tab === 'supabase' ? <SupabaseTab /> : null}

      {tab === 'storage' ? (
        <section className="portal-panel-tight">
          <ObjectStorageConsole />
        </section>
      ) : null}

      {tab === 'backups' ? (
        <BackupsTab
          overview={overview}
          filteredEntries={filteredEntries}
          hiddenCount={hiddenCount}
          browserTimeZone={browserTimeZone}
          onStartBackup={() => {
            setIsBackingUp(true);
            setNotice('');
            setError('');
          }}
          onSuccess={({ overview: nextOverview, backupId }) => {
            setOverview(nextOverview);
            setNotice(
              buildBackupSuccessNotice(
                nextOverview.latest || nextOverview.entries.find((entry) => entry.name === backupId),
                browserTimeZone,
              ),
            );
            setError('');
            setIsBackingUp(false);
          }}
          onError={(message) => {
            setError(message);
            setNotice('');
            setIsBackingUp(false);
          }}
        />
      ) : null}

      <DatabasesPageStyles />
    </div>
  );
}

function OverviewTab({
  langfuseStatus,
  latestLabel,
  onSelectTab,
}: {
  langfuseStatus: { tone: PlatformTone; label: string };
  latestLabel: string;
  onSelectTab: (id: TabId) => void;
}) {
  return (
    <div className="portal-db-overview-grid">
      <section className="portal-panel">
        <div className="portal-panel-head">
          <div>
            <h3 className="portal-panel-title">Database Surfaces</h3>
            <p className="portal-page-sub">Primary databases, admin tools, and Supabase studios with direct open actions.</p>
          </div>
        </div>
        <div className="portal-resource-list">
          <SurfaceRow
            icon="▤"
            name="PostgreSQL 16"
            description="Primary platform database"
            meta="Internal: localhost:5432"
            actionLabel="Open pgAdmin"
            actionHref={PGADMIN_URL}
            external
          />
          <SurfaceRow
            icon="◈"
            name="pgAdmin 4"
            description="PostgreSQL admin console"
            meta="URL: db.getouch.co"
            actionLabel="Open pgAdmin"
            actionHref={PGADMIN_URL}
            external
          />
          {SUPABASE_STACKS.map((stack) => (
            <SurfaceRow
              key={stack.id}
              icon="◫"
              name={`Supabase Studio – ${stack.environment}`}
              description={stack.description}
              meta={stack.apiUrl ? `API: ${stack.apiUrl}` : undefined}
              actionLabel="Open Studio"
              actionHref={stack.studioUrl}
              external
              badge={statusBadge(stack.tone, stack.status)}
            />
          ))}
          <SurfaceRow
            icon="◎"
            name="Langfuse PostgreSQL"
            description="Langfuse metadata DB"
            meta="Database: langfuse"
            badge={statusBadge(langfuseStatus.tone, langfuseStatus.label)}
          />
          <SurfaceRow
            icon="◉"
            name="LiteLLM DB"
            description="Model gateway config DB"
            meta="Database: litellm"
            badge={<span className="portal-status portal-status-good">ONLINE</span>}
          />
          <SurfaceRow
            icon="⟷"
            name="Airbyte DB"
            description="Data sync metadata DB"
            meta="Database: airbyte"
            badge={<span className="portal-status portal-status-warning">PREPARED</span>}
          />
        </div>
      </section>

      <aside className="portal-panel">
        <div className="portal-panel-head">
          <div>
            <h3 className="portal-panel-title">Quick Actions</h3>
          </div>
        </div>
        <div className="portal-quick-action-list">
          <QuickAction icon="◈" label="Open pgAdmin" href={PGADMIN_URL} external />
          <QuickAction icon="◫" label="Open Supabase Studio – Preprod" href={SUPABASE_PREPROD_STUDIO} external />
          <QuickAction icon="◫" label="Open Supabase Studio – SSO" href={SUPABASE_SSO_STUDIO} external />
          <QuickAction icon="⟲" label="Create Backup Now" onClick={() => onSelectTab('backups')} />
          <QuickAction icon="◷" label="View Latest Backup" onClick={() => onSelectTab('backups')} />
        </div>
        <div className="portal-quick-action-note">
          <span className="portal-info-table-label">Retention Policy</span>
          <p className="portal-page-sub">
            Only the latest <strong>{BACKUP_RETENTION_DAYS} days</strong> are kept. Older backups are auto-cleaned after the
            retention window.
          </p>
          <p className="portal-page-sub">
            Latest restore point: <strong>{latestLabel}</strong>
          </p>
        </div>
      </aside>
    </div>
  );
}

function SurfaceRow({
  icon,
  name,
  description,
  meta,
  actionLabel,
  actionHref,
  external,
  badge,
}: {
  icon: string;
  name: string;
  description: string;
  meta?: string;
  actionLabel?: string;
  actionHref?: string;
  external?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <div className="portal-surface-row">
      <div className="portal-surface-icon" aria-hidden>
        {icon}
      </div>
      <div className="portal-surface-copy">
        <div className="portal-resource-name">{name}</div>
        <div className="portal-resource-desc">{description}</div>
      </div>
      <div className="portal-surface-meta">{meta || ''}</div>
      <div className="portal-surface-action">
        {badge}
        {actionHref ? (
          external ? (
            <a className="portal-action-link" href={actionHref} target="_blank" rel="noopener noreferrer">
              {actionLabel} ↗
            </a>
          ) : (
            <Link className="portal-action-link" href={actionHref}>
              {actionLabel}
            </Link>
          )
        ) : null}
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  href,
  external,
  onClick,
}: {
  icon: string;
  label: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="portal-quick-action-icon" aria-hidden>
        {icon}
      </span>
      <span className="portal-quick-action-label">{label}</span>
      <span className="portal-quick-action-chev" aria-hidden>
        ›
      </span>
    </>
  );
  if (href) {
    if (external) {
      return (
        <a className="portal-quick-action" href={href} target="_blank" rel="noopener noreferrer">
          {inner}
        </a>
      );
    }
    return (
      <Link className="portal-quick-action" href={href}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className="portal-quick-action" onClick={onClick}>
      {inner}
    </button>
  );
}

function DatabasesTab({
  platform,
  langfuseStatus,
  clickhouseStatus,
  redisStatus,
}: {
  platform: PlatformServicesSnapshot;
  langfuseStatus: { tone: PlatformTone; label: string };
  clickhouseStatus: { tone: PlatformTone; label: string };
  redisStatus: { tone: PlatformTone; label: string };
}) {
  const clickhousePrimary = platform.clickhouse.containers[0] || null;

  return (
    <section className="portal-panel">
      <div className="portal-panel-head">
        <div>
          <h3 className="portal-panel-title">Database Engines</h3>
          <p className="portal-page-sub">Database runtimes and admin surfaces wired into the platform.</p>
        </div>
      </div>
      <div className="portal-detail-grid">
        <section className="portal-panel">
          <div className="portal-detail-head">
            <h3 className="portal-detail-title">PostgreSQL 16</h3>
            <span className="portal-status portal-status-good">HEALTHY</span>
          </div>
          <div className="portal-info-table">
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Type</span>
              <span className="portal-info-table-value">Primary relational database</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Purpose</span>
              <span className="portal-info-table-value">Portal auth, user, and platform state</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Admin tools</span>
              <span className="portal-info-table-value">pgAdmin available on db.getouch.co</span>
            </div>
          </div>
        </section>

        <section className="portal-panel">
          <div className="portal-detail-head">
            <h3 className="portal-detail-title">pgAdmin 4</h3>
            <span className="portal-status portal-status-good">ONLINE</span>
          </div>
          <div className="portal-info-table">
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">UI</span>
              <span className="portal-info-table-value">db.getouch.co</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Purpose</span>
              <span className="portal-info-table-value">Admin tooling for PostgreSQL inspection and maintenance</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Action</span>
              <span className="portal-info-table-value">
                <a className="portal-action-link" href={PGADMIN_URL} target="_blank" rel="noopener noreferrer">
                  Open pgAdmin ↗
                </a>
              </span>
            </div>
          </div>
        </section>

        <section className="portal-panel">
          <div className="portal-detail-head">
            <h3 className="portal-detail-title">Langfuse PostgreSQL</h3>
            {statusBadge(langfuseStatus.tone, langfuseStatus.label)}
          </div>
          <div className="portal-info-table">
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Type</span>
              <span className="portal-info-table-value">PostgreSQL</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Database</span>
              <span className="portal-info-table-value">langfuse</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Purpose</span>
              <span className="portal-info-table-value">Users, projects, settings, and API key metadata for Langfuse</span>
            </div>
          </div>
        </section>

        <section className="portal-panel">
          <div className="portal-detail-head">
            <h3 className="portal-detail-title">LiteLLM DB</h3>
            <span className="portal-status portal-status-good">ONLINE</span>
          </div>
          <div className="portal-info-table">
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Type</span>
              <span className="portal-info-table-value">PostgreSQL</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Database</span>
              <span className="portal-info-table-value">litellm</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Purpose</span>
              <span className="portal-info-table-value">Model gateway config and request keys</span>
            </div>
          </div>
        </section>

        <section className="portal-panel">
          <div className="portal-detail-head">
            <h3 className="portal-detail-title">ClickHouse</h3>
            {statusBadge(clickhouseStatus.tone, clickhouseStatus.label)}
          </div>
          <div className="portal-info-table">
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Type</span>
              <span className="portal-info-table-value">Analytics DB / OLAP</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Purpose</span>
              <span className="portal-info-table-value">Trace, observation, score, token, cost, and latency analytics</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Runtime</span>
              <span className="portal-info-table-value">
                {clickhousePrimary?.name || platform.clickhouse.internalUrl || 'Awaiting deployment'}
              </span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Exposure</span>
              <span className="portal-info-table-value">Internal only</span>
            </div>
          </div>
        </section>

        <section className="portal-panel">
          <div className="portal-detail-head">
            <h3 className="portal-detail-title">Redis / Queue Cache</h3>
            {statusBadge(redisStatus.tone, redisStatus.label)}
          </div>
          <div className="portal-info-table">
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Type</span>
              <span className="portal-info-table-value">Cache + queue</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Purpose</span>
              <span className="portal-info-table-value">
                Langfuse ingestion queue, cache, and shared platform background jobs
              </span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Primary runtime</span>
              <span className="portal-info-table-value">{platform.redis.primary?.name || 'Not detected'}</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Exposure</span>
              <span className="portal-info-table-value">Internal only</span>
            </div>
          </div>
        </section>

        <section className="portal-panel">
          <div className="portal-detail-head">
            <h3 className="portal-detail-title">Airbyte DB</h3>
            <span className="portal-status portal-status-warning">PREPARED</span>
          </div>
          <div className="portal-info-table">
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Type</span>
              <span className="portal-info-table-value">PostgreSQL</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Database</span>
              <span className="portal-info-table-value">airbyte</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Purpose</span>
              <span className="portal-info-table-value">Data sync metadata. Runtime is pending VPS inotify limit fix.</span>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function SupabaseTab() {
  return (
    <section className="portal-panel">
      <div className="portal-panel-head">
        <div>
          <h3 className="portal-panel-title">Supabase Stacks</h3>
          <p className="portal-page-sub">
            Self-hosted Supabase environments. Click <strong>Open Studio</strong> to jump directly into the right environment.
          </p>
        </div>
      </div>
      <div className="portal-detail-grid">
        {SUPABASE_STACKS.map((stack) => (
          <section key={stack.id} className="portal-panel">
            <div className="portal-detail-head">
              <h3 className="portal-detail-title">{stack.name}</h3>
              {statusBadge(stack.tone, stack.status)}
            </div>
            <div className="portal-info-table">
              <div className="portal-info-table-row">
                <span className="portal-info-table-label">Environment</span>
                <span className="portal-info-table-value">{stack.environment}</span>
              </div>
              {stack.apiUrl ? (
                <div className="portal-info-table-row">
                  <span className="portal-info-table-label">API (Kong)</span>
                  <span className="portal-info-table-value">{stack.apiUrl}</span>
                </div>
              ) : null}
              <div className="portal-info-table-row">
                <span className="portal-info-table-label">Studio</span>
                <span className="portal-info-table-value">{stack.studioUrl}</span>
              </div>
              <div className="portal-info-table-row">
                <span className="portal-info-table-label">Description</span>
                <span className="portal-info-table-value">{stack.description}</span>
              </div>
              <div className="portal-info-table-row">
                <span className="portal-info-table-label">Action</span>
                <span className="portal-info-table-value">
                  <a className="portal-action-link" href={stack.studioUrl} target="_blank" rel="noopener noreferrer">
                    Open Studio ↗
                  </a>
                </span>
              </div>
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function BackupsTab({
  overview,
  filteredEntries,
  hiddenCount,
  browserTimeZone,
  onStartBackup,
  onSuccess,
  onError,
}: {
  overview: PreprodBackupOverview | null;
  filteredEntries: PreprodBackupEntry[];
  hiddenCount: number;
  browserTimeZone: string;
  onStartBackup: () => void;
  onSuccess: (args: { overview: PreprodBackupOverview; backupId: string }) => void;
  onError: (message: string) => void;
}) {
  return (
    <>
      <section className="portal-panel">
        <div className="portal-panel-head portal-panel-head-inline">
          <div>
            <h3 className="portal-panel-title">Preprod Backup Control</h3>
            <p className="portal-page-sub">
              Backups run on <strong>{overview?.sshTarget || 'the preprod host'}</strong> and are stored under{' '}
              <strong>{overview?.backupRoot || 'the configured backup root'}</strong>. Retention is capped to{' '}
              <strong>{BACKUP_RETENTION_DAYS} days</strong>.
            </p>
          </div>
          <BackupNowForm onStart={onStartBackup} onSuccess={onSuccess} onError={onError} />
        </div>

        <div className="portal-info-table">
          <div className="portal-info-table-row">
            <span className="portal-info-table-label">Scope</span>
            <span className="portal-info-table-value">Serapod Preprod only</span>
          </div>
          <div className="portal-info-table-row">
            <span className="portal-info-table-label">Cron</span>
            <span className="portal-info-table-value">{overview?.cronSchedule || 'Not detected'}</span>
          </div>
          <div className="portal-info-table-row">
            <span className="portal-info-table-label">Latest Backup</span>
            <span className="portal-info-table-value">
              {overview?.latest ? getLatestBackupLabel(overview.latest, browserTimeZone) : 'No backups found yet'}
            </span>
          </div>
          <div className="portal-info-table-row">
            <span className="portal-info-table-label">Retention</span>
            <span className="portal-info-table-value">Latest {BACKUP_RETENTION_DAYS} days only</span>
          </div>
        </div>
      </section>

      <section className="portal-panel">
        <div className="portal-panel-head">
          <div>
            <h3 className="portal-panel-title">Backup History</h3>
            <p className="portal-page-sub">
              Showing the most recent {BACKUP_RETENTION_DAYS} days. Pick a backup and restore preprod with typed confirmation.
              {hiddenCount > 0 ? (
                <>
                  {' '}
                  <span className="portal-page-sub-muted">
                    {hiddenCount} older backup{hiddenCount === 1 ? '' : 's'} hidden by retention.
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        {filteredEntries.length > 0 ? (
          <div className="portal-backup-list">
            {filteredEntries.map((entry) => (
              <div key={entry.path} className="portal-backup-row">
                <div className="portal-backup-main">
                  <div className="portal-resource-name">{getBackupPrimaryLabel(entry, browserTimeZone)}</div>
                  <div className="portal-backup-secondary">{getBackupTechnicalLabel(entry, browserTimeZone)}</div>
                  <div className="portal-resource-desc">{entry.path}</div>
                </div>

                <div className="portal-backup-meta">
                  <span className="portal-resource-type">{entry.sizeHuman}</span>
                  <span
                    className={`portal-status ${
                      entry.hasStorageArchive ? 'portal-status-active' : 'portal-status-warning'
                    }`}
                  >
                    {entry.hasStorageArchive ? 'DB + STORAGE' : 'DB ONLY'}
                  </span>
                  {entry.isLatest ? <span className="portal-status portal-status-good">LATEST</span> : null}
                </div>

                <div className="portal-backup-actions">
                  <RestoreBackupDialog
                    backupName={entry.name}
                    backupPath={entry.path}
                    createdAtLabel={getRestoreBackupLabel(entry, browserTimeZone)}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="portal-activity-item">No backups found within the {BACKUP_RETENTION_DAYS}-day retention window.</div>
        )}
      </section>

      {overview?.backupLogTail && overview.backupLogTail.length > 0 ? (
        <section className="portal-panel">
          <div className="portal-panel-head">
            <div>
              <h3 className="portal-panel-title">Backup Log Tail</h3>
              <p className="portal-page-sub">A preprod restore is destructive and should be treated as a preprod-only operation.</p>
            </div>
          </div>
          <div className="portal-activity-list">
            {overview.backupLogTail.map((line) => (
              <div key={line} className="portal-activity-item portal-log-line">
                {line}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function DatabasesPageStyles() {
  return (
    <style jsx global>{`
      .portal-db-tabs {
        display: flex;
        gap: 0;
        border-bottom: 1px solid rgba(148, 163, 184, 0.18);
        margin: 16px 0 18px;
        overflow-x: auto;
      }
      .portal-tab {
        background: transparent;
        border: 0;
        border-bottom: 2px solid transparent;
        color: rgba(203, 213, 225, 0.65);
        cursor: pointer;
        font: inherit;
        padding: 10px 18px;
        white-space: nowrap;
      }
      .portal-tab:hover {
        color: rgba(241, 245, 249, 0.92);
      }
      .portal-tab-active {
        color: #f1f5f9;
        border-bottom-color: #a855f7;
        font-weight: 600;
      }
      .portal-db-overview-grid {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
        gap: 18px;
      }
      @media (max-width: 1080px) {
        .portal-db-overview-grid {
          grid-template-columns: 1fr;
        }
      }
      .portal-surface-row {
        display: grid;
        grid-template-columns: 36px minmax(180px, 1.2fr) minmax(160px, 1fr) auto;
        gap: 14px;
        align-items: center;
        padding: 12px 14px;
        border: 1px solid rgba(148, 163, 184, 0.12);
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.45);
      }
      .portal-surface-row + .portal-surface-row {
        margin-top: 8px;
      }
      .portal-surface-icon {
        width: 36px;
        height: 36px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 10px;
        background: rgba(168, 85, 247, 0.12);
        color: #d8b4fe;
        font-size: 18px;
      }
      .portal-surface-meta {
        font-size: 12px;
        color: rgba(148, 163, 184, 0.85);
        word-break: break-word;
      }
      .portal-surface-action {
        display: inline-flex;
        gap: 10px;
        align-items: center;
        justify-content: flex-end;
      }
      @media (max-width: 720px) {
        .portal-surface-row {
          grid-template-columns: 36px 1fr;
        }
        .portal-surface-meta,
        .portal-surface-action {
          grid-column: 2;
          justify-self: start;
        }
      }
      .portal-quick-action-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 8px;
      }
      .portal-quick-action {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        background: rgba(15, 23, 42, 0.5);
        border: 1px solid rgba(148, 163, 184, 0.12);
        border-radius: 12px;
        color: #e2e8f0;
        font: inherit;
        cursor: pointer;
        text-decoration: none;
        text-align: left;
        width: 100%;
      }
      .portal-quick-action:hover {
        border-color: rgba(168, 85, 247, 0.45);
        background: rgba(30, 41, 59, 0.6);
      }
      .portal-quick-action-icon {
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        background: rgba(168, 85, 247, 0.16);
        color: #d8b4fe;
      }
      .portal-quick-action-label {
        flex: 1;
      }
      .portal-quick-action-chev {
        color: rgba(148, 163, 184, 0.65);
      }
      .portal-quick-action-note {
        margin-top: 14px;
        padding: 12px 14px;
        background: rgba(15, 23, 42, 0.4);
        border: 1px dashed rgba(148, 163, 184, 0.18);
        border-radius: 12px;
      }
      .portal-page-sub-muted {
        color: rgba(148, 163, 184, 0.7);
      }
      .portal-panel-tight {
        padding: 0;
        background: transparent;
        border: 0;
      }
    `}</style>
  );
}
