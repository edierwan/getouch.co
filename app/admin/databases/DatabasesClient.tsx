'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PreprodBackupEntry, PreprodBackupOverview } from '@/lib/preprod-backups';
import { PageIntro, SummaryGrid } from '../ui';
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
  if (!isoTimestamp) {
    return null;
  }

  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

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
  if (!formatted) {
    return `Backup ID ${entry.name}`;
  }

  return `${formatted} · Backup ID ${entry.name}`;
}

function getRestoreBackupLabel(entry: PreprodBackupEntry, timeZone: string) {
  const formatted = formatLocalBackupDateTime(entry.createdAtIso, timeZone);
  if (!formatted) {
    return 'the selected backup';
  }

  return `the backup created at ${formatted}`;
}

function buildBackupSuccessNotice(entry: PreprodBackupEntry | undefined, timeZone: string) {
  if (!entry) {
    return 'Preprod backup created successfully.';
  }

  const formatted = formatLocalBackupDateTime(entry.createdAtIso, timeZone);
  if (!formatted) {
    return `Preprod backup created successfully. Backup ID ${entry.name}.`;
  }

  return `Preprod backup created: ${formatted}. Backup ID ${entry.name}.`;
}

function buildSummaryCards(backupCount: number, retentionDays: number) {
  return [
    { label: 'STACK', value: 'Preprod Only', tone: 'active' as const, icon: '◫' },
    { label: 'SCHEDULE', value: 'Daily 02:15', icon: '◷' },
    { label: 'RETENTION', value: `${retentionDays} days`, icon: '⟲' },
    { label: 'BACKUPS', value: String(backupCount), icon: '▤' },
  ];
}

export function DatabasesClient({
  initialOverview,
  initialNotice,
  initialError,
}: {
  initialOverview: PreprodBackupOverview | null;
  initialNotice?: string;
  initialError?: string;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const [notice, setNotice] = useState(initialNotice || '');
  const [error, setError] = useState(initialError || '');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [browserTimeZone, setBrowserTimeZone] = useState(FALLBACK_TIME_ZONE);

  useEffect(() => {
    setBrowserTimeZone(getBrowserTimeZone());
  }, []);

  const summaryCards = useMemo(
    () => (overview ? buildSummaryCards(overview.entries.length, overview.retentionDays) : []),
    [overview]
  );

  return (
    <div className="portal-body">
      <PageIntro
        title="Database Backups"
        subtitle="Self-hosted backup and restore controls for Serapod Preprod only. Production is intentionally excluded."
      />

      {overview ? <SummaryGrid cards={summaryCards} /> : null}

      {notice ? <div className="portal-banner portal-banner-success">{notice}</div> : null}
      {error ? <div className="portal-banner portal-banner-error">{error}</div> : null}
      {isBackingUp ? (
        <div className="portal-banner portal-banner-info" aria-live="polite">
          Backup is running on the preprod host. The history, count, and latest backup card will refresh automatically when it finishes.
        </div>
      ) : null}

      <section className="portal-panel">
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
            <p className="portal-page-sub">This page is wired only to preprod host scripts. No production restore path is exposed here.</p>
          </div>
        </div>
        <div className="portal-activity-list">
          <div className="portal-activity-item">Restore matches the Cloud workflow conceptually, but is powered by host-side scripts and cron.</div>
          <div className="portal-activity-item">A restore is destructive and should be treated as a preprod-only operation.</div>
          {(overview?.backupLogTail || []).map((line) => (
            <div key={line} className="portal-activity-item portal-log-line">
              {line}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}