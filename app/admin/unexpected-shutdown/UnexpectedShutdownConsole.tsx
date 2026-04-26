'use client';

import { useEffect, useState, useTransition } from 'react';

type ShutdownAnalysis = {
  host: {
    label: string;
    sshTarget: string;
    collectedAt: string;
    status: 'online' | 'degraded' | 'unknown';
  };
  current: {
    lastBootTime: string | null;
    uptime: string;
  };
  previousShutdown: {
    type: 'clean' | 'unexpected' | 'unknown';
    summary: string;
    events: Array<{ kind: string; raw: string }>;
  };
  assessment: {
    likelyCause: string;
    conclusive: boolean;
    confidence: 'low' | 'medium' | 'high';
    likely: string[];
    possible: string[];
    weakSignals: string[];
    noEvidence: string[];
  };
  evidence: Array<{ title: string; items: string[] }>;
  resources: {
    memory: string;
    disk: string;
    inodes: string;
    containerPressure: string;
  };
  hardware: {
    temperature: string;
    diskHealth: string;
    privilegedVisibility: string;
  };
  scheduling: {
    unattendedUpgrades: string;
    cron: string;
    timers: string;
    watchdog: string;
  };
  criticalMessages: string[];
  alerting: {
    phoneConfigured: boolean;
    phoneHint: string;
    unexpectedShutdownPreview: string;
    backOnlinePreview: string;
    criticalWarningPreview: string;
  };
};

function statusClass(value: string) {
  if (value === 'online' || value === 'clean') return 'portal-status portal-status-good';
  if (value === 'unknown') return 'portal-status portal-status-active';
  return 'portal-status portal-status-warning';
}

function formatDateTime(value: string | null) {
  if (!value) return 'Unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export function UnexpectedShutdownConsole() {
  const [analysis, setAnalysis] = useState<ShutdownAnalysis | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [alertType, setAlertType] = useState<'unexpected-shutdown' | 'back-online' | 'critical-warning'>('unexpected-shutdown');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, startRefreshing] = useTransition();
  const [isSendingAlert, startSendingAlert] = useTransition();

  async function loadAnalysis() {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/unexpected-shutdown', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Unable to load diagnostics');
      }

      setAnalysis(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load diagnostics');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnalysis();
  }, []);

  function sendAlertTest() {
    startSendingAlert(async () => {
      setError('');
      setMessage('');

      try {
        const response = await fetch('/api/admin/unexpected-shutdown/alert-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: alertType, phone }),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(typeof payload?.error === 'string' ? payload.error : 'Unable to send alert test');
        }

        setMessage(`Alert test sent for ${alertType}.`);
      } catch (sendError) {
        setError(sendError instanceof Error ? sendError.message : 'Unable to send alert test');
      }
    });
  }

  if (loading && !analysis) {
    return <section className="portal-panel">Loading shutdown diagnostics…</section>;
  }

  return (
    <div className="portal-restart-shell">
      {error ? <div className="portal-ai-error">{error}</div> : null}
      {message ? <div className="portal-ai-success">{message}</div> : null}

      {analysis ? (
        <>
          <section className="portal-panel">
            <div className="portal-panel-head portal-panel-head-inline">
              <div>
                <h3 className="portal-panel-title">Current Summary</h3>
                <p className="portal-page-sub">Sanitized investigation output from the VPS host. This path is read-only and does not change host state.</p>
              </div>
              <button type="button" className="portal-action-link" onClick={() => startRefreshing(() => loadAnalysis())}>
                {isRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>

            <div className="portal-info-table">
              <div className="portal-info-table-row"><span className="portal-info-table-label">Current status</span><span className="portal-info-table-value"><span className={statusClass(analysis.host.status)}>{analysis.host.status.toUpperCase()}</span></span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Last boot time</span><span className="portal-info-table-value">{formatDateTime(analysis.current.lastBootTime)}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">System uptime</span><span className="portal-info-table-value">{analysis.current.uptime}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Previous shutdown type</span><span className="portal-info-table-value"><span className={statusClass(analysis.previousShutdown.type)}>{analysis.previousShutdown.type.toUpperCase()}</span></span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Likely cause</span><span className="portal-info-table-value">{analysis.assessment.likelyCause}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Evidence confidence</span><span className="portal-info-table-value">{analysis.assessment.conclusive ? 'Conclusive' : `Not conclusive (${analysis.assessment.confidence})`}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Collected at</span><span className="portal-info-table-value">{formatDateTime(analysis.host.collectedAt)}</span></div>
            </div>
          </section>

          <section className="portal-panel">
            <h3 className="portal-panel-title">Evidence Summary</h3>
            <div className="portal-detail-grid">
              {analysis.evidence.map((bucket) => (
                <section key={bucket.title} className="portal-panel">
                  <h4 className="portal-panel-label">{bucket.title.toUpperCase()}</h4>
                  <div className="portal-activity-list">
                    {bucket.items.map((item) => <div key={item} className="portal-activity-item">{item}</div>)}
                  </div>
                </section>
              ))}
            </div>
          </section>

          <section className="portal-panel">
            <h3 className="portal-panel-title">Root-Cause Assessment</h3>
            <div className="portal-detail-grid">
              <section className="portal-panel">
                <h4 className="portal-panel-label">LIKELY</h4>
                <div className="portal-activity-list">
                  {(analysis.assessment.likely.length ? analysis.assessment.likely : ['No strong likely-cause evidence beyond the summary classification.']).map((item) => <div key={item} className="portal-activity-item">{item}</div>)}
                </div>
              </section>
              <section className="portal-panel">
                <h4 className="portal-panel-label">POSSIBLE</h4>
                <div className="portal-activity-list">
                  {(analysis.assessment.possible.length ? analysis.assessment.possible : ['No additional possible causes were elevated beyond the likely bucket.']).map((item) => <div key={item} className="portal-activity-item">{item}</div>)}
                </div>
              </section>
              <section className="portal-panel">
                <h4 className="portal-panel-label">WEAK SIGNALS</h4>
                <div className="portal-activity-list">
                  {(analysis.assessment.weakSignals.length ? analysis.assessment.weakSignals : ['No weak-signal contributors were detected from the sampled data.']).map((item) => <div key={item} className="portal-activity-item">{item}</div>)}
                </div>
              </section>
              <section className="portal-panel">
                <h4 className="portal-panel-label">NO EVIDENCE</h4>
                <div className="portal-activity-list">
                  {analysis.assessment.noEvidence.map((item) => <div key={item} className="portal-activity-item">{item}</div>)}
                </div>
              </section>
            </div>
          </section>

          <section className="portal-panel">
            <h3 className="portal-panel-title">Pressure And Hardware Visibility</h3>
            <div className="portal-info-table">
              <div className="portal-info-table-row"><span className="portal-info-table-label">Memory pressure</span><span className="portal-info-table-value">{analysis.resources.memory}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Disk pressure</span><span className="portal-info-table-value">{analysis.resources.disk}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Inode pressure</span><span className="portal-info-table-value">{analysis.resources.inodes}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Container and app pressure</span><span className="portal-info-table-value">{analysis.resources.containerPressure}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Temperature</span><span className="portal-info-table-value">{analysis.hardware.temperature}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Disk health</span><span className="portal-info-table-value">{analysis.hardware.diskHealth}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Privileged visibility</span><span className="portal-info-table-value">{analysis.hardware.privilegedVisibility}</span></div>
            </div>
          </section>

          <section className="portal-panel">
            <h3 className="portal-panel-title">Schedulers And Last Events</h3>
            <div className="portal-info-table">
              <div className="portal-info-table-row"><span className="portal-info-table-label">Unattended upgrades</span><span className="portal-info-table-value">{analysis.scheduling.unattendedUpgrades}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Cron</span><span className="portal-info-table-value">{analysis.scheduling.cron}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Systemd timers</span><span className="portal-info-table-value">{analysis.scheduling.timers}</span></div>
              <div className="portal-info-table-row"><span className="portal-info-table-label">Watchdog</span><span className="portal-info-table-value">{analysis.scheduling.watchdog}</span></div>
            </div>

            <div className="portal-activity-list">
              {analysis.previousShutdown.events.map((event) => (
                <div key={event.raw} className="portal-activity-item">{event.raw}</div>
              ))}
            </div>
          </section>

          <section className="portal-panel">
            <div className="portal-panel-head">
              <div>
                <h3 className="portal-panel-title">Last Critical Kernel/System Messages</h3>
                <p className="portal-page-sub">Only signal-bearing lines are shown. Routine UFW and tunnel noise is intentionally suppressed.</p>
              </div>
            </div>
            <div className="portal-activity-list">
              {(analysis.criticalMessages.length ? analysis.criticalMessages : ['No critical kernel or system messages were captured in the accessible filtered log set.']).map((line) => (
                <div key={line} className="portal-activity-item">{line}</div>
              ))}
            </div>
          </section>

          <section className="portal-panel">
            <div className="portal-panel-head">
              <div>
                <h3 className="portal-panel-title">WhatsApp Alert Test</h3>
                <p className="portal-page-sub">Manual test only. This does not enable automatic alerting and is intended for safe simulation of the alert templates.</p>
              </div>
            </div>

            <div className="portal-dify-form-grid portal-restart-form-grid">
              <label className="portal-ai-field">
                <span className="portal-ai-field-label">Alert type</span>
                <select className="portal-ai-input" value={alertType} onChange={(event) => setAlertType(event.target.value as typeof alertType)}>
                  <option value="unexpected-shutdown">Unexpected shutdown suspected</option>
                  <option value="back-online">System back online</option>
                  <option value="critical-warning">Critical hardware/system warning</option>
                </select>
              </label>

              <label className="portal-ai-field">
                <span className="portal-ai-field-label">Phone override</span>
                <input
                  className="portal-ai-input"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder={analysis.alerting.phoneConfigured ? `Default configured: ${analysis.alerting.phoneHint}` : '6019xxxxxxxx'}
                />
              </label>
            </div>

            <div className="portal-action-row">
              <button type="button" className="portal-action-link" onClick={sendAlertTest}>
                {isSendingAlert ? 'Sending…' : 'Send Alert Test'}
              </button>
            </div>

            <div className="portal-warning-box">
              <div className="portal-warning-title">Current Preview</div>
              <div className="portal-activity-list">
                {(alertType === 'unexpected-shutdown'
                  ? analysis.alerting.unexpectedShutdownPreview
                  : alertType === 'back-online'
                    ? analysis.alerting.backOnlinePreview
                    : analysis.alerting.criticalWarningPreview
                ).split('\n').map((line, index) => <div key={`${alertType}-${index}-${line}`} className="portal-activity-item">{line || ' '}</div>)}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}