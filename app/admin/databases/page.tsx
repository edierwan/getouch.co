import { PageIntro, SummaryGrid } from '../ui';
import { BackupNowForm, RestoreBackupDialog } from './DatabaseActions';
import { getPreprodBackupOverview } from '@/lib/preprod-backups';

function buildSummaryCards(backupCount: number, retentionDays: number) {
  return [
    { label: 'STACK', value: 'Preprod Only', tone: 'active' as const, icon: '◫' },
    { label: 'SCHEDULE', value: 'Daily 02:15', icon: '◷' },
    { label: 'RETENTION', value: `${retentionDays} days`, icon: '⟲' },
    { label: 'BACKUPS', value: String(backupCount), icon: '▤' },
  ];
}

export default async function DatabasesPage({
  searchParams,
}: {
  searchParams?: Promise<{ notice?: string; error?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) || {};

  let overview = null;
  let overviewError = '';

  try {
    overview = await getPreprodBackupOverview();
  } catch (error) {
    overviewError = error instanceof Error ? error.message : 'Failed to read preprod backup state.';
  }

  return (
    <div className="portal-body">
      <PageIntro
        title="Database Backups"
        subtitle="Self-hosted backup and restore controls for Serapod Preprod only. Production is intentionally excluded."
      />

      {overview ? <SummaryGrid cards={buildSummaryCards(overview.entries.length, overview.retentionDays)} /> : null}

      {resolvedSearchParams.notice ? <div className="portal-banner portal-banner-success">{resolvedSearchParams.notice}</div> : null}
      {resolvedSearchParams.error ? <div className="portal-banner portal-banner-error">{resolvedSearchParams.error}</div> : null}
      {overviewError ? <div className="portal-banner portal-banner-error">{overviewError}</div> : null}

      <section className="portal-panel">
        <div className="portal-panel-head portal-panel-head-inline">
          <div>
            <h3 className="portal-panel-title">Preprod Backup Control</h3>
            <p className="portal-page-sub">
              Backups run on <strong>{overview?.sshTarget || 'the preprod host'}</strong> and are stored under{' '}
              <strong>{overview?.backupRoot || 'the configured backup root'}</strong>.
            </p>
          </div>
          <BackupNowForm />
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
            <span className="portal-info-table-value">{overview?.latest?.name || 'No backups found yet'}</span>
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
                  <div className="portal-resource-name">{entry.name}</div>
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
                  <RestoreBackupDialog backupName={entry.name} backupPath={entry.path} createdAt={entry.createdAt} />
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