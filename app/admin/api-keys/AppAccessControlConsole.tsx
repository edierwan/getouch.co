'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  PlatformAccessSnapshot,
  PlatformAppItem,
  PlatformSecretRefItem,
  PlatformServiceIntegrationItem,
  PlatformTenantBindingItem,
} from '@/lib/platform-app-access';
import { ApiKeyManagerConsole } from './ApiKeyManagerConsole';

type Tab = 'apps' | 'apiKeys' | 'tenantBindings' | 'serviceIntegrations' | 'secretRefs';
type FlashTone = 'success' | 'error';
type FlashMessage = { tone: FlashTone; text: string } | null;

type ModalState =
  | { kind: 'createApp' }
  | { kind: 'editApp'; app: PlatformAppItem }
  | { kind: 'deleteApp'; app: PlatformAppItem }
  | { kind: 'createTenantBinding'; app: PlatformAppItem }
  | { kind: 'editTenantBinding'; app: PlatformAppItem; binding: PlatformTenantBindingItem }
  | { kind: 'deleteTenantBinding'; binding: PlatformTenantBindingItem }
  | { kind: 'createServiceIntegration'; app: PlatformAppItem; tenantBindingId: string | null }
  | { kind: 'editServiceIntegration'; app: PlatformAppItem; integration: PlatformServiceIntegrationItem }
  | { kind: 'deleteServiceIntegration'; integration: PlatformServiceIntegrationItem }
  | { kind: 'createSecretRef'; app: PlatformAppItem; tenantBindingId: string | null }
  | { kind: 'editSecretRef'; app: PlatformAppItem; secretRef: PlatformSecretRefItem }
  | { kind: 'deleteSecretRef'; secretRef: PlatformSecretRefItem };

type TenantBindingOption = { id: string; label: string };

const APP_CODE_RE = /^[a-z0-9_-]+$/;

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'apps', label: 'Apps' },
  { id: 'apiKeys', label: 'API Keys' },
  { id: 'tenantBindings', label: 'Tenant Bindings' },
  { id: 'serviceIntegrations', label: 'Service Integrations' },
  { id: 'secretRefs', label: 'Secret Refs' },
];

const APP_AUTH_MODEL_OPTIONS = [
  { value: 'app_owned', label: 'app_owned' },
  { value: 'platform_sso', label: 'platform_sso' },
  { value: 'service_only', label: 'service_only' },
];

const APP_DEFAULT_CHANNEL_OPTIONS = [
  { value: 'whatsapp', label: 'whatsapp' },
  { value: 'web', label: 'web' },
  { value: 'voice', label: 'voice' },
  { value: 'internal', label: 'internal' },
  { value: 'none', label: 'none' },
];

const APP_STATUS_OPTIONS = [
  { value: 'active', label: 'active' },
  { value: 'planned', label: 'planned' },
  { value: 'disabled', label: 'disabled' },
];

const TENANT_ENV_OPTIONS = [
  { value: 'production', label: 'production' },
  { value: 'staging', label: 'staging' },
  { value: 'sandbox', label: 'sandbox' },
  { value: 'development', label: 'development' },
];

const TENANT_STATUS_OPTIONS = [
  { value: 'active', label: 'active' },
  { value: 'sandbox', label: 'sandbox' },
  { value: 'disabled', label: 'disabled' },
];

const SERVICE_NAME_OPTIONS = [
  'evolution',
  'dify',
  'qdrant',
  'chatwoot',
  'litellm',
  'langfuse',
  'vllm',
  'webhook',
  'other',
];

const SERVICE_STATUS_OPTIONS = [
  { value: 'linked', label: 'linked' },
  { value: 'planned', label: 'planned' },
  { value: 'disabled', label: 'disabled' },
  { value: 'error', label: 'error' },
];

const SECRET_PROVIDER_OPTIONS = [
  { value: 'infisical', label: 'infisical' },
  { value: 'coolify_env', label: 'coolify_env' },
  { value: 'manual_ref', label: 'manual_ref' },
];

const SECRET_SCOPE_OPTIONS = [
  { value: 'platform', label: 'platform' },
  { value: 'app', label: 'app' },
  { value: 'tenant', label: 'tenant' },
  { value: 'service', label: 'service' },
];

const SECRET_STATUS_OPTIONS = [
  { value: 'active', label: 'active' },
  { value: 'planned', label: 'planned' },
  { value: 'disabled', label: 'disabled' },
];

const RESOURCE_TYPE_SUGGESTIONS = [
  'whatsapp_instance',
  'dify_app',
  'dify_dataset',
  'qdrant_namespace',
  'chatwoot_account',
  'chatwoot_inbox',
  'litellm_key',
  'litellm_model_alias',
  'langfuse_project',
  'vllm_model_route',
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
    case 'sandbox':
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
    case 'web':
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
    throw new Error('Metadata must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Metadata must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function getAppMetadataFlags(metadata: Record<string, unknown>) {
  return {
    primary: metadata.primary === true,
    multiTenant: metadata.tenant_model === 'multi_tenant' || metadata.multi_tenant === true,
    usesSharedAiEcosystem: metadata.uses_shared_ai_ecosystem === true,
  };
}

function makeAppMetadata(flags: { primary: boolean; multiTenant: boolean; usesSharedAiEcosystem: boolean }, rawMetadata: string) {
  const metadata = parseMetadataInput(rawMetadata);
  if (flags.primary) metadata.primary = true;
  else delete metadata.primary;

  if (flags.multiTenant) metadata.tenant_model = 'multi_tenant';
  else if (metadata.tenant_model === 'multi_tenant') delete metadata.tenant_model;

  if (flags.usesSharedAiEcosystem) metadata.uses_shared_ai_ecosystem = true;
  else delete metadata.uses_shared_ai_ecosystem;

  return metadata;
}

function getApiErrorMessage(json: Record<string, unknown>, status: number): string {
  if (typeof json.message === 'string' && json.message.trim()) return json.message;
  if (typeof json.error === 'string' && json.error.trim()) return json.error;
  return `Request failed (${status})`;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
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
  children: React.ReactNode;
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
  const flags = getAppMetadataFlags(initial?.metadata ?? {});
  const [name, setName] = useState(initial?.name ?? '');
  const [appCode, setAppCode] = useState(initial?.appCode ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [authModel, setAuthModel] = useState(initial?.authModel ?? 'app_owned');
  const [defaultChannel, setDefaultChannel] = useState(initial?.defaultChannel ?? 'none');
  const [status, setStatus] = useState(initial?.status ?? 'active');
  const [primary, setPrimary] = useState(flags.primary);
  const [multiTenant, setMultiTenant] = useState(flags.multiTenant);
  const [usesSharedAiEcosystem, setUsesSharedAiEcosystem] = useState(flags.usesSharedAiEcosystem);
  const [metadataRaw, setMetadataRaw] = useState(metadataText(initial?.metadata ?? {}));
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (!name.trim()) {
      setLocalError('App name is required.');
      return;
    }
    if (mode === 'create' && !APP_CODE_RE.test(appCode.trim())) {
      setLocalError('App code must use lowercase letters, numbers, underscore, or hyphen only.');
      return;
    }

    try {
      const metadata = makeAppMetadata(
        { primary, multiTenant, usesSharedAiEcosystem },
        metadataRaw,
      );

      await onSubmit({
        name,
        appCode,
        description,
        authModel,
        defaultChannel,
        status,
        metadata,
      });
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Failed to prepare app payload.');
    }
  }

  return (
    <ModalShell
      title={mode === 'create' ? 'Create App' : `Edit ${initial?.name ?? 'App'}`}
      eyebrow="Writable Registry"
      subtitle="Registry only. No external app or service resources will be created here."
      onClose={onClose}
    >
      <form className="portal-aac-form" onSubmit={handleSubmit}>
        <div className="portal-aac-form-grid">
          <label className="portal-aac-field">
            <span>App Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="WAPI" />
          </label>
          <label className="portal-aac-field">
            <span>App Code</span>
            <input
              value={appCode}
              onChange={(event) => setAppCode(event.target.value.trim().toLowerCase())}
              placeholder="wapi"
              readOnly={mode === 'edit'}
            />
          </label>
          <label className="portal-aac-field portal-aac-field-wide">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="WhatsApp-first multi-tenant communication and AI product app"
            />
          </label>
          <label className="portal-aac-field">
            <span>Auth Model</span>
            <select value={authModel} onChange={(event) => setAuthModel(event.target.value)}>
              {APP_AUTH_MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="portal-aac-field">
            <span>Default Channel</span>
            <select value={defaultChannel} onChange={(event) => setDefaultChannel(event.target.value)}>
              {APP_DEFAULT_CHANNEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="portal-aac-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {APP_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="portal-aac-fieldset">
          <legend>Metadata Flags</legend>
          <div className="portal-aac-checkbox-grid">
            <label className="portal-aac-checkbox-pill">
              <input type="checkbox" checked={primary} onChange={() => setPrimary((value) => !value)} />
              <span>primary</span>
            </label>
            <label className="portal-aac-checkbox-pill">
              <input type="checkbox" checked={multiTenant} onChange={() => setMultiTenant((value) => !value)} />
              <span>multi_tenant</span>
            </label>
            <label className="portal-aac-checkbox-pill">
              <input
                type="checkbox"
                checked={usesSharedAiEcosystem}
                onChange={() => setUsesSharedAiEcosystem((value) => !value)}
              />
              <span>uses_shared_ai_ecosystem</span>
            </label>
          </div>
        </fieldset>

        <label className="portal-aac-field">
          <span>Advanced Metadata JSON</span>
          <textarea
            value={metadataRaw}
            onChange={(event) => setMetadataRaw(event.target.value)}
            rows={6}
            placeholder="{}"
          />
          <small className="portal-aac-help">No secret values belong in app metadata.</small>
        </label>

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
  const [appTenantKey, setAppTenantKey] = useState(initial?.appTenantKey ?? '');
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [environment, setEnvironment] = useState(initial?.environment ?? 'production');
  const [status, setStatus] = useState(initial?.status ?? 'active');
  const [metadataRaw, setMetadataRaw] = useState(metadataText(initial?.metadata ?? {}));
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    if (!appTenantKey.trim()) {
      setLocalError('Tenant key is required.');
      return;
    }

    try {
      await onSubmit({
        appId: app.id,
        appTenantKey,
        displayName,
        environment,
        status,
        metadata: parseMetadataInput(metadataRaw),
      });
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Failed to prepare tenant binding payload.');
    }
  }

  return (
    <ModalShell
      title={mode === 'create' ? 'Add Tenant Binding' : `Edit ${initial?.displayName || initial?.appTenantKey || 'Tenant Binding'}`}
      eyebrow="Writable Registry"
      subtitle="Registry only. This does not create or delete tenant data inside product apps."
      onClose={onClose}
    >
      <form className="portal-aac-form" onSubmit={handleSubmit}>
        <div className="portal-aac-form-grid">
          <label className="portal-aac-field portal-aac-field-wide">
            <span>App</span>
            <input value={`${app.name} (${app.appCode})`} readOnly />
          </label>
          <label className="portal-aac-field">
            <span>Tenant Key</span>
            <input value={appTenantKey} onChange={(event) => setAppTenantKey(event.target.value)} placeholder="tenant-acme" />
          </label>
          <label className="portal-aac-field">
            <span>Display Name</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Acme Production" />
          </label>
          <label className="portal-aac-field">
            <span>Environment</span>
            <select value={environment} onChange={(event) => setEnvironment(event.target.value)}>
              {TENANT_ENV_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="portal-aac-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {TENANT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="portal-aac-field">
          <span>Metadata JSON</span>
          <textarea value={metadataRaw} onChange={(event) => setMetadataRaw(event.target.value)} rows={5} placeholder="{}" />
          <small className="portal-aac-help">Registry metadata only. Do not place credentials or secret values here.</small>
        </label>

        {localError || error ? <div className="portal-aac-form-error">{localError || error}</div> : null}

        <div className="portal-aac-modal-actions">
          <button type="button" className="portal-aac-secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="portal-aac-primary-button" disabled={busy}>
            {busy ? 'Saving…' : mode === 'create' ? 'Add Tenant Binding' : 'Save Binding'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ServiceIntegrationFormModal({
  mode,
  app,
  tenantBindings,
  initial,
  defaultTenantBindingId,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  app: PlatformAppItem;
  tenantBindings: TenantBindingOption[];
  initial?: PlatformServiceIntegrationItem;
  defaultTenantBindingId?: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [tenantBindingId, setTenantBindingId] = useState(initial?.tenantBindingId ?? defaultTenantBindingId ?? '');
  const [serviceName, setServiceName] = useState(initial?.serviceName ?? 'evolution');
  const [resourceType, setResourceType] = useState(initial?.resourceType ?? '');
  const [resourceId, setResourceId] = useState(initial?.resourceId ?? '');
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [internalBaseUrl, setInternalBaseUrl] = useState(initial?.internalBaseUrl ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'linked');
  const [metadataRaw, setMetadataRaw] = useState(metadataText(initial?.metadata ?? {}));
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    if (!resourceType.trim() || !resourceId.trim()) {
      setLocalError('resource_type and resource_id are required.');
      return;
    }

    try {
      await onSubmit({
        appId: app.id,
        tenantBindingId: tenantBindingId || null,
        serviceName,
        resourceType,
        resourceId,
        displayName,
        baseUrl,
        internalBaseUrl,
        status,
        metadata: parseMetadataInput(metadataRaw),
      });
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Failed to prepare service integration payload.');
    }
  }

  return (
    <ModalShell
      title={mode === 'create' ? 'Add Service Link' : `Edit ${initial?.displayName || initial?.resourceId || 'Service Link'}`}
      eyebrow="Writable Registry"
      subtitle="Registry only. No external API call or downstream service mutation is performed here."
      onClose={onClose}
    >
      <form className="portal-aac-form" onSubmit={handleSubmit}>
        <div className="portal-aac-form-grid">
          <label className="portal-aac-field portal-aac-field-wide">
            <span>App</span>
            <input value={`${app.name} (${app.appCode})`} readOnly />
          </label>
          <label className="portal-aac-field">
            <span>Tenant Binding</span>
            <select value={tenantBindingId} onChange={(event) => setTenantBindingId(event.target.value)}>
              <option value="">App-level</option>
              {tenantBindings.map((binding) => (
                <option key={binding.id} value={binding.id}>{binding.label}</option>
              ))}
            </select>
          </label>
          <label className="portal-aac-field">
            <span>Service Name</span>
            <select value={serviceName} onChange={(event) => setServiceName(event.target.value)}>
              {SERVICE_NAME_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="portal-aac-field">
            <span>Resource Type</span>
            <input value={resourceType} onChange={(event) => setResourceType(event.target.value)} placeholder="dify_app" list="portal-aac-resource-types" />
          </label>
          <label className="portal-aac-field">
            <span>Resource ID</span>
            <input value={resourceId} onChange={(event) => setResourceId(event.target.value)} placeholder="app_123" />
          </label>
          <label className="portal-aac-field">
            <span>Display Name</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="WAPI Primary Dify App" />
          </label>
          <label className="portal-aac-field">
            <span>Base URL</span>
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://dify.getouch.co/apps" />
          </label>
          <label className="portal-aac-field">
            <span>Internal Base URL</span>
            <input value={internalBaseUrl} onChange={(event) => setInternalBaseUrl(event.target.value)} placeholder="http://docker-api-1:5001" />
          </label>
          <label className="portal-aac-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {SERVICE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <datalist id="portal-aac-resource-types">
          {RESOURCE_TYPE_SUGGESTIONS.map((item) => <option key={item} value={item} />)}
        </datalist>

        <label className="portal-aac-field">
          <span>Metadata JSON</span>
          <textarea value={metadataRaw} onChange={(event) => setMetadataRaw(event.target.value)} rows={5} placeholder="{}" />
          <small className="portal-aac-help">Registry only. This records links and URLs, not secrets.</small>
        </label>

        {localError || error ? <div className="portal-aac-form-error">{localError || error}</div> : null}

        <div className="portal-aac-modal-actions">
          <button type="button" className="portal-aac-secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="portal-aac-primary-button" disabled={busy}>
            {busy ? 'Saving…' : mode === 'create' ? 'Add Service Link' : 'Save Service Link'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function SecretRefFormModal({
  mode,
  app,
  tenantBindings,
  initial,
  defaultTenantBindingId,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  app: PlatformAppItem;
  tenantBindings: TenantBindingOption[];
  initial?: PlatformSecretRefItem;
  defaultTenantBindingId?: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [tenantBindingId, setTenantBindingId] = useState(initial?.tenantBindingId ?? defaultTenantBindingId ?? '');
  const [serviceName, setServiceName] = useState(initial?.serviceName ?? '');
  const [refProvider, setRefProvider] = useState(initial?.refProvider ?? 'infisical');
  const [refPath, setRefPath] = useState(initial?.refPath ?? '');
  const [refKey, setRefKey] = useState(initial?.refKey ?? '');
  const [scope, setScope] = useState(initial?.scope ?? 'app');
  const [status, setStatus] = useState(initial?.status ?? 'active');
  const [metadataRaw, setMetadataRaw] = useState(metadataText(initial?.metadata ?? {}));
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    if (!serviceName.trim() || !refPath.trim()) {
      setLocalError('service_name and ref_path are required.');
      return;
    }

    try {
      await onSubmit({
        appId: app.id,
        tenantBindingId: tenantBindingId || null,
        serviceName,
        refProvider,
        refPath,
        refKey,
        scope,
        status,
        metadata: parseMetadataInput(metadataRaw),
      });
    } catch (submitError) {
      setLocalError(submitError instanceof Error ? submitError.message : 'Failed to prepare secret ref payload.');
    }
  }

  return (
    <ModalShell
      title={mode === 'create' ? 'Add Secret Ref' : `Edit ${initial?.refPath || 'Secret Ref'}`}
      eyebrow="Writable Registry"
      subtitle="Store only the path/reference here. Secret values stay in Infisical or runtime env."
      onClose={onClose}
    >
      <form className="portal-aac-form" onSubmit={handleSubmit}>
        <div className="portal-aac-form-grid">
          <label className="portal-aac-field portal-aac-field-wide">
            <span>App</span>
            <input value={`${app.name} (${app.appCode})`} readOnly />
          </label>
          <label className="portal-aac-field">
            <span>Tenant Binding</span>
            <select value={tenantBindingId} onChange={(event) => setTenantBindingId(event.target.value)}>
              <option value="">App-level</option>
              {tenantBindings.map((binding) => (
                <option key={binding.id} value={binding.id}>{binding.label}</option>
              ))}
            </select>
          </label>
          <label className="portal-aac-field">
            <span>Service Name</span>
            <input value={serviceName} onChange={(event) => setServiceName(event.target.value)} placeholder="dify" />
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

        <label className="portal-aac-field">
          <span>Metadata JSON</span>
          <textarea value={metadataRaw} onChange={(event) => setMetadataRaw(event.target.value)} rows={5} placeholder="{}" />
          <small className="portal-aac-help">Store only the path/reference here. Secret values stay in Infisical or runtime env.</small>
        </label>

        {localError || error ? <div className="portal-aac-form-error">{localError || error}</div> : null}

        <div className="portal-aac-modal-actions">
          <button type="button" className="portal-aac-secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="portal-aac-primary-button" disabled={busy}>
            {busy ? 'Saving…' : mode === 'create' ? 'Add Secret Ref' : 'Save Secret Ref'}
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
      subtitle="This deletes registry mappings only. It does not delete external service resources or product app data."
      onClose={onClose}
    >
      <div className="portal-aac-danger-copy">
        <p><strong>App name:</strong> {app.name}</p>
        <p><strong>App code:</strong> {app.appCode}</p>
        <p><strong>Tenant bindings:</strong> {app.tenantBindingCount}</p>
        <p><strong>Service integrations:</strong> {app.serviceIntegrationCount}</p>
        <p><strong>Secret refs:</strong> {app.secretRefCount}</p>
        <p>This deletes registry mappings only. It does not delete external service resources or product app data.</p>
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

function SnapshotList({ title, items, formatter }: { title: string; items: string[]; formatter?: (value: string) => React.ReactNode }) {
  return (
    <div className="portal-aac-snapshot-list">
      <h4>{title}</h4>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{formatter ? formatter(item) : item}</li>
          ))}
        </ul>
      ) : (
        <p className="portal-aac-panel-copy">None linked yet.</p>
      )}
    </div>
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
        body="Add your first tenant binding to start mapping app-specific ownership and routing."
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
              </td>
              <td>{titleCase(binding.environment)}</td>
              <td>
                <span className={`portal-aac-status ${toneForStatus(binding.status)}`}>{titleCase(binding.status)}</span>
              </td>
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

function ServiceIntegrationsTable({
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
        body="Add a service link when you are ready to map shared AI or communication resources to this app or tenant."
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
            <th>Actions</th>
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
                <span className={`portal-aac-status ${toneForStatus(integration.status)}`}>{titleCase(integration.status)}</span>
              </td>
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

function SecretRefsTable({
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
        title="No secret refs registered"
        body="Add a secret ref path when you are ready to map Infisical or runtime env references for this app or tenant."
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
            <th>Actions</th>
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
  const previewApps = data && data.apps.length <= 1 ? PLANNED_PREVIEW_APPS : [];
  const tenantBindingOptions = useMemo<TenantBindingOption[]>(() => (
    (data?.tenantBindings ?? []).map((binding) => ({
      id: binding.id,
      label: binding.displayName || binding.appTenantKey,
    }))
  ), [data]);

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
    opts?: { appCode?: string | null; tenantBindingId?: string | null; closeModal?: boolean },
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

      const nextAppCode = opts?.appCode === undefined ? data?.selectedAppCode ?? null : opts.appCode;
      const nextTenantBindingId = opts?.tenantBindingId === undefined
        ? data?.selectedTenantBindingId ?? null
        : opts.tenantBindingId;

      if (opts?.closeModal !== false) closeModal();
      setFlash({ tone: 'success', text: successMessage });
      await loadSnapshot(nextAppCode, nextTenantBindingId);
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : 'Request failed';
      if (modal) setModalError(message);
      else setFlash({ tone: 'error', text: message });
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

      <FlashBanner flash={flash} />

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
                  <button type="button" className="portal-aac-primary-button" onClick={() => openModal({ kind: 'createApp' })}>
                    Create App
                  </button>
                </div>

                {data.apps.length === 0 ? (
                  <EmptyState
                    title="No app registered yet"
                    body="No app registered yet. Create your first app to start mapping shared AI services."
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
                        <button type="button" className="portal-aac-primary-button" onClick={() => openModal({ kind: 'createServiceIntegration', app: selectedApp, tenantBindingId: data.selectedTenantBindingId })}>
                          Add Service Link
                        </button>
                        <button type="button" className="portal-aac-primary-button" onClick={() => openModal({ kind: 'createSecretRef', app: selectedApp, tenantBindingId: data.selectedTenantBindingId })}>
                          Add Secret Ref
                        </button>
                      </div>
                    </div>

                    <div className="portal-aac-overview-grid">
                      <AppOverviewCard app={selectedApp} />

                      <section className="portal-aac-panel portal-aac-snapshot-card">
                        <div className="portal-aac-panel-head">
                          <div>
                            <div className="portal-aac-eyebrow">Selected Tenant Snapshot</div>
                            <h3>{selectedTenantBinding?.displayName || selectedTenantBinding?.appTenantKey || 'No tenant selected'}</h3>
                          </div>
                          <span className={`portal-aac-status ${toneForStatus(selectedTenantBinding?.status || 'planned')}`}>
                            {titleCase(selectedTenantBinding?.status || 'planned')}
                          </span>
                        </div>

                        {selectedTenantBinding ? (
                          <>
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
                            <div className="portal-aac-snapshot-grid">
                              <SnapshotList
                                title="Linked Service Resource IDs"
                                items={data.selectedTenantServiceIntegrations.map((integration) => `${integration.serviceName}: ${integration.resourceId}`)}
                              />
                              <SnapshotList
                                title="Secret Ref Paths"
                                items={data.selectedTenantSecretRefs.map((secretRef) => secretRef.refPath)}
                                formatter={(value) => <code className="portal-aac-secret-path">{value}</code>}
                              />
                            </div>
                          </>
                        ) : (
                          <EmptyState
                            title="No tenant selected"
                            body="Select a tenant binding to review linked service resource IDs and secret ref paths for that registry scope."
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
                          onEdit={(binding) => openModal({ kind: 'editTenantBinding', app: selectedApp, binding })}
                          onDisable={(binding) => void disableRecord(`/api/admin/platform-app-access/tenant-bindings/${binding.id}`, `${binding.displayName || binding.appTenantKey} binding`, data.selectedAppCode, binding.id)}
                          onDelete={(binding) => openModal({ kind: 'deleteTenantBinding', binding })}
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
                        <ServiceIntegrationsTable
                          rows={data.serviceIntegrations}
                          onEdit={(integration) => openModal({ kind: 'editServiceIntegration', app: selectedApp, integration })}
                          onDisable={(integration) => void disableRecord(`/api/admin/platform-app-access/service-integrations/${integration.id}`, `${integration.resourceId} integration`, data.selectedAppCode, data.selectedTenantBindingId)}
                          onDelete={(integration) => openModal({ kind: 'deleteServiceIntegration', integration })}
                        />
                      </section>

                      <section className="portal-aac-panel">
                        <div className="portal-aac-panel-head">
                          <div>
                            <div className="portal-aac-eyebrow">Secret References</div>
                            <h3>Ref paths only</h3>
                          </div>
                          <span className="portal-aac-count-chip">{data.secretRefs.length}</span>
                        </div>
                        <SecretRefsTable
                          rows={data.secretRefs}
                          onEdit={(secretRef) => openModal({ kind: 'editSecretRef', app: selectedApp, secretRef })}
                          onDisable={(secretRef) => void disableRecord(`/api/admin/platform-app-access/secret-refs/${secretRef.id}`, `${secretRef.refPath} secret ref`, data.selectedAppCode, data.selectedTenantBindingId)}
                          onDelete={(secretRef) => openModal({ kind: 'deleteSecretRef', secretRef })}
                        />
                      </section>
                    </div>
                  </>
                ) : (
                  <section className="portal-aac-panel">
                    <EmptyState
                      title="No app registered yet"
                      body="No app registered yet. Create your first app to start mapping shared AI services."
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
              <TenantBindingsTable
                rows={data.tenantBindings}
                selectedId={data.selectedTenantBindingId}
                onSelect={(bindingId) => void loadSnapshot(data.selectedAppCode, bindingId)}
                onEdit={(binding) => selectedApp && openModal({ kind: 'editTenantBinding', app: selectedApp, binding })}
                onDisable={(binding) => void disableRecord(`/api/admin/platform-app-access/tenant-bindings/${binding.id}`, `${binding.displayName || binding.appTenantKey} binding`, data.selectedAppCode, binding.id)}
                onDelete={(binding) => openModal({ kind: 'deleteTenantBinding', binding })}
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
                <button
                  type="button"
                  className="portal-aac-primary-button"
                  disabled={!selectedApp}
                  onClick={() => selectedApp && openModal({ kind: 'createServiceIntegration', app: selectedApp, tenantBindingId: data.selectedTenantBindingId })}
                >
                  Add Service Link
                </button>
              </div>
              <ServiceIntegrationsTable
                rows={data.serviceIntegrations}
                onEdit={(integration) => selectedApp && openModal({ kind: 'editServiceIntegration', app: selectedApp, integration })}
                onDisable={(integration) => void disableRecord(`/api/admin/platform-app-access/service-integrations/${integration.id}`, `${integration.resourceId} integration`, data.selectedAppCode, data.selectedTenantBindingId)}
                onDelete={(integration) => openModal({ kind: 'deleteServiceIntegration', integration })}
              />
            </section>
          ) : null}

          {tab === 'secretRefs' ? (
            <section className="portal-aac-panel">
              <div className="portal-aac-panel-head">
                <div>
                  <div className="portal-aac-eyebrow">Secret References</div>
                  <h3>{selectedApp?.name || 'App'} secret registry</h3>
                </div>
                <button
                  type="button"
                  className="portal-aac-primary-button"
                  disabled={!selectedApp}
                  onClick={() => selectedApp && openModal({ kind: 'createSecretRef', app: selectedApp, tenantBindingId: data.selectedTenantBindingId })}
                >
                  Add Secret Ref
                </button>
              </div>
              <SecretRefsTable
                rows={data.secretRefs}
                onEdit={(secretRef) => selectedApp && openModal({ kind: 'editSecretRef', app: selectedApp, secretRef })}
                onDisable={(secretRef) => void disableRecord(`/api/admin/platform-app-access/secret-refs/${secretRef.id}`, `${secretRef.refPath} secret ref`, data.selectedAppCode, data.selectedTenantBindingId)}
                onDelete={(secretRef) => openModal({ kind: 'deleteSecretRef', secretRef })}
              />
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
          onSubmit={(payload) => mutateRegistry('/api/admin/platform-app-access/apps', 'POST', payload, 'Registry app created.', { appCode: typeof payload.appCode === 'string' ? payload.appCode : null })}
        />
      ) : null}

      {modal?.kind === 'editApp' ? (
        <AppFormModal
          mode="edit"
          initial={modal.app}
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onSubmit={(payload) => mutateRegistry(`/api/admin/platform-app-access/apps/${modal.app.id}`, 'PATCH', payload, 'Registry app updated.', { appCode: modal.app.appCode, tenantBindingId: data?.selectedTenantBindingId ?? null })}
        />
      ) : null}

      {modal?.kind === 'deleteApp' ? (
        <AppDeleteModal
          app={modal.app}
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onDelete={(appCodeConfirmation) => mutateRegistry(`/api/admin/platform-app-access/apps/${modal.app.id}`, 'DELETE', { appCodeConfirmation }, `${modal.app.name} registry app deleted.`, { appCode: null, tenantBindingId: null })}
        />
      ) : null}

      {modal?.kind === 'createTenantBinding' ? (
        <TenantBindingFormModal
          mode="create"
          app={modal.app}
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onSubmit={(payload) => mutateRegistry('/api/admin/platform-app-access/tenant-bindings', 'POST', payload, 'Tenant binding added.', { appCode: modal.app.appCode, tenantBindingId: null })}
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
          onSubmit={(payload) => mutateRegistry(`/api/admin/platform-app-access/tenant-bindings/${modal.binding.id}`, 'PATCH', payload, 'Tenant binding updated.', { appCode: modal.app.appCode, tenantBindingId: modal.binding.id })}
        />
      ) : null}

      {modal?.kind === 'deleteTenantBinding' ? (
        <DeleteRecordModal
          title={`Delete ${modal.binding.displayName || modal.binding.appTenantKey}`}
          subtitle="This removes the registry binding only. No product app tenant data or external service resource will be deleted."
          warning="This deletes registry mappings only. It does not delete external service resources or product app data."
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onDelete={() => mutateRegistry(`/api/admin/platform-app-access/tenant-bindings/${modal.binding.id}`, 'DELETE', {}, 'Tenant binding deleted.', { appCode: data?.selectedAppCode ?? null, tenantBindingId: null })}
        />
      ) : null}

      {modal?.kind === 'createServiceIntegration' ? (
        <ServiceIntegrationFormModal
          mode="create"
          app={modal.app}
          tenantBindings={tenantBindingOptions}
          defaultTenantBindingId={modal.tenantBindingId}
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onSubmit={(payload) => mutateRegistry('/api/admin/platform-app-access/service-integrations', 'POST', payload, 'Service integration added.', { appCode: modal.app.appCode, tenantBindingId: data?.selectedTenantBindingId ?? null })}
        />
      ) : null}

      {modal?.kind === 'editServiceIntegration' ? (
        <ServiceIntegrationFormModal
          mode="edit"
          app={modal.app}
          tenantBindings={tenantBindingOptions}
          initial={modal.integration}
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onSubmit={(payload) => mutateRegistry(`/api/admin/platform-app-access/service-integrations/${modal.integration.id}`, 'PATCH', payload, 'Service integration updated.', { appCode: modal.app.appCode, tenantBindingId: data?.selectedTenantBindingId ?? null })}
        />
      ) : null}

      {modal?.kind === 'deleteServiceIntegration' ? (
        <DeleteRecordModal
          title={`Delete ${modal.integration.resourceId}`}
          subtitle="This removes the registry service link only. No downstream Dify, Chatwoot, Evolution, LiteLLM, vLLM, or other external resource will be deleted."
          warning="This registry delete does not call external APIs or remove downstream resources."
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onDelete={() => mutateRegistry(`/api/admin/platform-app-access/service-integrations/${modal.integration.id}`, 'DELETE', {}, 'Service integration deleted.', { appCode: data?.selectedAppCode ?? null, tenantBindingId: data?.selectedTenantBindingId ?? null })}
        />
      ) : null}

      {modal?.kind === 'createSecretRef' ? (
        <SecretRefFormModal
          mode="create"
          app={modal.app}
          tenantBindings={tenantBindingOptions}
          defaultTenantBindingId={modal.tenantBindingId}
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onSubmit={(payload) => mutateRegistry('/api/admin/platform-app-access/secret-refs', 'POST', payload, 'Secret ref added.', { appCode: modal.app.appCode, tenantBindingId: data?.selectedTenantBindingId ?? null })}
        />
      ) : null}

      {modal?.kind === 'editSecretRef' ? (
        <SecretRefFormModal
          mode="edit"
          app={modal.app}
          tenantBindings={tenantBindingOptions}
          initial={modal.secretRef}
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onSubmit={(payload) => mutateRegistry(`/api/admin/platform-app-access/secret-refs/${modal.secretRef.id}`, 'PATCH', payload, 'Secret ref updated.', { appCode: modal.app.appCode, tenantBindingId: data?.selectedTenantBindingId ?? null })}
        />
      ) : null}

      {modal?.kind === 'deleteSecretRef' ? (
        <DeleteRecordModal
          title={`Delete ${modal.secretRef.refPath}`}
          subtitle="This removes the registry secret reference only. No Infisical, Coolify env, or runtime secret value is deleted."
          warning="Only the portal registry row is removed. Secret values stay in Infisical or runtime env."
          busy={mutating}
          error={modalError}
          onClose={closeModal}
          onDelete={() => mutateRegistry(`/api/admin/platform-app-access/secret-refs/${modal.secretRef.id}`, 'DELETE', {}, 'Secret ref deleted.', { appCode: data?.selectedAppCode ?? null, tenantBindingId: data?.selectedTenantBindingId ?? null })}
        />
      ) : null}
    </div>
  );
}