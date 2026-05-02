export const APP_ENVIRONMENT_VALUES = ['production', 'staging', 'development'] as const;
export const APP_STATUS_VALUES = ['active', 'planned', 'disabled'] as const;
export const TENANT_ENV_VALUES = ['production', 'staging', 'development'] as const;
export const TENANT_STATUS_VALUES = ['active', 'disabled', 'sandbox'] as const;
export const CAPABILITY_STATUS_VALUES = ['available', 'disabled', 'error'] as const;
export const SERVICE_LINK_STATUS_VALUES = ['linked', 'disabled', 'error', 'planned'] as const;
export const SECRET_PROVIDER_VALUES = ['infisical', 'coolify_env', 'manual_ref'] as const;
export const SECRET_SCOPE_VALUES = ['platform', 'app', 'tenant', 'service'] as const;
export const SECRET_STATUS_VALUES = ['active', 'disabled', 'planned'] as const;

export const DEFAULT_ECOSYSTEM_SERVICES = [
  {
    serviceName: 'evolution',
    displayName: 'Evolution',
    resourceTypes: ['whatsapp_instance', 'webhook_endpoint'],
  },
  {
    serviceName: 'baileys',
    displayName: 'Baileys',
    resourceTypes: ['whatsapp_session', 'webhook_endpoint'],
  },
  {
    serviceName: 'dify',
    displayName: 'Dify',
    resourceTypes: ['dify_app', 'dify_workflow', 'dify_dataset'],
  },
  {
    serviceName: 'litellm',
    displayName: 'LiteLLM',
    resourceTypes: ['litellm_key', 'litellm_model_alias'],
  },
  {
    serviceName: 'vllm',
    displayName: 'vLLM',
    resourceTypes: ['vllm_model_route', 'vllm_endpoint'],
  },
  {
    serviceName: 'qdrant',
    displayName: 'Qdrant',
    resourceTypes: ['qdrant_collection', 'qdrant_namespace'],
  },
  {
    serviceName: 'chatwoot',
    displayName: 'Chatwoot',
    resourceTypes: ['chatwoot_account', 'chatwoot_inbox', 'chatwoot_conversation'],
  },
  {
    serviceName: 'langfuse',
    displayName: 'Langfuse',
    resourceTypes: ['langfuse_project', 'langfuse_trace_key'],
  },
  {
    serviceName: 'webhooks',
    displayName: 'Webhooks',
    resourceTypes: ['webhook_endpoint', 'webhook_signing_secret_ref'],
  },
] as const;

const SERVICE_NAME_ALIASES: Record<string, string> = {
  webhook: 'webhooks',
};

const SERVICE_MAP = new Map<string, (typeof DEFAULT_ECOSYSTEM_SERVICES)[number]>(
  DEFAULT_ECOSYSTEM_SERVICES.map((service) => [service.serviceName, service]),
);

export type AppEnvironment = (typeof APP_ENVIRONMENT_VALUES)[number];
export type AppStatus = (typeof APP_STATUS_VALUES)[number];
export type TenantEnvironment = (typeof TENANT_ENV_VALUES)[number];
export type TenantStatus = (typeof TENANT_STATUS_VALUES)[number];
export type CapabilityStatus = (typeof CAPABILITY_STATUS_VALUES)[number];
export type ServiceLinkStatus = (typeof SERVICE_LINK_STATUS_VALUES)[number];
export type SecretProvider = (typeof SECRET_PROVIDER_VALUES)[number];
export type SecretScope = (typeof SECRET_SCOPE_VALUES)[number];
export type SecretStatus = (typeof SECRET_STATUS_VALUES)[number];
export type EcosystemServiceName = (typeof DEFAULT_ECOSYSTEM_SERVICES)[number]['serviceName'];

export function normalizeServiceName(value: string): string {
  const normalized = value.trim().toLowerCase();
  return SERVICE_NAME_ALIASES[normalized] ?? normalized;
}

export function getServiceDefinition(serviceName: string) {
  return SERVICE_MAP.get(normalizeServiceName(serviceName)) ?? null;
}

export function getServiceDisplayName(serviceName: string): string {
  return getServiceDefinition(serviceName)?.displayName
    ?? titleCaseFromSlug(normalizeServiceName(serviceName));
}

export function getResourceTypeSuggestions(serviceName: string): string[] {
  return [...(getServiceDefinition(serviceName)?.resourceTypes ?? [])];
}

export function titleCaseFromSlug(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

export function slugifyIdentifier(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return slug || 'app';
}