'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PreprodBackupEntry, PreprodBackupOverview } from '@/lib/preprod-backups';
import {
  describeClickHouse,
  describeLangfuse,
  describeRedis,
  formatRuntimeSource,
  resolveRuntimeSource,
  type PlatformServicesSnapshot,
  type PlatformTone,
} from '@/lib/platform-service-shared';
import { Breadcrumb, PageIntro, SummaryGrid } from '../ui';
import { BackupNowForm, RestoreBackupDialog } from './DatabaseActions';

const FALLBACK_TIME_ZONE = 'Asia/Kuala_Lumpur';

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
  if (!formatted) {
    return `Preprod backup created successfully. Backup ID ${entry.name}.`;
  }

  return `Preprod backup created: ${formatted}. Backup ID ${entry.name}.`;
}

function mapTone(tone: PlatformTone): 'healthy' | 'active' | 'warning' {
  if (tone === 'healthy') return 'healthy';
  if (tone === 'warning' || tone === 'critical') return 'warning';
  return 'active';
}

function statusClassName(tone: PlatformTone) {
  if (tone === 'warning' || tone === 'critical') return 'portal-status portal-status-warning';
  if (tone === 'healthy') return 'portal-status portal-status-good';
  return 'portal-status portal-status-active';
}

function formatOriginStatus(code: number | null) {
  if (code === null) return 'Unknown';
  if (code === 421) return 'Not served by origin';
  return String(code);
}

function formatEdgeStatus(code: number | null) {
  if (code === null) return 'Not public (expected)';
  return String(code);
}

function buildSummaryCards(
  backupCount: number,
  retentionDays: number,
  clickhouseTone: PlatformTone,
  clickhouseLabel: string,
  redisTone: PlatformTone,
  redisLabel: string,
) {
  return [
    { label: 'DATABASES', value: '5', tone: 'active' as const, icon: '▤' },
    { label: 'CLICKHOUSE', value: clickhouseLabel, tone: mapTone(clickhouseTone), icon: '▥' },
    { label: 'REDIS', value: redisLabel, tone: mapTone(redisTone), icon: '◫' },
    { label: 'BACKUPS', value: String(backupCount), icon: '⟲' },
    { label: 'RETENTION', value: `${retentionDays} days`, icon: '◷' },
  ];
}

export function DatabasesClient({
  initialOverview,
  initialNotice,
  initialError,
  platform,
  breadcrumbPage = 'Databases',
  title = 'Databases & Backups',
  subtitle = 'Core platform databases, AI observability data stores, and preprod backup controls.',
  showDataStores = true,
}: {
  initialOverview: PreprodBackupOverview | null;
  initialNotice?: string;
  initialError?: string;
  platform: PlatformServicesSnapshot;
  breadcrumbPage?: string;
  title?: string;
  subtitle?: string;
  showDataStores?: boolean;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const [notice, setNotice] = useState(initialNotice || '');
  const [error, setError] = useState(initialError || '');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [browserTimeZone, setBrowserTimeZone] = useState(FALLBACK_TIME_ZONE);

  useEffect(() => {
    setBrowserTimeZone(getBrowserTimeZone());
  }, []);

  const langfuseStatus = describeLangfuse(platform);
  const clickhouseStatus = describeClickHouse(platform);
  const redisStatus = describeRedis(platform);
  const clickhousePrimary = platform.clickhouse.containers[0] || null;

  const summaryCards = useMemo(
    () => buildSummaryCards(
      overview?.entries.length || 0,
      overview?.retentionDays || 0,
      clickhouseStatus.tone,
      clickhouseStatus.label,
      redisStatus.tone,
      redisStatus.label,
    ),
    [clickhouseStatus.label, clickhouseStatus.tone, overview, redisStatus.label, redisStatus.tone]
  );

  return (
    <div className="portal-body">
      <Breadcrumb category="Infra & Persistence" page={breadcrumbPage} />
      <PageIntro title={title} subtitle={subtitle} />

      <SummaryGrid cards={summaryCards} />

      {notice ? <div className="portal-banner portal-banner-success">{notice}</div> : null}
      {error ? <div className="portal-banner portal-banner-error">{error}</div> : null}
      {isBackingUp ? (
        <div className="portal-banner portal-banner-info" aria-live="polite">
          Backup is running on the preprod host. The history, count, and latest backup card will refresh automatically when it finishes.
        </div>
      ) : null}

      {showDataStores ? (
        <section id="databases" className="portal-panel">
          <div className="portal-panel-head">
            <div>
              <h3 className="portal-panel-title">AI Observability Data Stores</h3>
              <p className="portal-page-sub">ClickHouse and Redis are represented here as internal platform dependencies, while Langfuse stays under Observability & Tracing.</p>
            </div>
          </div>

          <div className="portal-detail-grid">
            <section className="portal-panel">
              <div className="portal-detail-head">
                <h3 className="portal-detail-title">PostgreSQL 16</h3>
                <span className="portal-status portal-status-good">HEALTHY</span>
              </div>
              <div className="portal-info-table">
                <div className="portal-info-table-row"><span className="portal-info-table-label">Type</span><span className="portal-info-table-value">Primary relational database</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Purpose</span><span className="portal-info-table-value">Portal auth, user, and platform state</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Admin tools</span><span className="portal-info-table-value">pgAdmin available on db.getouch.co</span></div>
              </div>
            </section>

            <section className="portal-panel">
              <div className="portal-detail-head">
                <h3 className="portal-detail-title">Langfuse PostgreSQL</h3>
                <span className={statusClassName(langfuseStatus.tone)}>{langfuseStatus.label}</span>
              </div>
              <div className="portal-info-table">
                <div className="portal-info-table-row"><span className="portal-info-table-label">Type</span><span className="portal-info-table-value">PostgreSQL</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Database</span><span className="portal-info-table-value">langfuse</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Purpose</span><span className="portal-info-table-value">Users, projects, settings, and API key metadata for Langfuse</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Verification</span><span className="portal-info-table-value">Installed with the live Langfuse runtime</span></div>
              </div>
            </section>

            <section className="portal-panel">
              <div className="portal-detail-head">
                <h3 className="portal-detail-title">ClickHouse</h3>
                <span className={statusClassName(clickhouseStatus.tone)}>{clickhouseStatus.label}</span>
              </div>
              <div className="portal-info-table">
                <div className="portal-info-table-row"><span className="portal-info-table-label">Type</span><span className="portal-info-table-value">Analytics DB / OLAP</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Purpose</span><span className="portal-info-table-value">Trace, observation, score, token, cost, and latency analytics</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Runtime</span><span className="portal-info-table-value">{clickhousePrimary?.name || platform.clickhouse.internalUrl || 'Awaiting deployment'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Origin route</span><span className="portal-info-table-value">{formatOriginStatus(platform.clickhouse.publicOriginCode)}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Public edge</span><span className="portal-info-table-value">{formatEdgeStatus(platform.clickhouse.publicEdgeCode)}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Security</span><span className="portal-info-table-value">Keep internal-only unless authenticated and intentional</span></div>
              </div>
            </section>

            <section className="portal-panel">
              <div className="portal-detail-head">
                <h3 className="portal-detail-title">Redis / Queue Cache</h3>
                <span className={statusClassName(redisStatus.tone)}>{redisStatus.label}</span>
              </div>
              <div className="portal-info-table">
                <div className="portal-info-table-row"><span className="portal-info-table-label">Type</span><span className="portal-info-table-value">Cache + queue</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Purpose</span><span className="portal-info-table-value">Langfuse ingestion queue, cache, and shared platform background jobs</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Primary runtime</span><span className="portal-info-table-value">{platform.redis.primary?.name || 'Not detected'}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Runtime source</span><span className="portal-info-table-value">{formatRuntimeSource(resolveRuntimeSource(platform.redis.primary))}</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Exposure</span><span className="portal-info-table-value">Internal only</span></div>
              </div>
            </section>

            <section className="portal-panel">
              <div className="portal-detail-head">
                <h3 className="portal-detail-title">pgAdmin</h3>
                <span className="portal-status portal-status-good">ONLINE</span>
              </div>
              <div className="portal-info-table">
                <div className="portal-info-table-row"><span className="portal-info-table-label">UI</span><span className="portal-info-table-value">db.getouch.co</span></div>
                <div className="portal-info-table-row"><span className="portal-info-table-label">Purpose</span><span className="portal-info-table-value">Admin tooling for PostgreSQL inspection and maintenance</span></div>
              </div>
            </section>
          </div>
        </section>
      ) : null}

      <section id="backups" className="portal-panel">
        <div className="portal-panel-head portal-panel-head-inline">
          <div>
            <h3 className="portal-panel-title">Preprod Backup Control</h3>
            <p className="portal-page-sub">
              Backups run on <strong>{overview?.sshTarget || 'the preprod host'}</strong> and are stored under{' '}
              <strong>{overview?.backupRoot || 'the configured backup root'}</strong>.
            </p>
          </div>
          <BackupNowForm
            onStart={() => {
              setIsBackingUp(true);
              setNotice('');
              setError('');
            }}
            onSuccess={({ overview: nextOverview, backupId }) => {
              setOverview(nextOverview);
              setNotice(buildBackupSuccessNotice(nextOverview.latest || nextOverview.entries.find((entry) => entry.name === backupId), browserTimeZone));
              setError('');
              setIsBackingUp(false);
            }}
            onError={(message) => {
              setError(message);
              setNotice('');
              setIsBackingUp(false);
            }}
          />
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
        </div>
      </section>

      <section className="portal-panel">
        <div className="portal-panel-head">
          <div>
            <h3 className="portal-panel-title">Backup History</h3>
            <p className="portal-page-sub">Pick a backup and restore preprod with typed confirmation.</p>
          </div>
        </div>

        {overview && overview.entries.length > 0 ? (
          <div className="portal-backup-list">
            {overview.entries.map((entry) => (
              <div key={entry.path} className="portal-backup-row">
                <div className="portal-backup-main">
                  <div className="portal-resource-name">{getBackupPrimaryLabel(entry, browserTimeZone)}</div>
                  <div className="portal-backup-secondary">{getBackupTechnicalLabel(entry, browserTimeZone)}</div>
                  <div className="portal-resource-desc">{entry.path}</div>
                </div>

                <div className="portal-backup-meta">
                  <span className="portal-resource-type">{entry.sizeHuman}</span>
                  <span className={`portal-status ${entry.hasStorageArchive ? 'portal-status-active' : 'portal-status-warning'}`}>
                    {entry.hasStorageArchive ? 'DB + STORAGE' : 'DB ONLY'}
                  </span>
                  {entry.isLatest ? <span className="portal-status portal-status-good">LATEST</span> : null}
                </div>

                <div className="portal-backup-actions">
                  <RestoreBackupDialog backupName={entry.name} backupPath={entry.path} createdAtLabel={getRestoreBackupLabel(entry, browserTimeZone)} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="portal-activity-item">No backups found yet.</div>
        )}
      </section>

      <section className="portal-panel">
        <div className="portal-panel-head">
          <div>
            <h3 className="portal-panel-title">Operator Notes</h3>
            <p className="portal-page-sub">Production observability stores are tracked here, but restore controls remain preprod-only.</p>
          </div>
        </div>
        <div className="portal-activity-list">
          <div className="portal-activity-item">Langfuse remains under Observability & Tracing because it is an observability UI, not a database surface.</div>
          <div className="portal-activity-item">ClickHouse and Redis are monitored here as internal dependencies, not public apps.</div>
          <div className="portal-activity-item">A preprod restore is destructive and should be treated as a preprod-only operation.</div>
          {(overview?.backupLogTail || []).map((line) => (
            <div key={line} className="portal-activity-item portal-log-line">{line}</div>
          ))}
        </div>
      </section>
    </div>
  );
}