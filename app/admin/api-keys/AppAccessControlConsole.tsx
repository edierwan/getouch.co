'use client';

import { useEffect, useState } from 'react';
import type {
  PlatformAccessSnapshot,
  PlatformAppItem,
  PlatformSecretRefItem,
  PlatformServiceIntegrationItem,
  PlatformTenantBindingItem,
} from '@/lib/platform-app-access';
import { ApiKeyManagerConsole } from './ApiKeyManagerConsole';

type Tab = 'apps' | 'apiKeys' | 'tenantBindings' | 'serviceIntegrations' | 'secretRefs';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'apps', label: 'Apps' },
  { id: 'apiKeys', label: 'API Keys' },
  { id: 'tenantBindings', label: 'Tenant Bindings' },
  { id: 'serviceIntegrations', label: 'Service Integrations' },
  { id: 'secretRefs', label: 'Secret Refs' },
];

const PLANNED_PREVIEW_APPS = [
  {
    code: 'future-crm',
    name: 'Future CRM',
    description: 'Planned/demo preview for tenant-aware customer and lifecycle orchestration.',
  },
  {
    code: 'future-support-desk',
    name: 'Future Support Desk',
    description: 'Planned/demo preview for omnichannel service operations on the shared control plane.',
  },
];

const ISOLATION_FLOW = [
  {
    title: 'App entry resolves ownership',
    description: 'WAPI resolves the app tenant binding from account or session ownership before any shared service is touched.',
  },
  {
    title: 'Control plane maps shared integrations',
    description: 'The portal DB stores the app, tenant binding, and linked AI or communication services without holding product business data.',
  },
  {
    title: 'Secrets stay as references',
    description: 'Shared services consume Infisical-style refs and paths only. Raw secret values are never rendered in this console.',
  },
  {
    title: 'Runtime data remains in-app',
    description: 'Conversation state, WhatsApp history, and product records stay in the product app runtime such as WAPI.',
  },
];

function formatDateTime(value: string | null): string {
  if (!value) return 'Not recorded yet';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return 'Invalid timestamp';
  return parsed.toLocaleString();
}

function titleCase(value: string | null): string {
  if (!value) return '—';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function toneForStatus(status: string): string {
  switch (status) {
    case 'active':
    case 'linked':
      return 'portal-status-good';
    case 'planned':
    case 'pending':
    case 'draft':
      return 'portal-status-warning';
    case 'disabled':
    case 'revoked':
    case 'error':
    case 'inactive':
      return 'portal-status-bad';
    default:
      return 'portal-status-active';
  }
}

function channelTone(channel: string | null): string {
  switch (channel) {
    case 'whatsapp':
      return 'portal-tag-emerald';
    case 'voice':
      return 'portal-tag-cyan';
    case 'ai':
      return 'portal-tag-violet';
    default:
      return 'portal-tag-slate';
  }
}

function metadataTags(metadata: Record<string, unknown>): string[] {
  return Object.entries(metadata)
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${String(value)}`);
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="portal-aac-empty-state">
      <div className="portal-aac-empty-title">{title}</div>
      <p>{body}</p>
    </div>
  );
}

function AppOverviewCard({ app }: { app: PlatformAppItem }) {
  const tags = metadataTags(app.metadata);

  return (
    <section className="portal-aac-panel portal-aac-overview-card">
      <div className="portal-aac-panel-head">
        <div>
          <div className="portal-aac-eyebrow">Selected App</div>
          <h3>{app.name}</h3>
        </div>
        <span className={`portal-aac-status ${toneForStatus(app.status)}`}>{titleCase(app.status)}</span>
      </div>
      <p className="portal-aac-panel-copy">{app.description || 'Shared control-plane registration for this product app.'}</p>
      <div className="portal-aac-chip-row">
        <span className={`portal-akm-tag ${channelTone(app.defaultChannel)}`}>{titleCase(app.defaultChannel)}</span>
        <span className="portal-akm-tag portal-tag-slate">Auth: {titleCase(app.authModel)}</span>
        <span className="portal-akm-tag portal-tag-slate">App Code: {app.appCode}</span>
      </div>
      {tags.length > 0 ? (
        <div className="portal-aac-metadata-grid">
          {tags.map((tag) => (
            <span key={tag} className="portal-aac-metadata-pill">{tag}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TenantBindingsTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: PlatformTenantBindingItem[];
  selectedId: string | null;
  onSelect: (bindingId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No tenant bindings yet"
        body="The control plane is ready, but no production tenant binding has been registered for the selected app."
      />
    );
  }

  return (
    <div className="portal-aac-table-wrap">
      <table className="portal-aac-table">
        <thead>
          <tr>
            <th>Tenant</th>
            <th>Environment</th>
            <th>Status</th>
            <th>Last Sync</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((binding) => (
            <tr key={binding.id} className={binding.id === selectedId ? 'portal-aac-row-selected' : undefined}>
              <td>
                <div className="portal-aac-table-title">{binding.displayName || binding.appTenantKey}</div>
                <div className="portal-aac-table-sub">{binding.appTenantKey}</div>
              </td>
              <td>{titleCase(binding.environment)}</td>
              <td>
                <span className={`portal-aac-status ${toneForStatus(binding.status)}`}>{titleCase(binding.status)}</span>
              </td>
              <td>{formatDateTime(binding.lastSyncedAt)}</td>
              <td className="portal-aac-table-action-cell">
                <button
                  type="button"
                  className="portal-aac-link-button"
                  onClick={() => onSelect(binding.id)}
                >
                  {binding.id === selectedId ? 'Selected' : 'Select'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ServiceIntegrationsTable({ rows }: { rows: PlatformServiceIntegrationItem[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No service links registered"
        body="Link shared services here when write flows are enabled. This view stays read-only for now."
      />
    );
  }

  return (
    <div className="portal-aac-table-wrap">
      <table className="portal-aac-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Resource</th>
            <th>Tenant Scope</th>
            <th>Routing</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((integration) => (
            <tr key={integration.id}>
              <td>
                <div className="portal-aac-table-title">{titleCase(integration.serviceName)}</div>
                <div className="portal-aac-table-sub">{integration.displayName || integration.appName}</div>
              </td>
              <td>
                <div className="portal-aac-table-title">{integration.resourceId}</div>
                <div className="portal-aac-table-sub">{titleCase(integration.resourceType)}</div>
              </td>
              <td>{integration.tenantDisplayName || integration.tenantBindingKey || 'App-wide'}</td>
              <td>
                <div className="portal-aac-table-sub">Public: {integration.baseUrl || '—'}</div>
                <div className="portal-aac-table-sub">Internal: {integration.internalBaseUrl || '—'}</div>
              </td>
              <td>
                <span className={`portal-aac-status ${toneForStatus(integration.status)}`}>
                  {titleCase(integration.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SecretRefsTable({ rows }: { rows: PlatformSecretRefItem[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No secret refs registered"
        body="Secret ref paths and scoped keys will appear here after integration wiring. Values are never stored or rendered on this page."
      />
    );
  }

  return (
    <div className="portal-aac-table-wrap">
      <table className="portal-aac-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Reference Path</th>
            <th>Key</th>
            <th>Scope</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((secretRef) => (
            <tr key={secretRef.id}>
              <td>
                <div className="portal-aac-table-title">{titleCase(secretRef.serviceName)}</div>
                <div className="portal-aac-table-sub">{titleCase(secretRef.refProvider)}</div>
              </td>
              <td>
                <code className="portal-aac-secret-path">{secretRef.refPath}</code>
              </td>
              <td>{secretRef.refKey || 'Path root'}</td>
              <td>{titleCase(secretRef.scope)}</td>
              <td>
                <span className={`portal-aac-status ${toneForStatus(secretRef.status)}`}>{titleCase(secretRef.status)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AppAccessControlConsole() {
  const [tab, setTab] = useState<Tab>('apps');
  const [data, setData] = useState<PlatformAccessSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadSnapshot(appCode?: string | null, tenantBindingId?: string | null) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (appCode) params.set('appCode', appCode);
      if (tenantBindingId) params.set('tenantBindingId', tenantBindingId);
      const suffix = params.size > 0 ? `?${params.toString()}` : '';
      const res = await fetch(`/api/admin/platform-app-access${suffix}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const json = (await res.json()) as PlatformAccessSnapshot;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSnapshot();
  }, []);

  const selectedApp = data?.selectedApp ?? null;
  const selectedTenantBinding = data?.selectedTenantBinding ?? null;
  const previewApps = data && data.apps.length <= 1 ? PLANNED_PREVIEW_APPS : [];

  return (
    <div className="portal-aac-shell">
      <section className="portal-aac-banner">
        <div>
          <div className="portal-aac-eyebrow">Control Plane</div>
          <h2>Platform DB is the control plane. Product apps keep their own business data.</h2>
        </div>
        <p>
          This registry maps shared AI and communication services to each product app without mixing runtime business records into the portal database.
        </p>
      </section>

      {error ? (
        <section className="portal-aac-panel portal-aac-error">
          <div className="portal-aac-panel-head">
            <div>
              <div className="portal-aac-eyebrow">Load Error</div>
              <h3>Could not load app access control data</h3>
            </div>
            <button type="button" className="portal-aac-primary-button" onClick={() => void loadSnapshot()}>
              Retry
            </button>
          </div>
          <p className="portal-aac-panel-copy">{error}</p>
        </section>
      ) : null}

      <section className="portal-aac-stats">
        <article className="portal-aac-stat-card">
          <span className="portal-aac-stat-label">Registered Apps</span>
          <strong>{data?.summary.appCount ?? 0}</strong>
          <span>Portal-side app registry entries</span>
        </article>
        <article className="portal-aac-stat-card">
          <span className="portal-aac-stat-label">Active Tenant Bindings</span>
          <strong>{data?.summary.activeTenantBindingCount ?? 0}</strong>
          <span>Production ownership mappings</span>
        </article>
        <article className="portal-aac-stat-card">
          <span className="portal-aac-stat-label">Service Integrations</span>
          <strong>{data?.summary.serviceIntegrationCount ?? 0}</strong>
          <span>Shared AI and comms links</span>
        </article>
        <article className="portal-aac-stat-card">
          <span className="portal-aac-stat-label">Secret Refs / Scoped Keys</span>
          <strong>{data?.summary.secretRefCount ?? 0}</strong>
          <span>Refs only, never raw values</span>
        </article>
      </section>

      <div className="portal-aac-tabs" role="tablist" aria-label="App access control tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`portal-aac-tab ${tab === item.id ? 'portal-aac-tab-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <section className="portal-aac-panel">
          <div className="portal-aac-loading">Loading platform app registry…</div>
        </section>
      ) : null}

      {!loading && data ? (
        <>
          {tab === 'apps' ? (
            <div className="portal-aac-workspace">
              <aside className="portal-aac-app-rail">
                <div className="portal-aac-panel-head">
                  <div>
                    <div className="portal-aac-eyebrow">Registered Apps</div>
                    <h3>Platform Catalog</h3>
                  </div>
                  <button type="button" className="portal-aac-secondary-button" disabled>
                    Create App · Planned
                  </button>
                </div>

                <div className="portal-aac-app-list">
                  {data.apps.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      className={`portal-aac-app-list-item ${data.selectedAppCode === app.appCode ? 'portal-aac-app-list-item-active' : ''}`}
                      onClick={() => void loadSnapshot(app.appCode, null)}
                    >
                      <div className="portal-aac-app-list-head">
                        <strong>{app.name}</strong>
                        <span className={`portal-aac-status ${toneForStatus(app.status)}`}>{titleCase(app.status)}</span>
                      </div>
                      <div className="portal-aac-app-list-sub">{app.appCode}</div>
                      <div className="portal-aac-app-list-copy">{app.description || 'Portal-side control-plane registration.'}</div>
                      <div className="portal-aac-app-list-meta">
                        <span>{app.tenantBindingCount} bindings</span>
                        <span>{app.serviceIntegrationCount} integrations</span>
                        <span>{app.secretRefCount} refs</span>
                      </div>
                    </button>
                  ))}

                  {previewApps.map((app) => (
                    <div key={app.code} className="portal-aac-app-list-item portal-aac-app-list-item-planned">
                      <div className="portal-aac-app-list-head">
                        <strong>{app.name}</strong>
                        <span className="portal-aac-planned-pill">Planned</span>
                      </div>
                      <div className="portal-aac-app-list-sub">{app.code}</div>
                      <div className="portal-aac-app-list-copy">{app.description}</div>
                    </div>
                  ))}
                </div>
              </aside>

              <section className="portal-aac-main">
                {selectedApp ? (
                  <>
                    <div className="portal-aac-main-head">
                      <div>
                        <div className="portal-aac-eyebrow">App Overview</div>
                        <h3>{selectedApp.name}</h3>
                      </div>
                      <div className="portal-aac-action-row">
                        <button type="button" className="portal-aac-secondary-button" disabled>
                          Add Tenant Binding · Planned
                        </button>
                        <button type="button" className="portal-aac-secondary-button" disabled>
                          Add Service Link · Planned
                        </button>
                      </div>
                    </div>

                    <div className="portal-aac-overview-grid">
                      <AppOverviewCard app={selectedApp} />

                      <section className="portal-aac-panel portal-aac-snapshot-card">
                        <div className="portal-aac-panel-head">
                          <div>
                            <div className="portal-aac-eyebrow">Selected Tenant Snapshot</div>
                            <h3>{selectedTenantBinding?.displayName || selectedTenantBinding?.appTenantKey || 'Awaiting tenant binding'}</h3>
                          </div>
                          <span className={`portal-aac-status ${toneForStatus(selectedTenantBinding?.status || 'planned')}`}>
                            {titleCase(selectedTenantBinding?.status || 'planned')}
                          </span>
                        </div>

                        {selectedTenantBinding ? (
                          <dl className="portal-aac-detail-list">
                            <div>
                              <dt>Tenant Key</dt>
                              <dd>{selectedTenantBinding.appTenantKey}</dd>
                            </div>
                            <div>
                              <dt>Environment</dt>
                              <dd>{titleCase(selectedTenantBinding.environment)}</dd>
                            </div>
                            <div>
                              <dt>Last Synced</dt>
                              <dd>{formatDateTime(selectedTenantBinding.lastSyncedAt)}</dd>
                            </div>
                            <div>
                              <dt>Service Links</dt>
                              <dd>{data.selectedTenantServiceIntegrations.length}</dd>
                            </div>
                            <div>
                              <dt>Secret Refs</dt>
                              <dd>{data.selectedTenantSecretRefs.length}</dd>
                            </div>
                            <div>
                              <dt>Isolation Rule</dt>
                              <dd>Binding-scoped before shared service access</dd>
                            </div>
                          </dl>
                        ) : (
                          <EmptyState
                            title="No tenant selected"
                            body="Once a tenant binding exists, this panel will summarize its linked services and secret ref paths."
                          />
                        )}
                      </section>
                    </div>

                    <div className="portal-aac-panel-grid">
                      <section className="portal-aac-panel">
                        <div className="portal-aac-panel-head">
                          <div>
                            <div className="portal-aac-eyebrow">Tenant Bindings</div>
                            <h3>Ownership and routing</h3>
                          </div>
                          <span className="portal-aac-count-chip">{data.tenantBindings.length}</span>
                        </div>
                        <TenantBindingsTable
                          rows={data.tenantBindings}
                          selectedId={data.selectedTenantBindingId}
                          onSelect={(bindingId) => void loadSnapshot(data.selectedAppCode, bindingId)}
                        />
                      </section>

                      <section className="portal-aac-panel">
                        <div className="portal-aac-panel-head">
                          <div>
                            <div className="portal-aac-eyebrow">Isolation Flow</div>
                            <h3>Control-plane boundaries</h3>
                          </div>
                        </div>
                        <ol className="portal-aac-flow-list">
                          {ISOLATION_FLOW.map((step) => (
                            <li key={step.title}>
                              <strong>{step.title}</strong>
                              <p>{step.description}</p>
                            </li>
                          ))}
                        </ol>
                      </section>
                    </div>

                    <div className="portal-aac-panel-grid">
                      <section className="portal-aac-panel">
                        <div className="portal-aac-panel-head">
                          <div>
                            <div className="portal-aac-eyebrow">Service Integrations</div>
                            <h3>Shared service links</h3>
                          </div>
                          <span className="portal-aac-count-chip">{data.serviceIntegrations.length}</span>
                        </div>
                        <ServiceIntegrationsTable rows={data.serviceIntegrations} />
                      </section>

                      <section className="portal-aac-panel">
                        <div className="portal-aac-panel-head">
                          <div>
                            <div className="portal-aac-eyebrow">Secret References</div>
                            <h3>Ref paths only</h3>
                          </div>
                          <span className="portal-aac-count-chip">{data.secretRefs.length}</span>
                        </div>
                        <SecretRefsTable rows={data.secretRefs} />
                      </section>
                    </div>
                  </>
                ) : (
                  <section className="portal-aac-panel">
                    <EmptyState
                      title="No registered app yet"
                      body="Run the portal migration against the getouch.co database to register WAPI and unlock the control-plane views."
                    />
                  </section>
                )}
              </section>
            </div>
          ) : null}

          {tab === 'apiKeys' ? <ApiKeyManagerConsole /> : null}

          {tab === 'tenantBindings' ? (
            <section className="portal-aac-panel">
              <div className="portal-aac-panel-head">
                <div>
                  <div className="portal-aac-eyebrow">Tenant Bindings</div>
                  <h3>{selectedApp?.name || 'App'} tenancy registry</h3>
                </div>
                <button type="button" className="portal-aac-secondary-button" disabled>
                  Add Tenant Binding · Planned
                </button>
              </div>
              <TenantBindingsTable
                rows={data.tenantBindings}
                selectedId={data.selectedTenantBindingId}
                onSelect={(bindingId) => void loadSnapshot(data.selectedAppCode, bindingId)}
              />
            </section>
          ) : null}

          {tab === 'serviceIntegrations' ? (
            <section className="portal-aac-panel">
              <div className="portal-aac-panel-head">
                <div>
                  <div className="portal-aac-eyebrow">Service Integrations</div>
                  <h3>{selectedApp?.name || 'App'} service map</h3>
                </div>
                <button type="button" className="portal-aac-secondary-button" disabled>
                  Add Service Link · Planned
                </button>
              </div>
              <ServiceIntegrationsTable rows={data.serviceIntegrations} />
            </section>
          ) : null}

          {tab === 'secretRefs' ? (
            <section className="portal-aac-panel">
              <div className="portal-aac-panel-head">
                <div>
                  <div className="portal-aac-eyebrow">Secret References</div>
                  <h3>{selectedApp?.name || 'App'} secret registry</h3>
                </div>
                <button type="button" className="portal-aac-secondary-button" disabled>
                  Add Secret Ref · Planned
                </button>
              </div>
              <SecretRefsTable rows={data.secretRefs} />
            </section>
          ) : null}
        </>
      ) : null}

      {loading && data ? <div className="portal-aac-refreshing">Refreshing registry snapshot…</div> : null}
    </div>
  );
}