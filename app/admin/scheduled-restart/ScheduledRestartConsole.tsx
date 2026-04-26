'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

type RestartOverview = {
  config: {
    id: string | null;
    targetHost: string;
    targetLabel: string;
    enabled: boolean;
    scheduleType: 'one-time' | 'daily' | 'weekly';
    timezone: string;
    oneTimeAt: string | null;
    dailyTime: string | null;
    weeklyDay: number | null;
    weeklyTime: string | null;
    note: string | null;
    nextRunAt: string | null;
    lastAppliedAt: string | null;
    lastAppliedBy: string | null;
    lastRemoteStatus: string | null;
    lastRemoteMessage: string | null;
    lastRemoteSyncAt: string | null;
  };
  server: {
    sshTarget: string;
    timezone: string;
    timezoneOffset: string;
    currentTime: string;
    bootedAt: string | null;
    cronInstalled: boolean;
  };
  latestJobStatus: {
    status: string;
    summary: string;
    createdAt: string | null;
    source: 'portal' | 'remote' | null;
  };
  history: Array<{
    id: string;
    createdAt: string;
    source: 'portal' | 'remote';
    status: string;
    eventType: string;
    summary: string;
    actorEmail: string | null;
    details: Record<string, unknown>;
  }>;
};

type FormState = {
  enabled: boolean;
  scheduleType: 'one-time' | 'daily' | 'weekly';
  timezone: string;
  oneTimeAt: string;
  dailyTime: string;
  weeklyDay: number;
  weeklyTime: string;
  note: string;
};

const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

function formatDateTime(value: string | null) {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleString();
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function getZonedParts(ms: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(ms));
  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.get('year')),
    month: Number(lookup.get('month')),
    day: Number(lookup.get('day')),
    hour: Number(lookup.get('hour')),
    minute: Number(lookup.get('minute')),
  };
}

function zonedLocalToUtcIso(localValue: string, timeZone: string) {
  if (!localValue) return '';
  const [datePart, timePart] = localValue.split('T');
  if (!datePart || !timePart) return '';

  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);

  const desiredUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  let guess = desiredUtcMs;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const zoned = getZonedParts(guess, timeZone);
    const zonedUtcMs = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute);
    const diff = desiredUtcMs - zonedUtcMs;
    if (diff === 0) break;
    guess += diff;
  }

  return new Date(guess).toISOString();
}

function utcIsoToZonedLocal(value: string | null, timeZone: string) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  const zoned = getZonedParts(parsed.getTime(), timeZone);
  return `${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)}T${pad(zoned.hour)}:${pad(zoned.minute)}`;
}

function statusClass(status: string) {
  if (status === 'success' || status === 'scheduled' || status === 'reboot-requested') return 'portal-status portal-status-good';
  if (status === 'disabled' || status === 'dry-run' || status === 'idle') return 'portal-status portal-status-active';
  return 'portal-status portal-status-warning';
}

function buildForm(config: RestartOverview['config'], serverTimeZone: string): FormState {
  const timeZone = config.timezone || serverTimeZone || 'UTC';
  return {
    enabled: config.enabled,
    scheduleType: config.scheduleType,
    timezone: timeZone,
    oneTimeAt: utcIsoToZonedLocal(config.oneTimeAt, timeZone),
    dailyTime: config.dailyTime || '02:30',
    weeklyDay: config.weeklyDay ?? 0,
    weeklyTime: config.weeklyTime || '02:30',
    note: config.note || '',
  };
}

export function ScheduledRestartConsole() {
  const [overview, setOverview] = useState<RestartOverview | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [armed, setArmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSaving, startSaving] = useTransition();
  const [isTesting, startTesting] = useTransition();
  const [isRefreshing, startRefreshing] = useTransition();

  async function loadOverview() {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/scheduled-restart', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Unable to load scheduled restart overview');
      }

      setOverview(payload);
      setForm(buildForm(payload, payload.server.timezone));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load scheduled restart overview');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
  }, []);

  const timezoneOptions = useMemo(() => {
    const serverTimeZone = overview?.server.timezone || 'UTC';
    return Array.from(new Set([serverTimeZone, 'Asia/Kuala_Lumpur', 'UTC']));
  }, [overview?.server.timezone]);

  async function saveConfiguration(enabledOverride?: boolean) {
    if (!form) return;
    setError('');
    setMessage('');

    const payload = {
      enabled: enabledOverride ?? form.enabled,
      scheduleType: form.scheduleType,
      timezone: form.timezone,
      oneTimeAt: form.oneTimeAt ? zonedLocalToUtcIso(form.oneTimeAt, form.timezone) : null,
      dailyTime: form.dailyTime || null,
      weeklyDay: form.weeklyDay,
      weeklyTime: form.weeklyTime || null,
      note: form.note,
    };

    const response = await fetch('/api/admin/scheduled-restart', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(typeof body?.error === 'string' ? body.error : 'Unable to save scheduled restart');
    }

    setOverview(body);
    setForm(buildForm(body, body.server.timezone));
    setMessage(enabledOverride === false ? 'Scheduled restart disabled.' : 'Scheduled restart saved.');
    setArmed(false);
  }

  function handleSave() {
    if (!armed) {
      setError('Tick the confirmation box before saving any restart schedule changes.');
      return;
    }

    startSaving(async () => {
      try {
        await saveConfiguration();
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Unable to save scheduled restart');
      }
    });
  }

  function handleDisable() {
    startSaving(async () => {
      try {
        await saveConfiguration(false);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Unable to disable scheduled restart');
      }
    });
  }

  function handleDryTest() {
    startTesting(async () => {
      setError('');
      setMessage('');

      try {
        const response = await fetch('/api/admin/scheduled-restart/test', { method: 'POST' });
        const body = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(typeof body?.error === 'string' ? body.error : 'Unable to run dry test');
        }

        setOverview(body);
        setForm(buildForm(body, body.server.timezone));
        setMessage('Dry-run completed. No reboot was triggered.');
      } catch (testError) {
        setError(testError instanceof Error ? testError.message : 'Unable to run dry test');
      }
    });
  }

  if (loading || !overview || !form) {
    return <section className="portal-panel">Loading scheduled restart controls…</section>;
  }

  return (
    <div className="portal-restart-shell">
      {error ? <div className="portal-ai-error">{error}</div> : null}
      {message ? <div className="portal-ai-success">{message}</div> : null}

      <div className="portal-restart-grid">
        <section className="portal-panel">
          <div className="portal-panel-head portal-panel-head-inline">
            <div>
              <h3 className="portal-panel-title">Restart Schedule</h3>
              <p className="portal-page-sub">Controlled reboot scheduling for {overview.config.targetLabel}. Save only writes schedule state and host cron. It will not reboot immediately.</p>
            </div>
            <div className="portal-action-row">
              <button type="button" className="portal-action-link" onClick={() => startRefreshing(() => loadOverview())}>
                {isRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              <button type="button" className="portal-action-link" onClick={handleDryTest}>
                {isTesting ? 'Testing…' : 'Run Dry Test'}
              </button>
            </div>
          </div>

          <div className="portal-warning-box">
            <div className="portal-warning-title">Operational Warning</div>
            <ul className="portal-warning-list">
              <li>Scheduled reboot is supported by software and runs through a guarded host-side cron wrapper.</li>
              <li>Full shutdown with automatic power-on may require motherboard, BIOS, or RTC wake support and is not guaranteed on every server.</li>
              <li>Saving this form does not trigger an immediate reboot. Only the scheduled job or an explicit future enhancement would do that.</li>
            </ul>
          </div>

          <div className="portal-dify-form-grid portal-restart-form-grid">
            <label className="portal-dify-checkbox">
              <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => current ? { ...current, enabled: event.target.checked } : current)} />
              <span>Enable scheduled restart</span>
            </label>

            <label className="portal-ai-field">
              <span className="portal-ai-field-label">Schedule type</span>
              <select className="portal-ai-input" value={form.scheduleType} onChange={(event) => setForm((current) => current ? { ...current, scheduleType: event.target.value as FormState['scheduleType'] } : current)}>
                <option value="one-time">one-time</option>
                <option value="daily">daily</option>
                <option value="weekly">weekly</option>
              </select>
            </label>

            <label className="portal-ai-field">
              <span className="portal-ai-field-label">Timezone</span>
              <select className="portal-ai-input" value={form.timezone} onChange={(event) => setForm((current) => current ? { ...current, timezone: event.target.value, oneTimeAt: current.oneTimeAt ? utcIsoToZonedLocal(zonedLocalToUtcIso(current.oneTimeAt, current.timezone), event.target.value) : current.oneTimeAt } : current)}>
                {timezoneOptions.map((timeZone) => (
                  <option key={timeZone} value={timeZone}>{timeZone}</option>
                ))}
              </select>
            </label>

            {form.scheduleType === 'one-time' ? (
              <label className="portal-ai-field">
                <span className="portal-ai-field-label">Date and time</span>
                <input type="datetime-local" className="portal-ai-input" value={form.oneTimeAt} onChange={(event) => setForm((current) => current ? { ...current, oneTimeAt: event.target.value } : current)} />
              </label>
            ) : null}

            {form.scheduleType === 'daily' ? (
              <label className="portal-ai-field">
                <span className="portal-ai-field-label">Daily time</span>
                <input type="time" className="portal-ai-input" value={form.dailyTime} onChange={(event) => setForm((current) => current ? { ...current, dailyTime: event.target.value } : current)} />
              </label>
            ) : null}

            {form.scheduleType === 'weekly' ? (
              <>
                <label className="portal-ai-field">
                  <span className="portal-ai-field-label">Weekly day</span>
                  <select className="portal-ai-input" value={form.weeklyDay} onChange={(event) => setForm((current) => current ? { ...current, weeklyDay: Number(event.target.value) } : current)}>
                    {WEEKDAY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="portal-ai-field">
                  <span className="portal-ai-field-label">Weekly time</span>
                  <input type="time" className="portal-ai-input" value={form.weeklyTime} onChange={(event) => setForm((current) => current ? { ...current, weeklyTime: event.target.value } : current)} />
                </label>
              </>
            ) : null}

            <label className="portal-ai-field portal-dify-field-span-2">
              <span className="portal-ai-field-label">Note / reason</span>
              <textarea className="portal-ai-textarea" rows={4} value={form.note} onChange={(event) => setForm((current) => current ? { ...current, note: event.target.value } : current)} placeholder="Reason for scheduled reboot, maintenance context, or operator note." />
            </label>
          </div>

          <label className="portal-dify-checkbox portal-restart-confirm">
            <input type="checkbox" checked={armed} onChange={(event) => setArmed(event.target.checked)} />
            <span>I understand this saves or updates a reboot schedule but does not reboot immediately.</span>
          </label>

          <div className="portal-ai-button-row">
            <button type="button" className="portal-ai-button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Schedule'}
            </button>
            <button type="button" className="portal-ai-button portal-ai-button-secondary" onClick={handleDisable} disabled={isSaving}>
              Disable Schedule
            </button>
          </div>
        </section>

        <section className="portal-panel">
          <div className="portal-panel-head">
            <div>
              <h3 className="portal-panel-title">Current Status</h3>
              <p className="portal-page-sub">Latest host sync, next restart window, and job activity.</p>
            </div>
          </div>

          <div className="portal-info-table">
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Target host</span>
              <span className="portal-info-table-value">{overview.config.targetLabel} · {overview.config.targetHost}</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">SSH target</span>
              <span className="portal-info-table-value">{overview.server.sshTarget}</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Server timezone</span>
              <span className="portal-info-table-value">{overview.server.timezone} ({overview.server.timezoneOffset})</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Server time now</span>
              <span className="portal-info-table-value">{formatDateTime(overview.server.currentTime)}</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Next scheduled restart</span>
              <span className="portal-info-table-value">{formatDateTime(overview.config.nextRunAt)}</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Latest job status</span>
              <span className="portal-info-table-value">
                <span className={statusClass(overview.latestJobStatus.status)}>{overview.latestJobStatus.status.toUpperCase()}</span>
                <span className="portal-restart-inline-copy">{overview.latestJobStatus.summary}</span>
              </span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Cron installed</span>
              <span className="portal-info-table-value">{overview.server.cronInstalled ? 'Yes' : 'No'}</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Last applied</span>
              <span className="portal-info-table-value">{overview.config.lastAppliedAt ? `${formatDateTime(overview.config.lastAppliedAt)} by ${overview.config.lastAppliedBy || 'unknown'}` : 'Not yet saved from portal'}</span>
            </div>
            <div className="portal-info-table-row">
              <span className="portal-info-table-label">Last host boot</span>
              <span className="portal-info-table-value">{formatDateTime(overview.server.bootedAt)}</span>
            </div>
          </div>
        </section>
      </div>

      <section className="portal-panel">
        <div className="portal-panel-head">
          <div>
            <h3 className="portal-panel-title">Restart History</h3>
            <p className="portal-page-sub">Portal-side audit actions and remote host execution records are merged here for v1.</p>
          </div>
        </div>

        <div className="portal-restart-history-list">
          {overview.history.length === 0 ? <div className="portal-activity-item">No restart history recorded yet.</div> : null}
          {overview.history.map((entry) => (
            <article key={entry.id} className="portal-restart-history-item">
              <div className="portal-restart-history-head">
                <div>
                  <div className="portal-resource-name">{entry.summary}</div>
                  <div className="portal-resource-desc">{formatDateTime(entry.createdAt)} · {entry.source}{entry.actorEmail ? ` · ${entry.actorEmail}` : ''}</div>
                </div>
                <span className={statusClass(entry.status)}>{entry.status.toUpperCase()}</span>
              </div>
              <div className="portal-inline-meta">Event: {entry.eventType}</div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}