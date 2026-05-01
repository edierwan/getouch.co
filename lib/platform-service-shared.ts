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
  publicEdgeCode: number | null;
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
    publicEdgeCode: number | null;
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
  missingTone?: PlatformTone;
  missingDetail?: string;
  installedDetail?: string;
  onlineDetail?: string;
  publicOnlyDetail?: string;
  degradedDetail?: string;
};

function hasProbeFailureNotes(notes: string[]) {
  return notes.some((note) => /(timed out|probe failed|ssh exited|unable to load|unavailable)/i.test(note));
}

function createPendingStatus(detail?: string): PlatformDisplayStatus {
  return {
    label: 'STATUS PENDING',
    tone: 'info',
    detail: detail || 'The latest shared runtime probe did not complete, so the dashboard is waiting for a fresh service snapshot.',
  };
}

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

function hasRouteCode(code: number | null | undefined): code is number {
  return typeof code === 'number' && Number.isFinite(code) && code > 0;
}

function isReachableRoute(code: number | null | undefined) {
  return hasRouteCode(code) && ((code >= 200 && code < 400) || code === 401 || code === 403 || code === 405);
}

function resolvePublicRouteCode(service: PlatformServiceProbe) {
  return hasRouteCode(service.publicEdgeCode) ? service.publicEdgeCode : service.publicOriginCode;
}

export function describeServiceProbe(
  service: PlatformServiceProbe,
  options: DescribeProbeOptions = {},
): PlatformDisplayStatus {
  const container = summarizeContainer(service);
  const publicLive = isReachableRoute(resolvePublicRouteCode(service));
  const edgeFailed = hasRouteCode(service.publicEdgeCode) && !isReachableRoute(service.publicEdgeCode);
  const probePending = hasProbeFailureNotes(service.notes);

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
    if (options.requirePublicRoute && edgeFailed) {
      return {
        label: 'DEGRADED',
        tone: 'warning',
        detail: options.degradedDetail || 'Runtime is healthy at the origin, but the public hostname is not serving the expected route yet.',
      };
    }

    return {
      label: 'INSTALLED',
      tone: 'active',
      detail: options.installedDetail || 'Runtime exists, but the public route validation is still pending.',
    };
  }

  if (probePending) {
    return createPendingStatus();
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
    tone: options.missingTone || 'info',
    detail: options.missingDetail || 'No runtime detected.',
  };
}

export function getCatalogService(snapshot: PlatformServicesSnapshot, key: string): PlatformServiceProbe {
  return snapshot.catalog[key] || {
    found: false,
    containers: [],
    publicUrl: null,
    publicOriginCode: null,
    publicEdgeCode: null,
    internalUrl: null,
    notes: [],
  };
}

export function getServiceProbe(snapshot: PlatformServicesSnapshot, key: string): PlatformServiceProbe {
  if (key === 'n8n') return snapshot.n8n;
  if (key === 'litellm') return snapshot.litellm;
  if (key === 'langfuse') return snapshot.langfuse;
  if (key === 'clickhouse') return snapshot.clickhouse;
  return getCatalogService(snapshot, key);
}

export function describeN8n(snapshot: PlatformServicesSnapshot): PlatformDisplayStatus {
  const container = summarizeContainer(snapshot.n8n);
  const publicLive = isReachableRoute(resolvePublicRouteCode(snapshot.n8n));
  const probePending = hasProbeFailureNotes(snapshot.n8n.notes);
  if (publicLive) {
    return { label: 'ONLINE', tone: isContainerOnline(container) ? 'healthy' : 'active', detail: 'Workflow automation runtime is online. Metrics are still awaiting API integration.' };
  }
  if (isContainerOnline(container)) {
    return { label: 'INSTALLED', tone: 'active', detail: 'Container is healthy. Public route verification is still pending.' };
  }
  if (snapshot.n8n.found) {
    return { label: 'DEGRADED', tone: 'warning', detail: 'Container exists but runtime health is not healthy.' };
  }
  if (probePending) {
    return createPendingStatus('Workflow automation status is pending because the shared runtime probe timed out.');
  }
  return { label: 'NOT INSTALLED', tone: 'info', detail: 'No n8n runtime detected.' };
}

export function describeLiteLlm(snapshot: PlatformServicesSnapshot): PlatformDisplayStatus {
  const container = summarizeContainer(snapshot.litellm);
  const publicLive = isReachableRoute(resolvePublicRouteCode(snapshot.litellm));
  const probePending = hasProbeFailureNotes(snapshot.litellm.notes);
  if (publicLive) {
    return { label: 'ONLINE', tone: 'healthy', detail: 'LiteLLM gateway runtime is healthy. Provider configuration still needs model credentials.' };
  }
  if (isContainerOnline(container) && hasRouteCode(snapshot.litellm.publicEdgeCode) && !isReachableRoute(snapshot.litellm.publicEdgeCode)) {
    return { label: 'DEGRADED', tone: 'warning', detail: 'LiteLLM is healthy at the origin, but the public hostname is still not serving the gateway route.' };
  }
  if (isContainerOnline(container)) {
    return { label: 'INSTALLED', tone: 'active', detail: 'Runtime exists, but public route validation is still pending.' };
  }
  if (snapshot.litellm.found) {
    return { label: 'DEGRADED', tone: 'warning', detail: 'LiteLLM containers exist but are not healthy.' };
  }
  if (probePending) {
    return createPendingStatus('LiteLLM status is pending because the shared runtime probe timed out.');
  }
  return { label: 'NOT INSTALLED', tone: 'info', detail: 'Canonical litellm.getouch.co endpoint is reserved, but no live LiteLLM runtime is detected yet.' };
}

export function describeLangfuse(snapshot: PlatformServicesSnapshot): PlatformDisplayStatus {
  const container = summarizeContainer(snapshot.langfuse);
  const publicLive = isReachableRoute(resolvePublicRouteCode(snapshot.langfuse));
  const probePending = hasProbeFailureNotes(snapshot.langfuse.notes);
  if (publicLive) {
    return { label: 'ONLINE', tone: 'healthy', detail: 'Observability UI is live. Admin onboarding is still required before tenant traffic.' };
  }
  if (isContainerOnline(container)) {
    return { label: 'INSTALLED', tone: 'active', detail: 'Langfuse runtime exists, but the public route is not confirmed healthy.' };
  }
  if (snapshot.langfuse.found) {
    return { label: 'DEGRADED', tone: 'warning', detail: 'Langfuse containers exist but are not healthy.' };
  }
  if (probePending) {
    return createPendingStatus('Langfuse status is pending because the shared runtime probe timed out.');
  }
  return { label: 'NOT INSTALLED', tone: 'info', detail: 'No Langfuse runtime detected. Public route is not yet served by the origin.' };
}

export function describeClickHouse(snapshot: PlatformServicesSnapshot): PlatformDisplayStatus {
  const container = summarizeContainer(snapshot.clickhouse);
  const probePending = hasProbeFailureNotes(snapshot.clickhouse.notes);
  if (isContainerOnline(container)) {
    return { label: 'HEALTHY', tone: 'healthy', detail: 'ClickHouse analytics store is healthy and remains internal-only.' };
  }
  if (snapshot.clickhouse.found) {
    return { label: 'DEGRADED', tone: 'warning', detail: 'ClickHouse container exists but is not healthy.' };
  }
  if (probePending) {
    return createPendingStatus('ClickHouse status is pending because the shared runtime probe timed out.');
  }
  return { label: 'NOT INSTALLED', tone: 'info', detail: 'No ClickHouse runtime detected yet.' };
}

export function describeRedis(snapshot: PlatformServicesSnapshot): PlatformDisplayStatus {
  const probePending = hasProbeFailureNotes(snapshot.redis.notes);
  if (isContainerOnline(snapshot.redis.primary)) {
    return { label: 'HEALTHY', tone: 'healthy', detail: 'Internal Redis runtime is healthy.' };
  }
  if (snapshot.redis.found) {
    return { label: 'INSTALLED', tone: 'active', detail: 'Redis exists, but health telemetry is limited.' };
  }
  if (probePending) {
    return createPendingStatus('Redis status is pending because the shared runtime probe timed out.');
  }
  return { label: 'MONITORING PENDING', tone: 'info', detail: 'No Redis runtime was detected by the shared platform probe.' };
}