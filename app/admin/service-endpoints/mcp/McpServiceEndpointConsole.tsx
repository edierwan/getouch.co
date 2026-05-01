'use client';

import { FormEvent, useEffect, useMemo, useState, useTransition } from 'react';
import { Breadcrumb, PageIntro, SummaryGrid } from '../../ui';

type Tab = 'overview' | 'servers' | 'tools' | 'access' | 'clients' | 'activity' | 'tenants' | 'settings';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'servers', label: 'Servers' },
  { id: 'tools', label: 'Tools' },
  { id: 'access', label: 'Access Keys' },
  { id: 'clients', label: 'Clients' },
  { id: 'activity', label: 'Activity' },
  { id: 'tenants', label: 'Tenants' },
  { id: 'settings', label: 'Settings' },
];

interface HealthCheck {
  label: string;
  status: 'healthy' | 'warning' | 'degraded';
  detail: string;
}

interface Dashboard {
  checkedAt: string;
  summary: {
    statusLabel: string;
    statusTone: 'healthy' | 'warning';
    publicUrl: string;
    endpointUrl: string;
    transport: string;
    authMode: string;
    runtimeTarget: string;
    servers: number;
    enabledTools: number;
    activeKeys: number;
    requests24h: number;
  };
  health: {
    checkedAt: string;
    ok: boolean;
    tests: HealthCheck[];
  };
  database: {
    configured: boolean;
    connected: boolean;
    database: string;
    urlSource: string;
    schemaApplied: boolean;
    tableCount: number;
    tables: string[];
    missingTables: string[];
    indexes: string[];
    missingIndexes: string[];
    platformTenantPresent: boolean;
    error: string | null;
  };
  quickActions: Array<{ label: string; href: string; external?: boolean }>;
  servers: Array<{
    id: string;
    slug: string;
    displayName: string;
    transport: string;
    endpointPath: string;
    originType: string;
    status: string;
    healthStatus: string;
    description: string | null;
    runtimeTarget: string | null;
    authMode: string;
    tenantMode: string;
    lastHeartbeatAt: string | null;
  }>;
  tools: Array<{
    id: string;
    serverId: string;
    serverSlug: string;
    serverName: string;
    name: string;
    displayName: string;
    description: string;
    enabled: boolean;
    safeDefault: boolean;
    availability: string;
    inputSchema: Record<string, unknown>;
  }>;
  clients: Array<{
    id: string;
    name: string;
    clientType: string;
    tenantId: string | null;
    apiKeyId: string | null;
    keyPrefix: string | null;
    status: string;
    scopes: string[];
    lastSeenAt: string | null;
  }>;
  accessKeys: Array<{
    id: string;
    apiKeyId: string;
    clientId: string | null;
    clientName: string;
    keyPrefix: string;
    tenantId: string | null;
    status: string;
    scopes: string[];
    services: string[];
    expiresAt: string | null;
    lastUsedAt: string | null;
  }>;
  activity: Array<{
    id: string;
    level: string;
    eventType: string;
    summary: string;
    keyPrefix: string | null;
    tenantId: string | null;
    createdAt: string | null;
  }>;
  toolCalls: Array<{
    id: string;
    toolName: string;
    keyPrefix: string | null;
    tenantId: string | null;
    status: string;
    errorCode: string | null;
    latencyMs: number | null;
    resultPreview: string | null;
    createdAt: string | null;
  }>;
  tenants: Array<{
    tenantId: string;
    displayName: string | null;
    status: string;
    clientCount: number;
    keyCount: number;
    toolCalls24h: number;
  }>;
  settings: Array<{
    settingKey: string;
    settingValue: unknown;
    updatedAt: string | null;
  }>;
  compatibility: Array<{ label: string; status: string; detail: string }>;
  snippets: {
    curl: string;
    javascript: string;
  };
  defaults: {
    scopes: string[];
    services: string[];
  };
}

function formatDateTime(value: string | null) {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleString();
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function toneClass(status: string) {
  if (status === 'healthy' || status === 'active' || status === 'enabled' || status === 'success') {
    return 'portal-status portal-status-good';
  }
  if (status === 'warning' || status === 'managed' || status === 'unknown' || status === 'degraded') {
    return 'portal-status portal-status-warning';
  }
  return 'portal-status';
}

function normalizeError(json: unknown, fallback: string) {
  if (!json || typeof json !== 'object') return fallback;
  const record = json as Record<string, unknown>;
  return typeof record.error === 'string' ? record.error : fallback;
}

export function McpServiceEndpointConsole() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showServerModal, setShowServerModal] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [keyForm, setKeyForm] = useState({
    clientName: '',
    clientType: 'external',
    tenantId: '',
    keyName: '',
    expiresAt: '',
    scopes: ['mcp:connect', 'mcp:tools:list', 'mcp:tools:call', 'mcp:resources:read'],
  });
  const [serverForm, setServerForm] = useState({
    name: '',
    slug: '',
    runtimeTarget: '',
    description: '',
  });

  async function reload() {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/service-endpoints/mcp', { cache: 'no-store' });
      const json = (await response.json()) as Dashboard | { error?: string };
      if (!response.ok) {
        throw new Error(normalizeError(json, `Failed to load (${response.status})`));
      }

      setData(json as Dashboard);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MCP endpoint status');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const cards = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: 'STATUS',
        value: data.summary.statusLabel,
        tone: data.summary.statusTone,
        icon: '⌬',
        detail: `Checked ${formatDateTime(data.health.checkedAt)}`,
      },
      {
        label: 'ENDPOINT',
        value: '/mcp',
        icon: '↗',
        detail: data.summary.endpointUrl,
      },
      {
        label: 'SERVERS',
        value: String(data.summary.servers),
        icon: '◫',
        detail: `${data.database.connected ? 'DB connected' : 'DB unavailable'}`,
      },
      {
        label: 'SAFE TOOLS',
        value: String(data.summary.enabledTools),
        tone: 'active' as const,
        icon: '⚙',
        detail: 'Read-only tools enabled',
      },
      {
        label: 'ACTIVE KEYS',
        value: String(data.summary.activeKeys),
        icon: '⚿',
        detail: 'Central API keys mirrored to MCP cache',
      },
      {
        label: 'REQUESTS (24H)',
        value: String(data.summary.requests24h),
        icon: '◉',
        detail: 'Tool-call activity recorded in mcp DB',
      },
    ];
  }, [data]);

  function toggleScope(scope: string) {
    setKeyForm((current) => ({
      ...current,
      scopes: current.scopes.includes(scope)
        ? current.scopes.filter((entry) => entry !== scope)
        : [...current.scopes, scope],
    }));
  }

  function runHealthCheck() {
    startTransition(async () => {
      setNotice(null);
      try {
        const response = await fetch('/api/admin/service-endpoints/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'run_health_check' }),
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(normalizeError(json, `Health check failed (${response.status})`));
        }
        const health = json.health as Dashboard['health'];
        setNotice(`Health check completed: ${health.tests.filter((item) => item.status === 'healthy').length} healthy checks.`);
        await reload();
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Health check failed');
      }
    });
  }

  function submitKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      setNotice(null);
      try {
        const response = await fetch('/api/admin/service-endpoints/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'generate_access_key',
            clientName: keyForm.clientName,
            clientType: keyForm.clientType,
            tenantId: keyForm.tenantId,
            keyName: keyForm.keyName,
            expiresAt: keyForm.expiresAt || null,
            scopes: keyForm.scopes,
          }),
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(normalizeError(json, `Access-key generation failed (${response.status})`));
        }

        setCreatedSecret(typeof json.plaintext === 'string' ? json.plaintext : null);
        setNotice('MCP access key generated. The full plaintext is shown once below.');
        await reload();
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Access-key generation failed');
      }
    });
  }

  function submitServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      setNotice(null);
      try {
        const response = await fetch('/api/admin/service-endpoints/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'register_server',
            name: serverForm.name,
            slug: serverForm.slug,
            runtimeTarget: serverForm.runtimeTarget,
            description: serverForm.description,
          }),
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(normalizeError(json, `Server registration failed (${response.status})`));
        }

        setNotice('MCP server registration saved.');
        setShowServerModal(false);
        setServerForm({ name: '', slug: '', runtimeTarget: '', description: '' });
        await reload();
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Server registration failed');
      }
    });
  }

  return (
    <>
      <Breadcrumb category="AI Engine & Cognition" page="MCP Endpoint" />
      <PageIntro
        title="MCP Endpoint"
        subtitle="Public developer page, bearer-authenticated Streamable HTTP endpoint, central API-key integration, and operator controls for the Getouch MCP runtime."
      />

      {loading && !data ? <section className="portal-panel">Loading MCP endpoint status…</section> : null}
      {error ? <section className="portal-panel">{error}</section> : null}

      {data ? (
        <>
          <SummaryGrid cards={cards} className="portal-summary-grid-compact" />

          <section className="portal-panel" style={{ marginBottom: '1.2rem' }}>
            <div className="portal-panel-head portal-panel-head-inline">
              <div>
                <h3 className="portal-panel-title">Quick Actions</h3>
                <p className="portal-panel-subtitle">Operator controls and public links for the rebuilt MCP runtime.</p>
              </div>
              <div className="mcp-console-actions">
                <button type="button" className="portal-action-link" onClick={runHealthCheck} disabled={busy}>
                  Run Health Check
                </button>
                <button type="button" className="portal-action-link" onClick={() => setShowKeyModal(true)}>
                  Generate Access Key
                </button>
                <button type="button" className="portal-action-link" onClick={() => setShowServerModal(true)}>
                  Add Server
                </button>
              </div>
            </div>
            <div className="portal-action-row">
              {data.quickActions.map((action) => (
                <a
                  key={action.label}
                  href={action.href}
                  className="portal-action-link"
                  target={action.external ? '_blank' : undefined}
                  rel={action.external ? 'noreferrer noopener' : undefined}
                >
                  {action.label}
                </a>
              ))}
            </div>
            {notice ? <div className="mcp-console-notice">{notice}</div> : null}
          </section>

          <div className="mcp-console-tabs" role="tablist" aria-label="MCP endpoint sections">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={tab.id === activeTab ? 'mcp-console-tab mcp-console-tab-active' : 'mcp-console-tab'}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' ? (
            <div className="mcp-console-grid">
              <section className="portal-panel">
                <div className="portal-panel-head">
                  <h3 className="portal-panel-title">Endpoint Health</h3>
                </div>
                <div className="mcp-console-stack">
                  {data.health.tests.map((item) => (
                    <div key={item.label} className="mcp-console-list-item">
                      <div className="mcp-console-list-head">
                        <strong>{item.label}</strong>
                        <span className={toneClass(item.status)}>{item.status}</span>
                      </div>
                      <p>{item.detail}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="portal-panel">
                <div className="portal-panel-head">
                  <h3 className="portal-panel-title">Endpoint Details</h3>
                </div>
                <div className="portal-info-table">
                  <div className="portal-info-table-row">
                    <span className="portal-info-table-label">Public URL</span>
                    <span className="portal-info-table-value">{data.summary.publicUrl}</span>
                  </div>
                  <div className="portal-info-table-row">
                    <span className="portal-info-table-label">Endpoint URL</span>
                    <span className="portal-info-table-value">{data.summary.endpointUrl}</span>
                  </div>
                  <div className="portal-info-table-row">
                    <span className="portal-info-table-label">Transport</span>
                    <span className="portal-info-table-value">{data.summary.transport}</span>
                  </div>
                  <div className="portal-info-table-row">
                    <span className="portal-info-table-label">Auth Mode</span>
                    <span className="portal-info-table-value">{data.summary.authMode}</span>
                  </div>
                  <div className="portal-info-table-row">
                    <span className="portal-info-table-label">Runtime Target</span>
                    <span className="portal-info-table-value">{data.summary.runtimeTarget}</span>
                  </div>
                  <div className="portal-info-table-row">
                    <span className="portal-info-table-label">Database</span>
                    <span className="portal-info-table-value">{data.database.database}</span>
                  </div>
                </div>
              </section>

              <section className="portal-panel portal-panel-fill">
                <div className="portal-panel-head">
                  <h3 className="portal-panel-title">Connect Snippet</h3>
                </div>
                <pre className="mcp-console-code"><code>{data.snippets.curl}</code></pre>
              </section>
            </div>
          ) : null}

          {activeTab === 'servers' ? (
            <section className="portal-panel">
              <div className="portal-panel-head">
                <h3 className="portal-panel-title">Registered Servers</h3>
              </div>
              <div className="mcp-console-table-wrap">
                <table className="mcp-console-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Origin</th>
                      <th>Status</th>
                      <th>Health</th>
                      <th>Runtime</th>
                      <th>Heartbeat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.servers.map((server) => (
                      <tr key={server.id}>
                        <td>
                          <strong>{server.displayName}</strong>
                          <div className="mcp-console-subtext">/{server.slug}</div>
                        </td>
                        <td>{server.originType}</td>
                        <td><span className={toneClass(server.status)}>{server.status}</span></td>
                        <td><span className={toneClass(server.healthStatus)}>{server.healthStatus}</span></td>
                        <td>{server.runtimeTarget || 'Not assigned'}</td>
                        <td>{formatDateTime(server.lastHeartbeatAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeTab === 'tools' ? (
            <section className="portal-panel">
              <div className="portal-panel-head">
                <h3 className="portal-panel-title">Tool Registry</h3>
              </div>
              <div className="mcp-console-table-wrap">
                <table className="mcp-console-table">
                  <thead>
                    <tr>
                      <th>Tool</th>
                      <th>Server</th>
                      <th>Availability</th>
                      <th>Safe Default</th>
                      <th>Schema</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tools.map((tool) => (
                      <tr key={tool.id}>
                        <td>
                          <strong>{tool.displayName}</strong>
                          <div className="mcp-console-subtext">{tool.description}</div>
                        </td>
                        <td>{tool.serverName}</td>
                        <td><span className={toneClass(tool.availability)}>{tool.availability}</span></td>
                        <td>{tool.safeDefault ? 'Yes' : 'No'}</td>
                        <td>
                          <pre className="mcp-console-inline-code"><code>{formatJson(tool.inputSchema)}</code></pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeTab === 'access' ? (
            <div className="mcp-console-grid">
              <section className="portal-panel">
                <div className="portal-panel-head">
                  <h3 className="portal-panel-title">Default Scopes</h3>
                </div>
                <div className="mcp-console-chip-row">
                  {data.defaults.scopes.map((scope) => (
                    <span key={scope} className="mcp-console-chip">{scope}</span>
                  ))}
                </div>
                {createdSecret ? (
                  <div className="mcp-console-secret-card">
                    <strong>Plaintext key</strong>
                    <code>{createdSecret}</code>
                  </div>
                ) : null}
              </section>

              <section className="portal-panel portal-panel-fill">
                <div className="portal-panel-head">
                  <h3 className="portal-panel-title">Mirrored Access Keys</h3>
                </div>
                <div className="mcp-console-table-wrap">
                  <table className="mcp-console-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Prefix</th>
                        <th>Tenant</th>
                        <th>Status</th>
                        <th>Last Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.accessKeys.map((key) => (
                        <tr key={key.id}>
                          <td>{key.clientName}</td>
                          <td><code>{key.keyPrefix}</code></td>
                          <td>{key.tenantId || 'platform'}</td>
                          <td><span className={toneClass(key.status)}>{key.status}</span></td>
                          <td>{formatDateTime(key.lastUsedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === 'clients' ? (
            <section className="portal-panel">
              <div className="portal-panel-head">
                <h3 className="portal-panel-title">Registered Clients</h3>
              </div>
              <div className="mcp-console-table-wrap">
                <table className="mcp-console-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Type</th>
                      <th>Tenant</th>
                      <th>Key Prefix</th>
                      <th>Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.clients.map((client) => (
                      <tr key={client.id}>
                        <td>
                          <strong>{client.name}</strong>
                          <div className="mcp-console-subtext">{client.scopes.join(', ') || 'No scopes recorded'}</div>
                        </td>
                        <td>{client.clientType}</td>
                        <td>{client.tenantId || 'platform'}</td>
                        <td>{client.keyPrefix ? <code>{client.keyPrefix}</code> : 'Not assigned'}</td>
                        <td>{formatDateTime(client.lastSeenAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeTab === 'activity' ? (
            <div className="mcp-console-grid">
              <section className="portal-panel">
                <div className="portal-panel-head">
                  <h3 className="portal-panel-title">Recent Activity</h3>
                </div>
                <div className="mcp-console-stack">
                  {data.activity.map((item) => (
                    <div key={item.id} className="mcp-console-list-item">
                      <div className="mcp-console-list-head">
                        <strong>{item.summary}</strong>
                        <span className={toneClass(item.level)}>{item.level}</span>
                      </div>
                      <p>{item.eventType} · {item.tenantId || 'platform'} · {formatDateTime(item.createdAt)}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="portal-panel">
                <div className="portal-panel-head">
                  <h3 className="portal-panel-title">Recent Tool Calls</h3>
                </div>
                <div className="mcp-console-stack">
                  {data.toolCalls.map((item) => (
                    <div key={item.id} className="mcp-console-list-item">
                      <div className="mcp-console-list-head">
                        <strong>{item.toolName}</strong>
                        <span className={toneClass(item.status)}>{item.status}</span>
                      </div>
                      <p>
                        {(item.keyPrefix || 'unknown-key')} · {(item.tenantId || 'platform')} · {item.latencyMs ?? 0} ms · {formatDateTime(item.createdAt)}
                      </p>
                      {item.resultPreview ? <pre className="mcp-console-inline-code"><code>{item.resultPreview}</code></pre> : null}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === 'tenants' ? (
            <div className="mcp-console-tenant-grid">
              {data.tenants.map((tenant) => (
                <section key={tenant.tenantId} className="portal-panel">
                  <div className="portal-panel-head">
                    <h3 className="portal-panel-title">{tenant.displayName || tenant.tenantId}</h3>
                  </div>
                  <div className="portal-info-table">
                    <div className="portal-info-table-row">
                      <span className="portal-info-table-label">Tenant ID</span>
                      <span className="portal-info-table-value">{tenant.tenantId}</span>
                    </div>
                    <div className="portal-info-table-row">
                      <span className="portal-info-table-label">Status</span>
                      <span className="portal-info-table-value">{tenant.status}</span>
                    </div>
                    <div className="portal-info-table-row">
                      <span className="portal-info-table-label">Clients</span>
                      <span className="portal-info-table-value">{tenant.clientCount}</span>
                    </div>
                    <div className="portal-info-table-row">
                      <span className="portal-info-table-label">Active Keys</span>
                      <span className="portal-info-table-value">{tenant.keyCount}</span>
                    </div>
                    <div className="portal-info-table-row">
                      <span className="portal-info-table-label">Tool Calls (24h)</span>
                      <span className="portal-info-table-value">{tenant.toolCalls24h}</span>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          ) : null}

          {activeTab === 'settings' ? (
            <div className="mcp-console-grid">
              <section className="portal-panel">
                <div className="portal-panel-head">
                  <h3 className="portal-panel-title">Settings</h3>
                </div>
                <div className="mcp-console-stack">
                  {data.settings.map((item) => (
                    <div key={item.settingKey} className="mcp-console-list-item">
                      <div className="mcp-console-list-head">
                        <strong>{item.settingKey}</strong>
                        <span className="mcp-console-subtext">{formatDateTime(item.updatedAt)}</span>
                      </div>
                      <pre className="mcp-console-inline-code"><code>{formatJson(item.settingValue)}</code></pre>
                    </div>
                  ))}
                </div>
              </section>

              <section className="portal-panel">
                <div className="portal-panel-head">
                  <h3 className="portal-panel-title">Compatibility</h3>
                </div>
                <div className="mcp-console-stack">
                  {data.compatibility.map((item) => (
                    <div key={item.label} className="mcp-console-list-item">
                      <div className="mcp-console-list-head">
                        <strong>{item.label}</strong>
                        <span className="portal-status portal-status-good">{item.status}</span>
                      </div>
                      <p>{item.detail}</p>
                    </div>
                  ))}
                </div>
                <pre className="mcp-console-code"><code>{data.snippets.javascript}</code></pre>
              </section>
            </div>
          ) : null}
        </>
      ) : null}

      {showKeyModal ? (
        <div className="mcp-modal-backdrop" role="presentation" onClick={() => setShowKeyModal(false)}>
          <div className="mcp-modal-card" role="dialog" aria-modal="true" aria-label="Generate MCP access key" onClick={(event) => event.stopPropagation()}>
            <div className="mcp-modal-head">
              <h3>Generate Access Key</h3>
              <button type="button" className="mcp-modal-close" onClick={() => setShowKeyModal(false)}>Close</button>
            </div>
            <form className="mcp-modal-form" onSubmit={submitKey}>
              <label className="mcp-field">
                <span>Client name</span>
                <input value={keyForm.clientName} onChange={(event) => setKeyForm((current) => ({ ...current, clientName: event.target.value }))} required />
              </label>
              <label className="mcp-field">
                <span>Client type</span>
                <select value={keyForm.clientType} onChange={(event) => setKeyForm((current) => ({ ...current, clientType: event.target.value }))}>
                  <option value="external">External</option>
                  <option value="agent">Agent</option>
                  <option value="internal">Internal</option>
                </select>
              </label>
              <label className="mcp-field">
                <span>Tenant ID</span>
                <input value={keyForm.tenantId} onChange={(event) => setKeyForm((current) => ({ ...current, tenantId: event.target.value }))} placeholder="platform" />
              </label>
              <label className="mcp-field">
                <span>Key label</span>
                <input value={keyForm.keyName} onChange={(event) => setKeyForm((current) => ({ ...current, keyName: event.target.value }))} placeholder="Optional" />
              </label>
              <label className="mcp-field">
                <span>Expires at</span>
                <input type="datetime-local" value={keyForm.expiresAt} onChange={(event) => setKeyForm((current) => ({ ...current, expiresAt: event.target.value }))} />
              </label>
              <div className="mcp-field">
                <span>Scopes</span>
                <div className="mcp-console-chip-row">
                  {['mcp:connect', 'mcp:tools:list', 'mcp:tools:call', 'mcp:resources:read', 'mcp:admin'].map((scope) => (
                    <label key={scope} className={keyForm.scopes.includes(scope) ? 'mcp-console-chip mcp-console-chip-active' : 'mcp-console-chip'}>
                      <input
                        type="checkbox"
                        checked={keyForm.scopes.includes(scope)}
                        onChange={() => toggleScope(scope)}
                        style={{ display: 'none' }}
                      />
                      {scope}
                    </label>
                  ))}
                </div>
              </div>
              <div className="mcp-modal-actions">
                <button type="button" className="mcp-modal-secondary" onClick={() => setShowKeyModal(false)}>Cancel</button>
                <button type="submit" className="mcp-modal-primary" disabled={busy}>Generate</button>
              </div>
              {createdSecret ? (
                <div className="mcp-console-secret-card">
                  <strong>Plaintext key</strong>
                  <code>{createdSecret}</code>
                </div>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}

      {showServerModal ? (
        <div className="mcp-modal-backdrop" role="presentation" onClick={() => setShowServerModal(false)}>
          <div className="mcp-modal-card" role="dialog" aria-modal="true" aria-label="Register MCP server" onClick={(event) => event.stopPropagation()}>
            <div className="mcp-modal-head">
              <h3>Add Server</h3>
              <button type="button" className="mcp-modal-close" onClick={() => setShowServerModal(false)}>Close</button>
            </div>
            <form className="mcp-modal-form" onSubmit={submitServer}>
              <label className="mcp-field">
                <span>Display name</span>
                <input value={serverForm.name} onChange={(event) => setServerForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label className="mcp-field">
                <span>Slug</span>
                <input value={serverForm.slug} onChange={(event) => setServerForm((current) => ({ ...current, slug: event.target.value }))} placeholder="Optional" />
              </label>
              <label className="mcp-field">
                <span>Runtime target</span>
                <input value={serverForm.runtimeTarget} onChange={(event) => setServerForm((current) => ({ ...current, runtimeTarget: event.target.value }))} placeholder="container:/path or URL" />
              </label>
              <label className="mcp-field">
                <span>Description</span>
                <textarea value={serverForm.description} onChange={(event) => setServerForm((current) => ({ ...current, description: event.target.value }))} rows={4} />
              </label>
              <div className="mcp-modal-actions">
                <button type="button" className="mcp-modal-secondary" onClick={() => setShowServerModal(false)}>Cancel</button>
                <button type="submit" className="mcp-modal-primary" disabled={busy}>Save</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}