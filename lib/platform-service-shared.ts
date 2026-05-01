export type PlatformTone = 'healthy' | 'active' | 'warning' | 'critical' | 'info';
export type PlatformRuntimeSource = 'coolify' | 'docker-compose' | 'standalone' | 'not-installed' | 'unknown';

export type PlatformContainerProbe = {
  name: string;
  image: string | null;
  status: string | null;
  health: string | null;
  runtimeSource: PlatformRuntimeSource;
  composeProject: string | null;
  composeService: string | null;
  networks: string[];
};

export type PlatformServiceProbe = {
  found: boolean;
  containers: PlatformContainerProbe[];
  publicUrl: string | null;
  publicOriginCode: number | null;
  internalUrl: string | null;
  notes: string[];
};

export type PlatformServicesSnapshot = {
  checkedAt: string;
  catalog: Record<string, PlatformServiceProbe>;
  n8n: PlatformServiceProbe & {
    basicAuthEnabled: boolean;
    webhookUrl: string | null;
  };
  litellm: PlatformServiceProbe;
  langfuse: PlatformServiceProbe;
  clickhouse: PlatformServiceProbe;
  redis: {
    found: boolean;
    primary: PlatformContainerProbe | null;
    containers: PlatformContainerProbe[];
    publicOriginCode: number | null;
    notes: string[];
  };
};

export type PlatformDisplayStatus = {
  label: string;
  tone: PlatformTone;
  detail: string;
};

export type DescribeProbeOptions = {
  requirePublicRoute?: boolean;
  missingLabel?: string;
  missingDetail?: string;
  installedDetail?: string;
  onlineDetail?: string;
  publicOnlyDetail?: string;
  degradedDetail?: string;
};

export function isContainerOnline(container: PlatformContainerProbe | null | undefined) {
  if (!container) return false;
  return container.status === 'running' && (!container.health || container.health === 'healthy');
}

export function resolveRuntimeSource(container: PlatformContainerProbe | null | undefined) {
  return container?.runtimeSource || 'not-installed';
}

export function formatRuntimeSource(source: PlatformRuntimeSource) {
  if (source === 'docker-compose') return 'Docker Compose';
  if (source === 'coolify') return 'Coolify';
  if (source === 'standalone') return 'Standalone';
  if (source === 'not-installed') return 'Not installed';
  return 'Unknown';
}

function summarizeContainer(service: PlatformServiceProbe) {
  return service.containers[0] || null;
}

export function describeServiceProbe(
  service: PlatformServiceProbe,
  options: DescribeProbeOptions = {},
): PlatformDisplayStatus {
  const container = summarizeContainer(service);
  const publicLive = typeof service.publicOriginCode === 'number' && service.publicOriginCode >= 200 && service.publicOriginCode < 400;

  if (isContainerOnline(container) && (publicLive || !options.requirePublicRoute)) {
    return {
      label: 'ONLINE',
      tone: 'healthy',
      detail: options.onlineDetail || 'Runtime and public route are healthy.',
    };
  }

  if (!container && publicLive) {
    return {
      label: 'ONLINE',
      tone: 'active',
      detail: options.publicOnlyDetail || 'Public route is live through a shared runtime.',
    };
  }

  if (isContainerOnline(container)) {
    return {
      label: 'INSTALLED',
      tone: 'active',
      detail: options.installedDetail || 'Runtime exists, but the public route validation is still pending.',
    };
  }

  if (service.found) {
    return {
      label: 'DEGRADED',
      tone: 'warning',
      detail: options.degradedDetail || 'Runtime or origin routing exists, but health checks are not passing.',
    };
  }

  return {
    label: options.missingLabel || 'NOT INSTALLED',
    tone: 'info',
    detail: options.missingDetail || 'No runtime detected.',
  };
}

export function getCatalogService(snapshot: PlatformServicesSnapshot, key: string): PlatformServiceProbe {
  return snapshot.catalog[key] || {
    found: false,
    containers: [],
    publicUrl: null,
    publicOriginCode: null,
    internalUrl: null,
    notes: [],
  };
}

export function describeN8n(snapshot: PlatformServicesSnapshot): PlatformDisplayStatus {
  const container = summarizeContainer(snapshot.n8n);
  if (isContainerOnline(container) && snapshot.n8n.publicOriginCode === 200) {
    return { label: 'ONLINE', tone: 'healthy', detail: 'Workflow automation route is live at origin.' };
  }
  if (isContainerOnline(container)) {
    return { label: 'INSTALLED', tone: 'active', detail: 'Container is healthy. Public route verification is still pending.' };
  }
  if (snapshot.n8n.found) {
    return { label: 'DEGRADED', tone: 'warning', detail: 'Container exists but runtime health is not healthy.' };
  }
  return { label: 'NOT INSTALLED', tone: 'info', detail: 'No n8n runtime detected.' };
}

export function describeLiteLlm(snapshot: PlatformServicesSnapshot): PlatformDisplayStatus {
  const container = summarizeContainer(snapshot.litellm);
  if (isContainerOnline(container) && snapshot.litellm.publicOriginCode && snapshot.litellm.publicOriginCode < 400) {
    return { label: 'ONLINE', tone: 'healthy', detail: 'LiteLLM gateway runtime is healthy.' };
  }
  if (isContainerOnline(container)) {
    return { label: 'INSTALLED', tone: 'active', detail: 'Runtime exists, but public route validation is pending.' };
  }
  if (snapshot.litellm.found) {
    return { label: 'DEGRADED', tone: 'warning', detail: 'LiteLLM containers exist but are not healthy.' };
  }
  return { label: 'PLANNED', tone: 'info', detail: 'Canonical litellm.getouch.co endpoint is reserved, but no live LiteLLM runtime is detected yet.' };
}

export function describeLangfuse(snapshot: PlatformServicesSnapshot): PlatformDisplayStatus {
  const container = summarizeContainer(snapshot.langfuse);
  if (isContainerOnline(container) && snapshot.langfuse.publicOriginCode === 200) {
    return { label: 'ONLINE', tone: 'healthy', detail: 'Observability UI is live.' };
  }
  if (isContainerOnline(container)) {
    return { label: 'INSTALLED', tone: 'active', detail: 'Langfuse runtime exists, but the public route is not confirmed healthy.' };
  }
  if (snapshot.langfuse.found) {
    return { label: 'DEGRADED', tone: 'warning', detail: 'Langfuse containers exist but are not healthy.' };
  }
  return { label: 'PLANNED', tone: 'info', detail: 'No Langfuse runtime detected. Public route is not yet served by the origin.' };
}

export function describeClickHouse(snapshot: PlatformServicesSnapshot): PlatformDisplayStatus {
  const container = summarizeContainer(snapshot.clickhouse);
  if (isContainerOnline(container)) {
    return { label: 'ONLINE', tone: 'healthy', detail: 'ClickHouse analytics store is online.' };
  }
  if (snapshot.clickhouse.found) {
    return { label: 'DEGRADED', tone: 'warning', detail: 'ClickHouse container exists but is not healthy.' };
  }
  return { label: 'PLANNED', tone: 'info', detail: 'No ClickHouse runtime detected yet.' };
}

export function describeRedis(snapshot: PlatformServicesSnapshot): PlatformDisplayStatus {
  if (isContainerOnline(snapshot.redis.primary)) {
    return { label: 'ONLINE', tone: 'healthy', detail: 'Internal Redis runtime is healthy.' };
  }
  if (snapshot.redis.found) {
    return { label: 'INSTALLED', tone: 'active', detail: 'Redis exists, but health telemetry is limited.' };
  }
  return { label: 'MONITORING PENDING', tone: 'info', detail: 'No Redis runtime was detected by the shared platform probe.' };
}