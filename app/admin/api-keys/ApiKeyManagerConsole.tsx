'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

type Tab = 'keys' | 'scopes' | 'gateways' | 'usage' | 'audit';

interface ApiKeyRow {
  id: string;
  name: string;
  tenantId: string | null;
  environment: 'live' | 'test';
  keyPrefix: string;
  status: 'active' | 'disabled' | 'revoked' | 'rotating' | 'expired';
  services: string[];
  scopes: string[];
  allowedOrigins: string[];
  validationSource: 'central' | 'legacy_wa' | 'env' | 'manual' | 'unknown';
  rateLimitCount: number | null;
  rateLimitWindowSeconds: number | null;
  notes: string | null;
  createdAt: string;
  createdByEmail: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedService: string | null;
  revokedAt: string | null;
}

interface Gateway {
  id: string;
  name: string;
  domain: string;
  region: string;
  status: 'active' | 'ready' | 'planned' | 'not_configured';
  validation: 'central' | 'legacy' | 'manual' | 'planned';
  description: string;
}

interface SecretInventoryItem {
  service: string;
  envName: string;
  secretType: string;
  status: 'configured' | 'missing' | 'unknown';
  managedBy: string;
  notes?: string;
}

interface AuditRow {
  id: string;
  action: string;
  actorEmail: string | null;
  summary: string | null;
  keyPrefix: string | null;
  createdAt: string;
}

interface ApiResponse {
  stats: { totalKeys: number; activeKeys: number; gatewayServices: number; requestsToday: number };
  keys: ApiKeyRow[];
  audit: AuditRow[];
  gateways: Gateway[];
  secretInventory: SecretInventoryItem[];
  scopeCatalog: Record<string, string[]>;
  services: string[];
}

const SERVICE_LABELS: Record<string, string> = {
  ai: 'AI',
  whatsapp: 'WhatsApp',
  voice: 'Voice',
  webhooks: 'Webhooks',
  internal: 'Internal',
};

const SERVICE_TONE: Record<string, string> = {
  ai: 'portal-tag-violet',
  whatsapp: 'portal-tag-emerald',
  voice: 'portal-tag-cyan',
  webhooks: 'portal-tag-amber',
  internal: 'portal-tag-slate',
};

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return '—';
  const diff = Date.now() - d;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function statusTone(s: ApiKeyRow['status']) {
  switch (s) {
    case 'active': return 'portal-status-good';
    case 'rotating': return 'portal-status-active';
    case 'disabled': return 'portal-status-warning';
    case 'revoked':
    case 'expired': return 'portal-status-warning';
    default: return 'portal-status-good';
  }
}

function gatewayStatusTone(s: Gateway['status']) {
  switch (s) {
    case 'active': return 'portal-status-good';
    case 'ready': return 'portal-status-good';
    case 'planned': return 'portal-status-warning';
    default: return 'portal-status-warning';
  }
}

export function ApiKeyManagerConsole() {
  const [tab, setTab] = useState<Tab>('keys');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [envFilter, setEnvFilter] = useState<'all' | 'live' | 'test'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ApiKeyRow['status']>('all');
  const [createdKey, setCreatedKey] = useState<{ name: string; plaintext: string; keyPrefix: string } | null>(null);
  const [busy, startTransition] = useTransition();

  // Create-form state
  const [formName, setFormName] = useState('');
  const [formEnv, setFormEnv] = useState<'live' | 'test'>('live');
  const [formTenant, setFormTenant] = useState('');
  const [formServices, setFormServices] = useState<Set<string>>(new Set());
  const [formScopes, setFormScopes] = useState<Set<string>>(new Set());
  const [formRateLimit, setFormRateLimit] = useState('1000');
  const [formExpires, setFormExpires] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/api-keys', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const json = (await res.json()) as ApiResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.keys.filter((k) => {
      if (envFilter !== 'all' && k.environment !== envFilter) return false;
      if (statusFilter !== 'all' && k.status !== statusFilter) return false;
      if (!q) return true;
      return (
        k.name.toLowerCase().includes(q) ||
        k.keyPrefix.toLowerCase().includes(q) ||
        (k.tenantId ?? '').toLowerCase().includes(q)
      );
    });
  }, [data, search, envFilter, statusFilter]);

  function toggleSet(setter: (s: Set<string>) => void, current: Set<string>, value: string) {
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!formName.trim()) {
      setFormError('Key name is required.');
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/api-keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            environment: formEnv,
            tenantId: formTenant.trim() || null,
            services: Array.from(formServices),
            scopes: Array.from(formScopes),
            rateLimitCount: formRateLimit ? Number(formRateLimit) : null,
            rateLimitWindowSeconds: formRateLimit ? 60 : null,
            expiresAt: formExpires || null,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
        setCreatedKey({ name: formName.trim(), plaintext: json.plaintext, keyPrefix: json.key.keyPrefix });
        setFormName('');
        setFormTenant('');
        setFormServices(new Set());
        setFormScopes(new Set());
        setFormExpires('');
        await reload();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Create failed');
      }
    });
  }

  async function actOnKey(id: string, action: 'rotate' | 'disable' | 'revoke' | 'enable') {
    const confirmText: Record<string, string> = {
      revoke: 'Revoke this key permanently? Existing clients will stop working.',
      disable: 'Disable this key? It can be re-enabled later.',
      rotate: 'Rotate this key? A new key will be generated and shown ONCE.',
      enable: 'Re-enable this key?',
    };
    if (!window.confirm(confirmText[action])) return;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/api-keys/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
        if (action === 'rotate' && json.plaintext) {
          setCreatedKey({
            name: 'Rotated key',
            plaintext: json.plaintext,
            keyPrefix: json.key.keyPrefix,
          });
        }
        await reload();
      } catch (err) {
        window.alert((err as Error).message);
      }
    });
  }

  const stats = data?.stats ?? { totalKeys: 0, activeKeys: 0, gatewayServices: 0, requestsToday: 0 };
  const activePct = stats.totalKeys > 0 ? Math.round((stats.activeKeys / stats.totalKeys) * 100) : 0;

  return (
    <div className="portal-akm-grid">
      {/* ========== LEFT: Stats + tabs + table ========== */}
      <div className="portal-akm-main">
        {/* Stat cards */}
        <div className="portal-akm-stats">
          <StatCard icon="🔑" label="Total Keys" value={stats.totalKeys} sub="All environments" />
          <StatCard icon="✅" label="Active Keys" value={stats.activeKeys} sub={`${activePct}% of total keys`} tone="good" />
          <StatCard icon="📦" label="Gateway Services" value={stats.gatewayServices} sub="Connected gateways" tone="violet" />
          <StatCard icon="📈" label="Requests Today" value={stats.requestsToday.toLocaleString()} sub="Last 24h" tone="amber" />
        </div>

        {/* Tabs */}
        <div className="portal-akm-tabs">
          {(['keys', 'scopes', 'gateways', 'usage', 'audit'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`portal-akm-tab ${tab === t ? 'portal-akm-tab-active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'audit' ? 'Audit Logs' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <section className="portal-panel portal-panel-fill">
          {tab === 'keys' && (
            <>
              <div className="portal-panel-head portal-panel-head-inline">
                <h3 className="portal-panel-title">API Keys</h3>
                <div className="portal-action-row">
                  <button type="button" className="portal-action-link" onClick={() => void reload()} disabled={loading}>
                    {loading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>
              </div>

              <div className="portal-akm-filters">
                <input
                  type="search"
                  placeholder="Search keys by name, tenant, or key ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="portal-akm-search"
                />
                <select value={envFilter} onChange={(e) => setEnvFilter(e.target.value as 'all' | 'live' | 'test')} className="portal-akm-select">
                  <option value="all">All Environments</option>
                  <option value="live">Live</option>
                  <option value="test">Test</option>
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | ApiKeyRow['status'])} className="portal-akm-select">
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                  <option value="revoked">Revoked</option>
                  <option value="rotating">Rotating</option>
                  <option value="expired">Expired</option>
                </select>
              </div>

              {error && <div className="portal-banner portal-banner-warning">{error}</div>}

              <div className="portal-akm-table-wrap">
                <table className="portal-akm-table">
                  <thead>
                    <tr>
                      <th>Key Name</th>
                      <th>Key ID</th>
                      <th>Tenant</th>
                      <th>Services</th>
                      <th>Scopes</th>
                      <th>Status</th>
                      <th>Last Used</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr><td colSpan={8} className="portal-akm-empty">{loading ? 'Loading…' : 'No API keys yet. Create one on the right →'}</td></tr>
                    )}
                    {filtered.map((k) => (
                      <tr key={k.id}>
                        <td>
                          <div className="portal-akm-keyname">{k.name}</div>
                          {k.notes && <div className="portal-akm-keysub">{k.notes}</div>}
                        </td>
                        <td>
                          <code className="portal-akm-prefix">{k.keyPrefix}…</code>
                        </td>
                        <td>{k.tenantId ?? '—'}</td>
                        <td>
                          <div className="portal-akm-tags">
                            {k.services.length === 0 && <span className="portal-akm-tag portal-tag-slate">none</span>}
                            {k.services.slice(0, 3).map((s) => (
                              <span key={s} className={`portal-akm-tag ${SERVICE_TONE[s] ?? 'portal-tag-slate'}`}>{SERVICE_LABELS[s] ?? s}</span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div className="portal-akm-tags">
                            {k.scopes.slice(0, 2).map((s) => (
                              <span key={s} className="portal-akm-tag portal-tag-slate">{s}</span>
                            ))}
                            {k.scopes.length > 2 && <span className="portal-akm-tag portal-tag-slate">+{k.scopes.length - 2}</span>}
                          </div>
                        </td>
                        <td>
                          <span className={`portal-status ${statusTone(k.status)}`}>● {k.status}</span>
                        </td>
                        <td>{timeAgo(k.lastUsedAt)}</td>
                        <td>
                          <div className="portal-akm-actions">
                            <button type="button" className="portal-akm-iconbtn" title="Copy prefix"
                              onClick={() => navigator.clipboard.writeText(k.keyPrefix)}>⎘</button>
                            {k.status === 'active' && (
                              <>
                                <button type="button" className="portal-akm-iconbtn" title="Rotate"
                                  onClick={() => void actOnKey(k.id, 'rotate')} disabled={busy}>↻</button>
                                <button type="button" className="portal-akm-iconbtn" title="Disable"
                                  onClick={() => void actOnKey(k.id, 'disable')} disabled={busy}>◐</button>
                              </>
                            )}
                            {k.status === 'disabled' && (
                              <button type="button" className="portal-akm-iconbtn" title="Enable"
                                onClick={() => void actOnKey(k.id, 'enable')} disabled={busy}>▶</button>
                            )}
                            {k.status !== 'revoked' && (
                              <button type="button" className="portal-akm-iconbtn portal-akm-iconbtn-danger" title="Revoke"
                                onClick={() => void actOnKey(k.id, 'revoke')} disabled={busy}>⨯</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="portal-akm-table-footer">
                Showing {filtered.length} of {data?.keys.length ?? 0} results
              </div>
            </>
          )}

          {tab === 'scopes' && data && (
            <div>
              <h3 className="portal-panel-title">Scope Catalog</h3>
              <p className="portal-page-sub">Granular permissions that can be assigned to any API key.</p>
              <div className="portal-akm-scopes-grid">
                {Object.entries(data.scopeCatalog).map(([group, list]) => (
                  <div key={group} className="portal-akm-scope-card">
                    <div className="portal-akm-scope-group">{group.toUpperCase()}</div>
                    <ul>
                      {list.map((s) => (<li key={s}><code>{s}</code></li>))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'gateways' && data && (
            <div>
              <h3 className="portal-panel-title">Service Gateways</h3>
              <p className="portal-page-sub">Where keys are validated. Central validation rolls out gateway-by-gateway.</p>
              <div className="portal-info-table">
                <div className="portal-info-table-row portal-info-table-head">
                  <span className="portal-info-table-label">Service</span>
                  <span className="portal-info-table-value">Domain · Status · Validation</span>
                </div>
                {data.gateways.map((g) => (
                  <div key={g.id} className="portal-info-table-row">
                    <span className="portal-info-table-label">{g.name}</span>
                    <span className="portal-info-table-value">
                      <code>{g.domain}</code> · <span className={`portal-status ${gatewayStatusTone(g.status)}`}>{g.status}</span> · validation: {g.validation}
                      <div className="portal-akm-keysub">{g.description}</div>
                    </span>
                  </div>
                ))}
              </div>

              <h4 className="portal-panel-label" style={{ marginTop: '1.5rem' }}>COOLIFY ENV SECRET INVENTORY</h4>
              <p className="portal-page-sub">Read-only inventory. Values are never displayed, logged, or copied to the browser.</p>
              <div className="portal-info-table">
                <div className="portal-info-table-row portal-info-table-head">
                  <span className="portal-info-table-label">Service / Env</span>
                  <span className="portal-info-table-value">Type · Status · Managed by</span>
                </div>
                {data.secretInventory.map((s) => (
                  <div key={`${s.service}:${s.envName}`} className="portal-info-table-row">
                    <span className="portal-info-table-label">
                      {s.service}
                      <div className="portal-akm-keysub"><code>{s.envName}</code></div>
                    </span>
                    <span className="portal-info-table-value">
                      {s.secretType} · <span className={`portal-status ${s.status === 'configured' ? 'portal-status-good' : 'portal-status-warning'}`}>{s.status}</span> · {s.managedBy}
                      {s.notes && <div className="portal-akm-keysub">{s.notes}</div>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'usage' && (
            <div>
              <h3 className="portal-panel-title">Usage</h3>
              <p className="portal-page-sub">Per-key request volume and last activity.</p>
              <div className="portal-info-table">
                <div className="portal-info-table-row portal-info-table-head">
                  <span className="portal-info-table-label">Key</span>
                  <span className="portal-info-table-value">Last used · Service · Status</span>
                </div>
                {(data?.keys ?? []).map((k) => (
                  <div key={k.id} className="portal-info-table-row">
                    <span className="portal-info-table-label">
                      {k.name}
                      <div className="portal-akm-keysub"><code>{k.keyPrefix}</code></div>
                    </span>
                    <span className="portal-info-table-value">
                      {timeAgo(k.lastUsedAt)} · {k.lastUsedService ?? '—'} · <span className={`portal-status ${statusTone(k.status)}`}>{k.status}</span>
                    </span>
                  </div>
                ))}
                {(data?.keys?.length ?? 0) === 0 && (
                  <div className="portal-akm-empty">No usage recorded yet.</div>
                )}
              </div>
            </div>
          )}

          {tab === 'audit' && (
            <div>
              <h3 className="portal-panel-title">Audit Logs</h3>
              <p className="portal-page-sub">Recent administrative events. Authorization headers are never logged.</p>
              <div className="portal-info-table">
                <div className="portal-info-table-row portal-info-table-head">
                  <span className="portal-info-table-label">Event</span>
                  <span className="portal-info-table-value">When · Actor</span>
                </div>
                {(data?.audit ?? []).map((a) => (
                  <div key={a.id} className="portal-info-table-row">
                    <span className="portal-info-table-label">
                      <strong>{a.action}</strong> {a.summary && <span className="portal-akm-keysub">{a.summary}</span>}
                      {a.keyPrefix && <div className="portal-akm-keysub"><code>{a.keyPrefix}</code></div>}
                    </span>
                    <span className="portal-info-table-value">
                      {timeAgo(a.createdAt)} · {a.actorEmail ?? 'system'}
                    </span>
                  </div>
                ))}
                {(data?.audit?.length ?? 0) === 0 && (
                  <div className="portal-akm-empty">No audit events yet.</div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Bottom row: Service Gateways + Recent Activity */}
        <div className="portal-akm-bottom">
          <section className="portal-panel">
            <div className="portal-panel-head">
              <h3 className="portal-panel-title">Service Gateways</h3>
            </div>
            <div className="portal-akm-gateways">
              {(data?.gateways ?? []).map((g) => (
                <div key={g.id} className="portal-akm-gateway-card">
                  <div className="portal-akm-gateway-icon">{
                    g.id === 'vllm' ? '🧠' : g.id === 'whatsapp' ? '💬' : g.id === 'voice' ? '🎙' : '◇'
                  }</div>
                  <div className="portal-akm-gateway-name">{g.name}</div>
                  <div className={`portal-status ${gatewayStatusTone(g.status)}`}>● {g.status}</div>
                  <div className="portal-akm-keysub">{g.region}</div>
                </div>
              ))}
            </div>
            <div className="portal-akm-bottom-link">
              <a href="#gateways" onClick={(e) => { e.preventDefault(); setTab('gateways'); }} className="portal-action-link">Manage Gateways →</a>
            </div>
          </section>

          <section className="portal-panel">
            <div className="portal-panel-head portal-panel-head-inline">
              <h3 className="portal-panel-title">Recent Activity</h3>
              <a href="#audit" onClick={(e) => { e.preventDefault(); setTab('audit'); }} className="portal-action-link">View all →</a>
            </div>
            <ul className="portal-akm-activity">
              {(data?.audit ?? []).slice(0, 6).map((a) => (
                <li key={a.id}>
                  <span className="portal-akm-activity-dot">●</span>
                  <div>
                    <div><strong>{a.action}</strong> {a.summary}</div>
                    <div className="portal-akm-keysub">{a.actorEmail ?? 'system'} · {timeAgo(a.createdAt)}</div>
                  </div>
                </li>
              ))}
              {(data?.audit?.length ?? 0) === 0 && (
                <li className="portal-akm-empty">No activity yet.</li>
              )}
            </ul>
          </section>
        </div>
      </div>

      {/* ========== RIGHT: Create panel ========== */}
      <aside className="portal-akm-create">
        <h3 className="portal-panel-title">Create API Key</h3>

        {createdKey && (
          <div className="portal-banner portal-banner-warning portal-akm-once">
            <div><strong>Save this key now — it will not be shown again.</strong></div>
            <div className="portal-akm-once-name">{createdKey.name}</div>
            <code className="portal-akm-once-value">{createdKey.plaintext}</code>
            <div className="portal-akm-once-actions">
              <button type="button" className="portal-action-link"
                onClick={() => navigator.clipboard.writeText(createdKey.plaintext)}>Copy full key</button>
              <button type="button" className="portal-action-link" onClick={() => setCreatedKey(null)}>Dismiss</button>
            </div>
          </div>
        )}

        <form onSubmit={submitCreate} className="portal-akm-form">
          <label className="portal-akm-field">
            <span>Key Name</span>
            <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Production Integration" maxLength={200} />
          </label>

          <label className="portal-akm-field">
            <span>Environment</span>
            <div className="portal-akm-segmented">
              <button type="button" className={formEnv === 'live' ? 'active' : ''} onClick={() => setFormEnv('live')}>Live</button>
              <button type="button" className={formEnv === 'test' ? 'active' : ''} onClick={() => setFormEnv('test')}>Test</button>
            </div>
          </label>

          <label className="portal-akm-field">
            <span>Tenant (optional)</span>
            <input type="text" value={formTenant} onChange={(e) => setFormTenant(e.target.value)} placeholder="UUID or blank" />
          </label>

          <fieldset className="portal-akm-field">
            <legend>Service Access</legend>
            <div className="portal-akm-checkrow">
              {(data?.services ?? []).map((s) => (
                <label key={s} className="portal-akm-checkbox">
                  <input type="checkbox" checked={formServices.has(s)} onChange={() => toggleSet(setFormServices, formServices, s)} />
                  <span>{SERVICE_LABELS[s] ?? s}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="portal-akm-field">
            <legend>Scopes ({formScopes.size} selected)</legend>
            <div className="portal-akm-scopes-list">
              {data && Object.entries(data.scopeCatalog).map(([group, list]) => (
                <div key={group} className="portal-akm-scope-block">
                  <div className="portal-akm-scope-block-title">{group}</div>
                  {list.map((s) => (
                    <label key={s} className="portal-akm-checkbox">
                      <input type="checkbox" checked={formScopes.has(s)} onChange={() => toggleSet(setFormScopes, formScopes, s)} />
                      <span><code>{s}</code></span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </fieldset>

          <label className="portal-akm-field">
            <span>Rate Limit (req / minute)</span>
            <input type="number" min="0" value={formRateLimit} onChange={(e) => setFormRateLimit(e.target.value)} />
          </label>

          <label className="portal-akm-field">
            <span>Expiry Date (optional)</span>
            <input type="date" value={formExpires} onChange={(e) => setFormExpires(e.target.value)} />
          </label>

          {formError && <div className="portal-banner portal-banner-warning">{formError}</div>}

          <button type="submit" className="portal-akm-generate" disabled={busy}>
            {busy ? 'Generating…' : 'Generate Key'}
          </button>
          <p className="portal-akm-once-hint">Full key will be shown only once.</p>
        </form>
      </aside>
    </div>
  );
}

function StatCard({ icon, label, value, sub, tone }: { icon: string; label: string; value: number | string; sub: string; tone?: 'good' | 'violet' | 'amber' }) {
  return (
    <div className={`portal-akm-stat ${tone ? `portal-akm-stat-${tone}` : ''}`}>
      <div className="portal-akm-stat-icon">{icon}</div>
      <div className="portal-akm-stat-body">
        <div className="portal-akm-stat-label">{label}</div>
        <div className="portal-akm-stat-value">{value}</div>
        <div className="portal-akm-stat-sub">{sub}</div>
      </div>
    </div>
  );
}
