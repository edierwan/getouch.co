'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type {
  PlatformAccessSnapshot,
  PlatformAppItem,
  PlatformSecretRefItem,
  PlatformServiceIntegrationItem,
  PlatformTenantBindingItem,
  PlatformTenantServiceStatusItem,
} from '@/lib/platform-app-access';
import {
  DEFAULT_ECOSYSTEM_SERVICES,
  getResourceTypeSuggestions,
  getServiceDisplayName,
  titleCaseFromSlug,
} from '@/lib/platform-app-access-config';
import { ApiKeyManagerConsole } from './ApiKeyManagerConsole';

type Tab = 'apps' | 'apiKeys' | 'tenantBindings' | 'serviceLinks' | 'secretRefs';
type FlashTone = 'success' | 'error';
type FlashMessage = { tone: FlashTone; text: string } | null;

type ModalState =
  | { kind: 'createApp' }
  | { kind: 'editApp'; app: PlatformAppItem }
  | { kind: 'deleteApp'; app: PlatformAppItem }
  | { kind: 'createTenantBinding'; app: PlatformAppItem }
  | { kind: 'editTenantBinding'; app: PlatformAppItem; binding: PlatformTenantBindingItem }
  | { kind: 'deleteTenantBinding'; binding: PlatformTenantBindingItem }
  | {
    kind: 'createServiceLink';
    app: PlatformAppItem;
    tenantBinding: PlatformTenantBindingItem;
    serviceStatus: PlatformTenantServiceStatusItem;
  }
  | { kind: 'editServiceLink'; app: PlatformAppItem; integration: PlatformServiceIntegrationItem; targetLabel: string }
  | { kind: 'deleteServiceLink'; integration: PlatformServiceIntegrationItem }
  | { kind: 'createSecretRef'; app: PlatformAppItem; tenantBindingId: string | null; targetLabel: string }
  | { kind: 'editSecretRef'; app: PlatformAppItem; secretRef: PlatformSecretRefItem; targetLabel: string }
  | { kind: 'deleteSecretRef'; secretRef: PlatformSecretRefItem };

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'apps', label: 'Apps' },
  { id: 'apiKeys', label: 'API Keys' },
  { id: 'tenantBindings', label: 'Tenant Bindings' },
  { id: 'serviceLinks', label: 'Service Links' },
  { id: 'secretRefs', label: 'Secret References' },
];

const APP_ENVIRONMENT_OPTIONS = [
  { value: 'production', label: 'Production' },
  { value: 'staging', label: 'Staging' },
  { value: 'development', label: 'Development' },
];

const APP_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'planned', label: 'Planned' },
  { value: 'disabled', label: 'Disabled' },
];

const TENANT_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'sandbox', label: 'Sandbox' },
];

const SERVICE_LINK_STATUS_OPTIONS = [
  { value: 'linked', label: 'Linked' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'error', label: 'Error' },
];

const SECRET_PROVIDER_OPTIONS = [
  { value: 'infisical', label: 'infisical' },
  { value: 'coolify_env', label: 'coolify_env' },
  { value: 'manual_ref', label: 'manual_ref' },
];

const SECRET_SCOPE_OPTIONS = [
  { value: 'app', label: 'app' },
  { value: 'tenant', label: 'tenant' },
  { value: 'service', label: 'service' },
  { value: 'platform', label: 'platform' },
];

const SECRET_STATUS_OPTIONS = [
  { value: 'active', label: 'active' },
  { value: 'disabled', label: 'disabled' },
];

const SERVICE_OPTIONS = DEFAULT_ECOSYSTEM_SERVICES.map((service) => ({
  value: service.serviceName,
  label: service.displayName,
}));

function formatDateTime(value: string | null): string {
  if (!value) return 'Not recorded yet';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return 'Invalid timestamp';
  return parsed.toLocaleString();
}

function titleCase(value: string | null): string {
  if (!value) return '—';
  return titleCaseFromSlug(value);
}

function formatStatusLabel(value: string): string {
  switch (value) {
    case 'not_linked':
      return 'Not Linked';
    case 'linked':
      return 'Linked';
    case 'available':
      return 'Available';
    case 'disabled':
      return 'Disabled';
    case 'error':
      return 'Error';
    default:
      return titleCase(value);
  }
}

function toneForStatus(status: string): string {
  switch (status) {
    case 'active':
    case 'available':
    case 'linked':
      return 'portal-status-good';
    case 'not_linked':
    case 'planned':
    case 'sandbox':
      return 'portal-status-warning';
    case 'disabled':
    case 'error':
    case 'inactive':
    case 'revoked':
      return 'portal-status-bad';
    default:
      return 'portal-status-active';
  }
}

function metadataText(metadata: Record<string, unknown>): string {
  return Object.keys(metadata).length > 0 ? JSON.stringify(metadata, null, 2) : '';
}

function parseMetadataInput(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('Advanced metadata must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Advanced metadata must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getApiErrorMessage(json: Record<string, unknown>, status: number): string {
  if (typeof json.message === 'string' && json.message.trim()) return json.message;
  if (typeof json.error === 'string' && json.error.trim()) return json.error;
  return `Request failed (${status})`;
}

function stripDescriptionMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const next = { ...metadata };
  delete next.description;
  return next;
}

function targetLabelFromBinding(binding: PlatformTenantBindingItem | null): string {
  return binding?.displayName || binding?.appTenantKey || 'App-wide';
}

function targetLabelFromIntegration(integration: PlatformServiceIntegrationItem): string {
  return integration.tenantDisplayName || integration.tenantBindingKey || 'App-wide';
}

function targetLabelFromSecretRef(secretRef: PlatformSecretRefItem): string {
  return secretRef.tenantDisplayName || secretRef.tenantBindingKey || 'App-wide';
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="portal-aac-empty-state">
      <div className="portal-aac-empty-title">{title}</div>
      <p>{body}</p>
      {action ? <div className="portal-aac-empty-action">{action}</div> : null}
    </div>
  );
}

function FlashBanner({ flash }: { flash: FlashMessage }) {
  if (!flash) return null;
  return (
    <section className={`portal-aac-flash portal-aac-flash-${flash.tone}`}>
      <span>{flash.text}</span>
    </section>
  );
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`portal-aac-status ${toneForStatus(value)}`}>{formatStatusLabel(value)}</span>;
}

function AdvancedMetadataField({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  help: string;
}) {
  return (
    <details className="portal-aac-advanced">
      <summary>Advanced</summary>
      <label className="portal-aac-field">
        <span>{label}</span>
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={6} placeholder="{}" />
        <small className="portal-aac-help">{help}</small>
      </label>
    </details>
  );
}

function ModalShell({
  title,
  eyebrow,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="portal-aac-modal-overlay" role="presentation">
      <div className="portal-aac-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="portal-aac-modal-head">
          <div>
            <div className="portal-aac-eyebrow">{eyebrow}</div>
            <h3>{title}</h3>
            {subtitle ? <p className="portal-aac-panel-copy">{subtitle}</p> : null}
          </div>
          <button type="button" className="portal-aac-modal-close" onClick={onClose} aria-label="Close dialog">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AppOverviewCard({ app }: { app: PlatformAppItem }) {
  return (
    <section className="portal-aac-panel portal-aac-overview-card">
      <div className="portal-aac-panel-head">
        <div>
          <div className="portal-aac-eyebrow">App Overview</div>
          <h3>{app.name}</h3>
        </div>
        <StatusBadge value={app.status} />
      </div>
      <p className="portal-aac-panel-copy">
        {app.description || 'Product container and control-plane header for tenant isolation and shared ecosystem access.'}
      </p>
      <dl className="portal-aac-detail-list">
        <div>
          <dt>App Code / System ID</dt>
          <dd>{app.appCode}</dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>{titleCase(app.environment)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{formatStatusLabel(app.status)}</dd>
        </div>
        <div>
          <dt>Ecosystem Access</dt>
          <dd>Enabled</dd>
        </div>
        <div>
          <dt>Tenant Bindings</dt>
          <dd>{app.tenantBindingCount}</dd>
        </div>
        <div>
          <dt>Secret References</dt>
          <dd>{app.secretRefCount}</dd>
        </div>
      </dl>
      <p className="portal-aac-helper-note">
        App Code is generated automatically and used internally for logs, routing, and service mappings.
      </p>
    </section>
  );
}

function CapabilityGrid({ rows }: { rows: PlatformAccessSnapshot['appCapabilities'] }) {
  return (
    <section className="portal-aac-panel">
      <div className="portal-aac-panel-head">
        <div>
          <div className="portal-aac-eyebrow">Ecosystem Services</div>
          <h3>Default capability access</h3>
        </div>
        <span className="portal-aac-count-chip">{rows.length}</span>
      </div>
      <p className="portal-aac-panel-copy">
        Shared ecosystem services are available to the app by default. Linking actual resources happens later and stays registry-only.
      </p>
      <div className="portal-aac-capability-grid">
        {rows.map((row) => (
          <div key={row.id} className="portal-aac-capability-card">
            <div className="portal-aac-panel-head">
              <strong className="portal-aac-table-title">{row.displayName}</strong>
              <StatusBadge value={row.capabilityStatus} />
            </div>
            <div className="portal-aac-capability-meta">
              <span>{titleCase(row.category)}</span>
              <span>{row.defaultEnabled ? 'Default On' : 'Manual'}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TenantSummaryCard({
  tenant,
  serviceStatuses,
  secretRefCount,
}: {
  tenant: PlatformTenantBindingItem | null;
  serviceStatuses: PlatformTenantServiceStatusItem[];
  secretRefCount: number;
}) {
  if (!tenant) {
    return (
      <section className="portal-aac-panel">
        <EmptyState
          title="No tenant selected"
          body="Select or add a tenant binding to review its service status and link actual resources."
        />
      </section>
    );
  }

  const linkedCount = serviceStatuses.filter((row) => row.status === 'linked').length;
  const notLinkedCount = serviceStatuses.filter((row) => row.status === 'not_linked').length;

  return (
    <section className="portal-aac-panel">
      <div className="portal-aac-panel-head">
        <div>
          <div className="portal-aac-eyebrow">Selected Tenant</div>
          <h3>{tenant.displayName || tenant.appTenantKey}</h3>
        </div>
        <StatusBadge value={tenant.status} />
      </div>
      <p className="portal-aac-panel-copy">
        {tenant.description || 'Isolation island inside the app. Link actual resources here when this tenant needs dedicated routing or resource ownership.'}
      </p>
      <dl className="portal-aac-detail-list">
        <div>
          <dt>Tenant Key / System ID</dt>
          <dd>{tenant.appTenantKey}</dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>{titleCase(tenant.environment)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{formatStatusLabel(tenant.status)}</dd>
        </div>
        <div>
          <dt>Linked Services</dt>
          <dd>{linkedCount}</dd>
        </div>
        <div>
          <dt>Not Linked Yet</dt>
          <dd>{notLinkedCount}</dd>
        </div>
        <div>
          <dt>Secret References</dt>
          <dd>{secretRefCount}</dd>
        </div>
      </dl>
    </section>
  );
}

function AppFormModal({
  mode,
  initial,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  initial?: PlatformAppItem;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [environment, setEnvironment] = useState(initial?.environment ?? 'production');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'active');
  const [metadataRaw, setMetadataRaw] = useState(metadataText(initial?.metadata ?? {}));
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (!name.trim()) {
      setLocalError('App Name is required.');
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        name,
        environment,
        description,
        metadata: parseMetadataInput(metadataRaw),
      };
      if (mode === 'edit') payload.status = status;
      await onSubmit(payload);
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Failed to prepare app payload.');
    }
  }

  return (
    <ModalShell
      title={mode === 'create' ? 'Create App' : `Edit ${initial?.name ?? 'App'}`}
      eyebrow="Simplified Setup"
      subtitle="Create the product container first. The shared ecosystem becomes available automatically, and actual resources are linked later."
      onClose={onClose}
    >
      <form className="portal-aac-form" onSubmit={handleSubmit}>
        <div className="portal-aac-form-grid">
          <label className="portal-aac-field">
            <span>App Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="WAPI" />
          </label>
          <label className="portal-aac-field">
            <span>Environment</span>
            <select value={environment} onChange={(event) => setEnvironment(event.target.value)}>
              {APP_ENVIRONMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {mode === 'edit' ? (
            <label className="portal-aac-field">
              <span>Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {APP_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="portal-aac-field portal-aac-field-wide">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Optional summary of what this app owns or serves"
            />
          </label>
        </div>

        <p className="portal-aac-helper-note">
          App Code is generated automatically. The app receives default ecosystem capability access without creating downstream Dify, Chatwoot, Evolution, LiteLLM, vLLM, Qdrant, Langfuse, or webhook resources.
        </p>

        <AdvancedMetadataField
          label="Advanced Metadata JSON"
          value={metadataRaw}
          onChange={setMetadataRaw}
          help="Optional registry metadata only. Do not place secrets or raw credentials here."
        />

        {localError || error ? <div className="portal-aac-form-error">{localError || error}</div> : null}

        <div className="portal-aac-modal-actions">
          <button type="button" className="portal-aac-secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="portal-aac-primary-button" disabled={busy}>
            {busy ? 'Saving…' : mode === 'create' ? 'Create App' : 'Save App'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function TenantBindingFormModal({
  mode,
  app,
  initial,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  app: PlatformAppItem;
  initial?: PlatformTenantBindingItem;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.displayName ?? '');
  const [environment, setEnvironment] = useState(initial?.environment ?? 'production');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'active');
  const [metadataRaw, setMetadataRaw] = useState(metadataText(stripDescriptionMetadata(initial?.metadata ?? {})));
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (!name.trim()) {
      setLocalError('Tenant Name is required.');
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        appId: app.id,
        name,
        environment,
        description,
        metadata: parseMetadataInput(metadataRaw),
      };
      if (mode === 'edit') payload.status = status;
      await onSubmit(payload);
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Failed to prepare tenant payload.');
    }
  }

  return (
    <ModalShell
      title={mode === 'create' ? 'Add Tenant Binding' : `Edit ${initial?.displayName || initial?.appTenantKey || 'Tenant'}`}
      eyebrow="Tenant Setup"
      subtitle="Tenant keys are generated automatically per app. This stays inside the portal registry and does not create product data inside the app itself."
      onClose={onClose}
    >
      <form className="portal-aac-form" onSubmit={handleSubmit}>
        <div className="portal-aac-form-grid">
          <label className="portal-aac-field portal-aac-field-wide">
            <span>App</span>
            <input value={`${app.name} (${app.appCode})`} readOnly />
          </label>
          <label className="portal-aac-field">
            <span>Tenant Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="ABC Trading" />
          </label>
          <label className="portal-aac-field">
            <span>Environment</span>
            <select value={environment} onChange={(event) => setEnvironment(event.target.value)}>
              {APP_ENVIRONMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {mode === 'edit' ? (
            <label className="portal-aac-field">
              <span>Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {TENANT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="portal-aac-field portal-aac-field-wide">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Optional note about what this tenant binding represents"
            />
          </label>
        </div>

        <p className="portal-aac-helper-note">
          Tenant Key / System ID is generated automatically from Tenant Name and stays unique inside the selected app.
        </p>

        <AdvancedMetadataField
          label="Advanced Metadata JSON"
          value={metadataRaw}
          onChange={setMetadataRaw}
          help="Optional registry metadata only. Do not place secrets or raw credentials here."
        />

        {localError || error ? <div className="portal-aac-form-error">{localError || error}</div> : null}

        <div className="portal-aac-modal-actions">
          <button type="button" className="portal-aac-secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="portal-aac-primary-button" disabled={busy}>
            {busy ? 'Saving…' : mode === 'create' ? 'Add Tenant Binding' : 'Save Tenant'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ServiceLinkFormModal({
  mode,
  app,
  targetLabel,
  tenantBindingId,
  serviceName,
  initial,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  app: PlatformAppItem;
  targetLabel: string;
  tenantBindingId: string | null;
  serviceName: string;
  initial?: PlatformServiceIntegrationItem;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const initialServiceName = initial?.serviceName ?? serviceName;
  const [resourceType, setResourceType] = useState(initial?.resourceType ?? getResourceTypeSuggestions(initialServiceName)[0] ?? '');
  const [resourceId, setResourceId] = useState(initial?.resourceId ?? '');
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [internalBaseUrl, setInternalBaseUrl] = useState(initial?.internalBaseUrl ?? '');
  const [status, setStatus] = useState(initial?.status === 'planned' ? 'linked' : initial?.status ?? 'linked');
  const [metadataRaw, setMetadataRaw] = useState(metadataText(initial?.metadata ?? {}));
  const [localError, setLocalError] = useState<string | null>(null);

  const resourceTypeOptions = useMemo(() => {
    const suggestions = getResourceTypeSuggestions(initialServiceName);
    if (resourceType && !suggestions.includes(resourceType)) return [resourceType, ...suggestions];
    return suggestions;
  }, [initialServiceName, resourceType]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (!resourceType.trim() || !resourceId.trim()) {
      setLocalError('Resource Type and Resource ID are required.');
      return;
    }

    try {
      await onSubmit({
        appId: app.id,
        tenantBindingId,
        serviceName: initialServiceName,
        resourceType,
        resourceId,
        displayName,
        baseUrl,
        internalBaseUrl,
        status,
        metadata: parseMetadataInput(metadataRaw),
      });
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Failed to prepare service link payload.');
    }
  }

  return (
    <ModalShell
      title={mode === 'create' ? `Link ${getServiceDisplayName(initialServiceName)} Resource` : `Edit ${getServiceDisplayName(initialServiceName)} Link`}
      eyebrow="Service Links"
      subtitle="Service Links map this app or tenant to the actual resource in each tool. This remains registry-only and does not provision downstream resources."
      onClose={onClose}
    >
      <form className="portal-aac-form" onSubmit={handleSubmit}>
        <div className="portal-aac-form-grid">
          <label className="portal-aac-field portal-aac-field-wide">
            <span>App</span>
            <input value={`${app.name} (${app.appCode})`} readOnly />
          </label>
          <label className="portal-aac-field">
            <span>Tenant</span>
            <input value={targetLabel} readOnly />
          </label>
          <label className="portal-aac-field">
            <span>Service Name</span>
            <input value={getServiceDisplayName(initialServiceName)} readOnly />
          </label>
          <label className="portal-aac-field">
            <span>Resource Type</span>
            <select value={resourceType} onChange={(event) => setResourceType(event.target.value)}>
              <option value="">Select a resource type</option>
              {resourceTypeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="portal-aac-field">
            <span>Resource ID</span>
            <input value={resourceId} onChange={(event) => setResourceId(event.target.value)} placeholder="instance_123" />
          </label>
          <label className="portal-aac-field">
            <span>Display Name</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Optional human label" />
          </label>
          <label className="portal-aac-field">
            <span>Base URL</span>
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://service.example" />
          </label>
          <label className="portal-aac-field">
            <span>Internal Base URL</span>
            <input value={internalBaseUrl} onChange={(event) => setInternalBaseUrl(event.target.value)} placeholder="http://service.internal" />
          </label>
          <label className="portal-aac-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {SERVICE_LINK_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <AdvancedMetadataField
          label="Advanced Metadata JSON"
          value={metadataRaw}
          onChange={setMetadataRaw}
          help="Optional registry-only metadata for this service link. No secret values or external provisioning details belong here."
        />

        {localError || error ? <div className="portal-aac-form-error">{localError || error}</div> : null}

        <div className="portal-aac-modal-actions">
          <button type="button" className="portal-aac-secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="portal-aac-primary-button" disabled={busy}>
            {busy ? 'Saving…' : mode === 'create' ? 'Link Resource' : 'Save Link'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function SecretReferenceFormModal({
  mode,
  app,
  targetLabel,
  tenantBindingId,
  initial,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  app: PlatformAppItem;
  targetLabel: string;
  tenantBindingId: string | null;
  initial?: PlatformSecretRefItem;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [serviceName, setServiceName] = useState(initial?.serviceName ?? DEFAULT_ECOSYSTEM_SERVICES[0]?.serviceName ?? 'dify');
  const [refProvider, setRefProvider] = useState(initial?.refProvider ?? 'infisical');
  const [refPath, setRefPath] = useState(initial?.refPath ?? '');
  const [refKey, setRefKey] = useState(initial?.refKey ?? '');
  const [scope, setScope] = useState(initial?.scope ?? (tenantBindingId ? 'tenant' : 'app'));
  const [status, setStatus] = useState(initial?.status === 'planned' ? 'active' : initial?.status ?? 'active');
  const [metadataRaw, setMetadataRaw] = useState(metadataText(initial?.metadata ?? {}));
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (!refPath.trim()) {
      setLocalError('Ref Path is required.');
      return;
    }

    try {
      await onSubmit({
        appId: app.id,
        tenantBindingId,
        serviceName,
        refProvider,
        refPath,
        refKey,
        scope,
        status,
        metadata: parseMetadataInput(metadataRaw),
      });
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Failed to prepare secret reference payload.');
    }
  }

  return (
    <ModalShell
      title={mode === 'create' ? 'Add Secret Reference' : 'Edit Secret Reference'}
      eyebrow="Secret References"
      subtitle="Secret values stay in Infisical or runtime env. This registry stores only the reference path."
      onClose={onClose}
    >
      <form className="portal-aac-form" onSubmit={handleSubmit}>
        <div className="portal-aac-form-grid">
          <label className="portal-aac-field portal-aac-field-wide">
            <span>App</span>
            <input value={`${app.name} (${app.appCode})`} readOnly />
          </label>
          <label className="portal-aac-field">
            <span>Target</span>
            <input value={targetLabel} readOnly />
          </label>
          <label className="portal-aac-field">
            <span>Service</span>
            <select value={serviceName} onChange={(event) => setServiceName(event.target.value)}>
              {SERVICE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="portal-aac-field">
            <span>Ref Provider</span>
            <select value={refProvider} onChange={(event) => setRefProvider(event.target.value)}>
              {SECRET_PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="portal-aac-field portal-aac-field-wide">
            <span>Ref Path</span>
            <input value={refPath} onChange={(event) => setRefPath(event.target.value)} placeholder="/prod/wapi/dify" />
          </label>
          <label className="portal-aac-field">
            <span>Ref Key</span>
            <input value={refKey} onChange={(event) => setRefKey(event.target.value)} placeholder="API_KEY" />
          </label>
          <label className="portal-aac-field">
            <span>Scope</span>
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              {SECRET_SCOPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="portal-aac-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {SECRET_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <AdvancedMetadataField
          label="Advanced Metadata JSON"
          value={metadataRaw}
          onChange={setMetadataRaw}
          help="Optional registry metadata only. No secret values or credentials are stored here."
        />

        {localError || error ? <div className="portal-aac-form-error">{localError || error}</div> : null}

        <div className="portal-aac-modal-actions">
          <button type="button" className="portal-aac-secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="portal-aac-primary-button" disabled={busy}>
            {busy ? 'Saving…' : mode === 'create' ? 'Add Secret Reference' : 'Save Reference'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function AppDeleteModal({
  app,
  busy,
  error,
  onClose,
  onDelete,
}: {
  app: PlatformAppItem;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onDelete: (appCodeConfirmation: string) => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState('');

  return (
    <ModalShell
      title={`Delete ${app.name}`}
      eyebrow="Registry Reset"
      subtitle="This removes only portal registry records. No WAPI data, external tool resources, or downstream databases are touched."
      onClose={onClose}
    >
      <div className="portal-aac-danger-copy">
        <p><strong>App Name:</strong> {app.name}</p>
        <p><strong>App Code:</strong> {app.appCode}</p>
        <p><strong>Environment:</strong> {titleCase(app.environment)}</p>
        <p><strong>Tenant Bindings:</strong> {app.tenantBindingCount}</p>
        <p><strong>Ecosystem Services:</strong> {app.capabilityCount}</p>
        <p><strong>Service Links:</strong> {app.serviceIntegrationCount}</p>
        <p><strong>Secret References:</strong> {app.secretRefCount}</p>
        <p>Deleting this app is registry-only. External Dify, Chatwoot, Evolution, LiteLLM, vLLM, Qdrant, Langfuse, webhook, and secret systems are not modified.</p>
      </div>
      <label className="portal-aac-field">
        <span>Type the exact app code to confirm</span>
        <input value={confirmation} onChange={(event) => setConfirmation(event.target.value.trim())} placeholder={app.appCode} />
      </label>
      {error ? <div className="portal-aac-form-error">{error}</div> : null}
      <div className="portal-aac-modal-actions">
        <button type="button" className="portal-aac-secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
        <button
          type="button"
          className="portal-aac-danger-button"
          disabled={busy || confirmation !== app.appCode}
          onClick={() => void onDelete(confirmation)}
        >
          {busy ? 'Deleting…' : 'Delete Registry App'}
        </button>
      </div>
    </ModalShell>
  );
}

function DeleteRecordModal({
  title,
  subtitle,
  warning,
  busy,
  error,
  onClose,
  onDelete,
}: {
  title: string;
  subtitle: string;
  warning: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  return (
    <ModalShell title={title} eyebrow="Registry Delete" subtitle={subtitle} onClose={onClose}>
      <p className="portal-aac-panel-copy portal-aac-danger-copy">{warning}</p>
      {error ? <div className="portal-aac-form-error">{error}</div> : null}
      <div className="portal-aac-modal-actions">
        <button type="button" className="portal-aac-secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="portal-aac-danger-button" onClick={() => void onDelete()} disabled={busy}>
          {busy ? 'Deleting…' : 'Delete Registry Record'}
        </button>
      </div>
    </ModalShell>
  );
}

function TenantBindingsTable({
  rows,
  selectedId,
  onSelect,
  onEdit,
  onDisable,
  onDelete,
}: {
  rows: PlatformTenantBindingItem[];
  selectedId: string | null;
  onSelect: (bindingId: string) => void;
  onEdit: (binding: PlatformTenantBindingItem) => void;
  onDisable: (binding: PlatformTenantBindingItem) => void;
  onDelete: (binding: PlatformTenantBindingItem) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No tenant bindings yet"
        body="Add your first tenant binding to create an isolation island inside the selected app."
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
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((binding) => (
            <tr key={binding.id} className={binding.id === selectedId ? 'portal-aac-row-selected' : undefined}>
              <td>
                <div className="portal-aac-table-title">{binding.displayName || binding.appTenantKey}</div>
                <div className="portal-aac-table-sub">{binding.appTenantKey}</div>
                {binding.description ? <div className="portal-aac-table-sub">{binding.description}</div> : null}
              </td>
              <td>{titleCase(binding.environment)}</td>
              <td><StatusBadge value={binding.status} /></td>
              <td>{formatDateTime(binding.lastSyncedAt)}</td>
              <td className="portal-aac-table-action-cell">
                <div className="portal-aac-row-actions">
                  <button type="button" className="portal-aac-inline-action" onClick={() => onSelect(binding.id)}>
                    {binding.id === selectedId ? 'Selected' : 'Select'}
                  </button>
                  <button type="button" className="portal-aac-inline-action" onClick={() => onEdit(binding)}>Edit</button>
                  {binding.status !== 'disabled' ? (
                    <button type="button" className="portal-aac-inline-action" onClick={() => onDisable(binding)}>Disable</button>
                  ) : null}
                  <button type="button" className="portal-aac-inline-action portal-aac-inline-action-danger" onClick={() => onDelete(binding)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TenantServiceStatusTable({
  rows,
  tenantSelected,
  onCreateLink,
  onEditLink,
  onDisableLink,
  onDeleteLink,
}: {
  rows: PlatformTenantServiceStatusItem[];
  tenantSelected: boolean;
  onCreateLink: (row: PlatformTenantServiceStatusItem) => void;
  onEditLink: (integrationId: string) => void;
  onDisableLink: (integrationId: string) => void;
  onDeleteLink: (integrationId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No ecosystem services yet"
        body="This app does not have any capability rows yet. Run the Phase 2B migration/backfill first."
      />
    );
  }

  return (
    <div className="portal-aac-table-wrap">
      <table className="portal-aac-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Status</th>
            <th>Resource</th>
            <th>Scope</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.serviceName}>
              <td>
                <div className="portal-aac-table-title">{row.displayName}</div>
                <div className="portal-aac-table-sub">{row.status === 'not_linked' ? 'Capability available, waiting for a real resource link.' : 'Registry-only status view.'}</div>
              </td>
              <td><StatusBadge value={row.status} /></td>
              <td>
                {row.resourceId ? (
                  <>
                    <div className="portal-aac-table-title">{row.resourceId}</div>
                    <div className="portal-aac-table-sub">{row.resourceType || 'Resource type pending'}</div>
                  </>
                ) : (
                  <div className="portal-aac-table-sub">Not linked yet</div>
                )}
              </td>
              <td>{row.linkScope ? `${titleCase(row.linkScope)}-level` : '—'}</td>
              <td className="portal-aac-table-action-cell">
                <div className="portal-aac-row-actions">
                  {row.integrationId ? (
                    <>
                      <button type="button" className="portal-aac-inline-action" onClick={() => onEditLink(row.integrationId!)}>Edit Link</button>
                      {row.status !== 'disabled' ? (
                        <button type="button" className="portal-aac-inline-action" onClick={() => onDisableLink(row.integrationId!)}>Disable Link</button>
                      ) : null}
                      <button type="button" className="portal-aac-inline-action portal-aac-inline-action-danger" onClick={() => onDeleteLink(row.integrationId!)}>Delete Link</button>
                    </>
                  ) : tenantSelected && row.status !== 'disabled' && row.status !== 'error' ? (
                    <button type="button" className="portal-aac-inline-action" onClick={() => onCreateLink(row)}>Link Resource</button>
                  ) : (
                    <span className="portal-aac-table-sub">Select a tenant to link resources.</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ServiceLinksTable({
  rows,
  onEdit,
  onDisable,
  onDelete,
}: {
  rows: PlatformServiceIntegrationItem[];
  onEdit: (integration: PlatformServiceIntegrationItem) => void;
  onDisable: (integration: PlatformServiceIntegrationItem) => void;
  onDelete: (integration: PlatformServiceIntegrationItem) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No service links registered"
        body="Use a tenant service row to link the actual Evolution instance, Dify dataset, Chatwoot inbox, LiteLLM alias, or other shared resource later."
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
            <th>Target</th>
            <th>Routing</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((integration) => (
            <tr key={integration.id}>
              <td>
                <div className="portal-aac-table-title">{integration.serviceDisplayName}</div>
                <div className="portal-aac-table-sub">{integration.displayName || integration.appName}</div>
              </td>
              <td>
                <div className="portal-aac-table-title">{integration.resourceId}</div>
                <div className="portal-aac-table-sub">{integration.resourceType}</div>
              </td>
              <td>{integration.tenantDisplayName || integration.tenantBindingKey || 'App-wide'}</td>
              <td>
                <div className="portal-aac-table-sub">Public: {integration.baseUrl || '—'}</div>
                <div className="portal-aac-table-sub">Internal: {integration.internalBaseUrl || '—'}</div>
              </td>
              <td><StatusBadge value={integration.status === 'planned' ? 'not_linked' : integration.status} /></td>
              <td className="portal-aac-table-action-cell">
                <div className="portal-aac-row-actions">
                  <button type="button" className="portal-aac-inline-action" onClick={() => onEdit(integration)}>Edit</button>
                  {integration.status !== 'disabled' ? (
                    <button type="button" className="portal-aac-inline-action" onClick={() => onDisable(integration)}>Disable</button>
                  ) : null}
                  <button type="button" className="portal-aac-inline-action portal-aac-inline-action-danger" onClick={() => onDelete(integration)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SecretReferencesTable({
  rows,
  onEdit,
  onDisable,
  onDelete,
}: {
  rows: PlatformSecretRefItem[];
  onEdit: (secretRef: PlatformSecretRefItem) => void;
  onDisable: (secretRef: PlatformSecretRefItem) => void;
  onDelete: (secretRef: PlatformSecretRefItem) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No secret references registered"
        body="Secret values stay in Infisical or runtime env. Add a reference path here only when a service needs it."
      />
    );
  }

  return (
    <div className="portal-aac-table-wrap">
      <table className="portal-aac-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Target</th>
            <th>Reference Path</th>
            <th>Scope</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((secretRef) => (
            <tr key={secretRef.id}>
              <td>
                <div className="portal-aac-table-title">{secretRef.serviceDisplayName}</div>
                <div className="portal-aac-table-sub">{secretRef.refProvider}</div>
              </td>
              <td>{secretRef.tenantDisplayName || secretRef.tenantBindingKey || 'App-wide'}</td>
              <td>
                <code className="portal-aac-secret-path">{secretRef.refPath}</code>
                {secretRef.refKey ? <div className="portal-aac-table-sub">Key: {secretRef.refKey}</div> : null}
              </td>
              <td>{titleCase(secretRef.scope)}</td>
              <td><StatusBadge value={secretRef.status === 'planned' ? 'disabled' : secretRef.status} /></td>
              <td className="portal-aac-table-action-cell">
                <div className="portal-aac-row-actions">
                  <button type="button" className="portal-aac-inline-action" onClick={() => onEdit(secretRef)}>Edit</button>
                  {secretRef.status !== 'disabled' ? (
                    <button type="button" className="portal-aac-inline-action" onClick={() => onDisable(secretRef)}>Disable</button>
                  ) : null}
                  <button type="button" className="portal-aac-inline-action portal-aac-inline-action-danger" onClick={() => onDelete(secretRef)}>Delete</button>
                </div>
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
  const [flash, setFlash] = useState<FlashMessage>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);

  const integrationMap = useMemo(() => new Map((data?.serviceIntegrations ?? []).map((row) => [row.id, row])), [data]);

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
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSnapshot();
  }, []);

  const selectedApp = data?.selectedApp ?? null;
  const selectedTenantBinding = data?.selectedTenantBinding ?? null;
  const selectedTargetLabel = targetLabelFromBinding(selectedTenantBinding);

  function openModal(nextModal: ModalState) {
    setModalError(null);
    setModal(nextModal);
  }

  function closeModal() {
    if (mutating) return;
    setModal(null);
    setModalError(null);
  }

  async function mutateRegistry(
    url: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body: Record<string, unknown>,
    successMessage: string,
    opts?: {
      appCode?: string | null;
      tenantBindingId?: string | null;
      closeModal?: boolean;
      resolveSelection?: (json: Record<string, unknown>) => { appCode?: string | null; tenantBindingId?: string | null };
    },
  ) {
    setModalError(null);
    setMutating(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || json.ok !== true) {
        throw new Error(getApiErrorMessage(json, res.status));
      }

      const resolvedSelection = opts?.resolveSelection?.(json) ?? {};
      const nextAppCode = resolvedSelection.appCode !== undefined
        ? resolvedSelection.appCode
        : opts?.appCode === undefined ? data?.selectedAppCode ?? null : opts.appCode;
      const nextTenantBindingId = resolvedSelection.tenantBindingId !== undefined
        ? resolvedSelection.tenantBindingId
        : opts?.tenantBindingId === undefined ? data?.selectedTenantBindingId ?? null : opts.tenantBindingId;

      if (opts?.closeModal !== false) closeModal();
      setFlash({ tone: 'success', text: successMessage });
      await loadSnapshot(nextAppCode, nextTenantBindingId);
      return json;
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : 'Request failed';
      if (modal) setModalError(message);
      else setFlash({ tone: 'error', text: message });
      return null;
    } finally {
      setMutating(false);
    }
  }

  async function disableRecord(url: string, label: string, appCode?: string | null, tenantBindingId?: string | null) {
    if (!window.confirm(`Disable ${label}? This only changes the registry status.`)) return;
    await mutateRegistry(url, 'PATCH', { action: 'disable' }, `${label} disabled.`, {
      appCode,
      tenantBindingId,
      closeModal: false,
    });
  }

  function openCreateServiceLink(row: PlatformTenantServiceStatusItem) {
    if (!selectedApp || !selectedTenantBinding) return;
    openModal({ kind: 'createServiceLink', app: selectedApp, tenantBinding: selectedTenantBinding, serviceStatus: row });
  }

  function openEditServiceLinkById(integrationId: string) {
    if (!selectedApp) return;
    const integration = integrationMap.get(integrationId);
    if (!integration) return;
    openModal({ kind: 'editServiceLink', app: selectedApp, integration, targetLabel: targetLabelFromIntegration(integration) });
  }

  function openDeleteServiceLinkById(integrationId: string) {
    const integration = integrationMap.get(integrationId);
    if (!integration) return;
    openModal({ kind: 'deleteServiceLink', integration });
  }

  return (
    <div className="portal-aac-shell">
      <section className="portal-aac-banner">
        <div>
          <div className="portal-aac-eyebrow">Control Plane</div>
          <h2>Create the app once, enable the shared ecosystem by default, and link actual resources later.</h2>
        </div>
        <p>
          Apps are product containers. Tenants are isolation islands inside each app. Ecosystem Services show what the app can use. Service Links and Secret References stay registry-only and never touch external tool databases in this phase.
        </p>
      </section>

      <FlashBanner flash={flash} />

      {error ? (
        <section className="portal-aac-panel portal-aac-error">
          <div className="portal-aac-panel-head">
            <div>
              <div className="portal-aac-eyebrow">Load Error</div>
              <h3>Could not load App Access Control</h3>
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
          <span className="portal-aac-stat-label">Apps</span>
          <strong>{data?.summary.appCount ?? 0}</strong>
          <span>Product containers registered in the portal control plane</span>
        </article>
        <article className="portal-aac-stat-card">
          <span className="portal-aac-stat-label">Active Tenants</span>
          <strong>{data?.summary.activeTenantBindingCount ?? 0}</strong>
          <span>Isolation islands available across all apps</span>
        </article>
        <article className="portal-aac-stat-card">
          <span className="portal-aac-stat-label">Ecosystem Services</span>
          <strong>{data?.summary.ecosystemCapabilityCount ?? 0}</strong>
          <span>Default service capabilities granted across registered apps</span>
        </article>
        <article className="portal-aac-stat-card">
          <span className="portal-aac-stat-label">Secret References</span>
          <strong>{data?.summary.secretRefCount ?? 0}</strong>
          <span>Reference paths only. Secret values never render here.</span>
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
                    <h3>Product Catalog</h3>
                  </div>
                  <button type="button" className="portal-aac-primary-button" onClick={() => openModal({ kind: 'createApp' })}>
                    Create App
                  </button>
                </div>

                {data.apps.length === 0 ? (
                  <EmptyState
                    title="No app registered yet"
                    body="Create your first app to enable the shared AI and communication ecosystem by default."
                  />
                ) : null}

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
                        <StatusBadge value={app.status} />
                      </div>
                      <div className="portal-aac-app-list-sub">{app.appCode}</div>
                      <div className="portal-aac-app-list-copy">{app.description || 'Shared ecosystem access enabled by default.'}</div>
                      <div className="portal-aac-app-list-meta">
                        <span>{titleCase(app.environment)}</span>
                        <span>{app.tenantBindingCount} tenants</span>
                        <span>{app.capabilityCount} services</span>
                      </div>
                    </button>
                  ))}
                </div>
              </aside>

              <section className="portal-aac-main">
                {selectedApp ? (
                  <>
                    <div className="portal-aac-main-head">
                      <div>
                        <div className="portal-aac-eyebrow">Selected App</div>
                        <h3>{selectedApp.name}</h3>
                      </div>
                      <div className="portal-aac-action-row">
                        <button type="button" className="portal-aac-secondary-button" onClick={() => openModal({ kind: 'editApp', app: selectedApp })}>
                          Edit App
                        </button>
                        {selectedApp.status !== 'disabled' ? (
                          <button
                            type="button"
                            className="portal-aac-secondary-button"
                            onClick={() => void disableRecord(`/api/admin/platform-app-access/apps/${selectedApp.id}`, `${selectedApp.name} app`, selectedApp.appCode, data.selectedTenantBindingId)}
                          >
                            Disable App
                          </button>
                        ) : null}
                        <button type="button" className="portal-aac-danger-button" onClick={() => openModal({ kind: 'deleteApp', app: selectedApp })}>
                          Delete App
                        </button>
                        <button type="button" className="portal-aac-primary-button" onClick={() => openModal({ kind: 'createTenantBinding', app: selectedApp })}>
                          Add Tenant Binding
                        </button>
                        <button type="button" className="portal-aac-primary-button" onClick={() => openModal({ kind: 'createSecretRef', app: selectedApp, tenantBindingId: data.selectedTenantBindingId, targetLabel: selectedTargetLabel })}>
                          Add Secret Reference
                        </button>
                      </div>
                    </div>

                    <div className="portal-aac-overview-grid">
                      <AppOverviewCard app={selectedApp} />
                      <CapabilityGrid rows={data.appCapabilities} />
                    </div>

                    <div className="portal-aac-panel-grid">
                      <section className="portal-aac-panel">
                        <div className="portal-aac-panel-head">
                          <div>
                            <div className="portal-aac-eyebrow">Tenant Bindings</div>
                            <h3>Isolation islands inside the app</h3>
                          </div>
                          <span className="portal-aac-count-chip">{data.tenantBindings.length}</span>
                        </div>
                        <TenantBindingsTable
                          rows={data.tenantBindings}
                          selectedId={data.selectedTenantBindingId}
                          onSelect={(bindingId) => void loadSnapshot(data.selectedAppCode, bindingId)}
                          onEdit={(binding) => openModal({ kind: 'editTenantBinding', app: selectedApp, binding })}
                          onDisable={(binding) => void disableRecord(`/api/admin/platform-app-access/tenant-bindings/${binding.id}`, `${binding.displayName || binding.appTenantKey} tenant`, data.selectedAppCode, binding.id)}
                          onDelete={(binding) => openModal({ kind: 'deleteTenantBinding', binding })}
                        />
                      </section>

                      <TenantSummaryCard
                        tenant={selectedTenantBinding}
                        serviceStatuses={data.selectedTenantServiceStatuses}
                        secretRefCount={data.selectedTenantSecretRefs.length}
                      />
                    </div>

                    <section className="portal-aac-panel">
                      <div className="portal-aac-panel-head">
                        <div>
                          <div className="portal-aac-eyebrow">Tenant Service Links</div>
                          <h3>{selectedTenantBinding ? `${selectedTargetLabel} service status` : 'Select a tenant to link actual resources'}</h3>
                        </div>
                        {selectedTenantBinding ? <span className="portal-aac-count-chip">{data.selectedTenantServiceStatuses.length}</span> : null}
                      </div>
                      <p className="portal-aac-panel-copy">
                        Available means the app can use the shared service. Not Linked means no actual resource is mapped yet. Linked means a registry link exists to a real downstream resource.
                      </p>
                      {selectedTenantBinding ? (
                        <TenantServiceStatusTable
                          rows={data.selectedTenantServiceStatuses}
                          tenantSelected={Boolean(selectedTenantBinding)}
                          onCreateLink={openCreateServiceLink}
                          onEditLink={openEditServiceLinkById}
                          onDisableLink={(integrationId) => {
                            const integration = integrationMap.get(integrationId);
                            if (!integration) return;
                            void disableRecord(`/api/admin/platform-app-access/service-integrations/${integration.id}`, `${integration.resourceId} service link`, data.selectedAppCode, data.selectedTenantBindingId);
                          }}
                          onDeleteLink={openDeleteServiceLinkById}
                        />
                      ) : (
                        <EmptyState
                          title="No tenant selected"
                          body="Select a tenant binding to view each ecosystem service as Available, Not Linked, Linked, Disabled, or Error."
                        />
                      )}
                    </section>
                  </>
                ) : (
                  <section className="portal-aac-panel">
                    <EmptyState
                      title="No app registered yet"
                      body="Create your first app to start with automatic ecosystem access and then add tenant bindings as needed."
                      action={
                        <button type="button" className="portal-aac-primary-button" onClick={() => openModal({ kind: 'createApp' })}>
                          Create App
                        </button>
                      }
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
                <button
                  type="button"
                  className="portal-aac-primary-button"
                  disabled={!selectedApp}
                  onClick={() => selectedApp && openModal({ kind: 'createTenantBinding', app: selectedApp })}
                >
                  Add Tenant Binding
                </button>
              </div>
              {selectedApp ? (
                <TenantBindingsTable
                  rows={data.tenantBindings}
                  selectedId={data.selectedTenantBindingId}
                  onSelect={(bindingId) => void loadSnapshot(data.selectedAppCode, bindingId)}
                  onEdit={(binding) => openModal({ kind: 'editTenantBinding', app: selectedApp, binding })}
                  onDisable={(binding) => void disableRecord(`/api/admin/platform-app-access/tenant-bindings/${binding.id}`, `${binding.displayName || binding.appTenantKey} tenant`, data.selectedAppCode, binding.id)}
                  onDelete={(binding) => openModal({ kind: 'deleteTenantBinding', binding })}
                />
              ) : (
                <EmptyState title="No app selected" body="Select or create an app first." />
              )}
            </section>
          ) : null}

          {tab === 'serviceLinks' ? (
            <div className="portal-aac-panel-grid">
              <section className="portal-aac-panel">
                <div className="portal-aac-panel-head">
                  <div>
                    <div className="portal-aac-eyebrow">Service Links</div>
                    <h3>{selectedTenantBinding ? `${selectedTargetLabel} link status` : 'Select a tenant to link resources'}</h3>
                  </div>
                  {selectedTenantBinding ? <StatusBadge value="available" /> : null}
                </div>
                <p className="portal-aac-panel-copy">
                  Service Links map this app or tenant to the actual resource in each tool. Example: Evolution instance, Dify dataset, Chatwoot inbox, LiteLLM model alias.
                </p>
                {selectedTenantBinding ? (
                  <TenantServiceStatusTable
                    rows={data.selectedTenantServiceStatuses}
                    tenantSelected={Boolean(selectedTenantBinding)}
                    onCreateLink={openCreateServiceLink}
                    onEditLink={openEditServiceLinkById}
                    onDisableLink={(integrationId) => {
                      const integration = integrationMap.get(integrationId);
                      if (!integration) return;
                      void disableRecord(`/api/admin/platform-app-access/service-integrations/${integration.id}`, `${integration.resourceId} service link`, data.selectedAppCode, data.selectedTenantBindingId);
                    }}
                    onDeleteLink={openDeleteServiceLinkById}
                  />
                ) : (
                  <EmptyState
                    title="No tenant selected"
                    body="Select a tenant binding on the Apps or Tenant Bindings tab to see service rows and link actual resources."
                  />
                )}
              </section>

              <section className="portal-aac-panel">
                <div className="portal-aac-panel-head">
                  <div>
                    <div className="portal-aac-eyebrow">Registered Service Links</div>
                    <h3>{selectedApp?.name || 'App'} linked resources</h3>
                  </div>
                  <span className="portal-aac-count-chip">{data.serviceIntegrations.length}</span>
                </div>
                {selectedApp ? (
                  <ServiceLinksTable
                    rows={data.serviceIntegrations}
                    onEdit={(integration) => openModal({ kind: 'editServiceLink', app: selectedApp, integration, targetLabel: targetLabelFromIntegration(integration) })}
                    onDisable={(integration) => void disableRecord(`/api/admin/platform-app-access/service-integrations/${integration.id}`, `${integration.resourceId} service link`, data.selectedAppCode, data.selectedTenantBindingId)}
                    onDelete={(integration) => openModal({ kind: 'deleteServiceLink', integration })}
                  />
                ) : (
                  <EmptyState title="No app selected" body="Select or create an app first." />
                )}
              </section>
            </div>
          ) : null}

          {tab === 'secretRefs' ? (
            <section className="portal-aac-panel">
              <div className="portal-aac-panel-head">
                <div>
                  <div className="portal-aac-eyebrow">Secret References</div>
                  <h3>{selectedApp?.name || 'App'} reference registry</h3>
                </div>
                <button
                  type="button"
                  className="portal-aac-primary-button"
                  disabled={!selectedApp}
                  onClick={() => selectedApp && openModal({ kind: 'createSecretRef', app: selectedApp, tenantBindingId: data.selectedTenantBindingId, targetLabel: selectedTargetLabel })}
                >
                  Add Secret Reference
                </button>
              </div>
              <p className="portal-aac-panel-copy">
                Secret values stay in Infisical or runtime env. This registry stores only the reference path.
              </p>
              {selectedApp ? (
                <SecretReferencesTable
                  rows={data.secretRefs}
                  onEdit={(secretRef) => openModal({ kind: 'editSecretRef', app: selectedApp, secretRef, targetLabel: targetLabelFromSecretRef(secretRef) })}
                  onDisable={(secretRef) => void disableRecord(`/api/admin/platform-app-access/secret-refs/${secretRef.id}`, `${secretRef.refPath} secret reference`, data.selectedAppCode, data.selectedTenantBindingId)}
                  onDelete={(secretRef) => openModal({ kind: 'deleteSecretRef', secretRef })}
                />
              ) : (
                <EmptyState title="No app selected" body="Select or create an app first." />
              )}
            </section>
          ) : null}
        </>
      ) : null}

      {loading && data ? <div className="portal-aac-refreshing">Refreshing registry snapshot…</div> : null}

      {modal?.kind === 'createApp' ? (
        <AppFormModal
          mode="create"
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onSubmit={(payload) => mutateRegistry('/api/admin/platform-app-access/apps', 'POST', payload, 'Registry app created.', {
            resolveSelection: (json) => {
              const app = objectValue(json.app);
              return { appCode: typeof app.appCode === 'string' ? app.appCode : null, tenantBindingId: null };
            },
          }).then(() => undefined)}
        />
      ) : null}

      {modal?.kind === 'editApp' ? (
        <AppFormModal
          mode="edit"
          initial={modal.app}
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onSubmit={(payload) => mutateRegistry(`/api/admin/platform-app-access/apps/${modal.app.id}`, 'PATCH', payload, 'Registry app updated.', { appCode: modal.app.appCode, tenantBindingId: data?.selectedTenantBindingId ?? null }).then(() => undefined)}
        />
      ) : null}

      {modal?.kind === 'deleteApp' ? (
        <AppDeleteModal
          app={modal.app}
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onDelete={(appCodeConfirmation) => mutateRegistry(`/api/admin/platform-app-access/apps/${modal.app.id}`, 'DELETE', { appCodeConfirmation }, `${modal.app.name} registry app deleted.`, { appCode: null, tenantBindingId: null }).then(() => undefined)}
        />
      ) : null}

      {modal?.kind === 'createTenantBinding' ? (
        <TenantBindingFormModal
          mode="create"
          app={modal.app}
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onSubmit={(payload) => mutateRegistry('/api/admin/platform-app-access/tenant-bindings', 'POST', payload, 'Tenant binding added.', {
            appCode: modal.app.appCode,
            resolveSelection: (json) => {
              const tenantBinding = objectValue(json.tenantBinding);
              return { tenantBindingId: typeof tenantBinding.id === 'string' ? tenantBinding.id : null };
            },
          }).then(() => undefined)}
        />
      ) : null}

      {modal?.kind === 'editTenantBinding' ? (
        <TenantBindingFormModal
          mode="edit"
          app={modal.app}
          initial={modal.binding}
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onSubmit={(payload) => mutateRegistry(`/api/admin/platform-app-access/tenant-bindings/${modal.binding.id}`, 'PATCH', payload, 'Tenant binding updated.', { appCode: modal.app.appCode, tenantBindingId: modal.binding.id }).then(() => undefined)}
        />
      ) : null}

      {modal?.kind === 'deleteTenantBinding' ? (
        <DeleteRecordModal
          title={`Delete ${modal.binding.displayName || modal.binding.appTenantKey}`}
          subtitle="This removes only the registry tenant binding. Product data and external resources are not deleted."
          warning="Only the portal registry row is removed. This does not delete tenant data in the app or any external service resource."
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onDelete={() => mutateRegistry(`/api/admin/platform-app-access/tenant-bindings/${modal.binding.id}`, 'DELETE', {}, 'Tenant binding deleted.', { appCode: data?.selectedAppCode ?? null, tenantBindingId: null }).then(() => undefined)}
        />
      ) : null}

      {modal?.kind === 'createServiceLink' ? (
        <ServiceLinkFormModal
          mode="create"
          app={modal.app}
          targetLabel={targetLabelFromBinding(modal.tenantBinding)}
          tenantBindingId={modal.tenantBinding.id}
          serviceName={modal.serviceStatus.serviceName}
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onSubmit={(payload) => mutateRegistry('/api/admin/platform-app-access/service-integrations', 'POST', payload, 'Service link added.', { appCode: modal.app.appCode, tenantBindingId: modal.tenantBinding.id }).then(() => undefined)}
        />
      ) : null}

      {modal?.kind === 'editServiceLink' ? (
        <ServiceLinkFormModal
          mode="edit"
          app={modal.app}
          targetLabel={modal.targetLabel}
          tenantBindingId={modal.integration.tenantBindingId}
          serviceName={modal.integration.serviceName}
          initial={modal.integration}
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onSubmit={(payload) => mutateRegistry(`/api/admin/platform-app-access/service-integrations/${modal.integration.id}`, 'PATCH', payload, 'Service link updated.', { appCode: modal.app.appCode, tenantBindingId: data?.selectedTenantBindingId ?? null }).then(() => undefined)}
        />
      ) : null}

      {modal?.kind === 'deleteServiceLink' ? (
        <DeleteRecordModal
          title={`Delete ${modal.integration.resourceId}`}
          subtitle="This removes only the registry service link. No downstream resource is deleted."
          warning="Deleting a service link never provisions or destroys resources in Dify, Chatwoot, Evolution, LiteLLM, vLLM, Qdrant, Langfuse, or webhook systems."
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onDelete={() => mutateRegistry(`/api/admin/platform-app-access/service-integrations/${modal.integration.id}`, 'DELETE', {}, 'Service link deleted.', { appCode: data?.selectedAppCode ?? null, tenantBindingId: data?.selectedTenantBindingId ?? null }).then(() => undefined)}
        />
      ) : null}

      {modal?.kind === 'createSecretRef' ? (
        <SecretReferenceFormModal
          mode="create"
          app={modal.app}
          targetLabel={modal.targetLabel}
          tenantBindingId={modal.tenantBindingId}
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onSubmit={(payload) => mutateRegistry('/api/admin/platform-app-access/secret-refs', 'POST', payload, 'Secret reference added.', { appCode: modal.app.appCode, tenantBindingId: data?.selectedTenantBindingId ?? null }).then(() => undefined)}
        />
      ) : null}

      {modal?.kind === 'editSecretRef' ? (
        <SecretReferenceFormModal
          mode="edit"
          app={modal.app}
          targetLabel={modal.targetLabel}
          tenantBindingId={modal.secretRef.tenantBindingId}
          initial={modal.secretRef}
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onSubmit={(payload) => mutateRegistry(`/api/admin/platform-app-access/secret-refs/${modal.secretRef.id}`, 'PATCH', payload, 'Secret reference updated.', { appCode: modal.app.appCode, tenantBindingId: data?.selectedTenantBindingId ?? null }).then(() => undefined)}
        />
      ) : null}

      {modal?.kind === 'deleteSecretRef' ? (
        <DeleteRecordModal
          title={`Delete ${modal.secretRef.refPath}`}
          subtitle="This removes only the registry reference. Secret values remain in Infisical or runtime env."
          warning="Only the portal registry row is removed. No secret value is shown, changed, or deleted."
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onDelete={() => mutateRegistry(`/api/admin/platform-app-access/secret-refs/${modal.secretRef.id}`, 'DELETE', {}, 'Secret reference deleted.', { appCode: data?.selectedAppCode ?? null, tenantBindingId: data?.selectedTenantBindingId ?? null }).then(() => undefined)}
        />
      ) : null}
    </div>
  );
}