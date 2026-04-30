import { NextRequest, NextResponse } from 'next/server';
import {
  createApiKey,
  getApiKeyPepperStatus,
  getGatewayServices,
  listApiKeys,
  recordUsage,
  validateApiKey,
} from './api-keys';
import {
  createMcpClient,
  getMcpDbStatus,
  getMcpPortalData,
  getMcpTenantMapping,
  listMcpSettings,
  listRuntimeMcpTools,
  recordMcpActivity,
  recordMcpToolCall,
  registerMcpServer,
  syncMcpAccessKeyCache,
  touchMcpUsage,
  updateMcpServerHeartbeat,
  type McpAccessKeyRow,
  type McpActivityRow,
  type McpClientRow,
  type McpDbStatus,
  type McpPortalData,
  type McpServerRow,
  type McpSettingRow,
  type McpTenantRow,
  type McpToolCallRow,
  type McpToolRow,
} from './mcp-db';

const MCP_PROTOCOL_VERSION = '2025-03-26';
const MCP_SERVER_VERSION = '2026.04.30';
const MCP_PUBLIC_BASE_URL = process.env.MCP_PUBLIC_BASE_URL || 'https://mcp.getouch.co';
const MCP_ENDPOINT_PATH = '/mcp';
const MCP_ENDPOINT_URL = `${MCP_PUBLIC_BASE_URL}${MCP_ENDPOINT_PATH}`;
const PORTAL_ADMIN_URL = process.env.PORTAL_ADMIN_URL || 'https://portal.getouch.co';
const MCP_ADMIN_URL = `${PORTAL_ADMIN_URL}/service-endpoints/mcp`;

const DEFAULT_MCP_SCOPES = [
  'mcp:connect',
  'mcp:tools:list',
  'mcp:tools:call',
  'mcp:resources:read',
] as const;

const ALLOWED_MCP_SCOPES = [...DEFAULT_MCP_SCOPES, 'mcp:admin'] as const;

type DashboardTone = 'healthy' | 'warning';
type HealthStatus = 'healthy' | 'warning' | 'degraded';
type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcError;
}

interface ServiceDirectoryEntry {
  id: string;
  name: string;
  category: 'ai' | 'messaging' | 'operations';
  status: string;
  publicUrl: string;
  adminUrl?: string;
  description: string;
}

export interface McpHealthCheck {
  label: string;
  status: HealthStatus;
  detail: string;
}

export interface McpHealthSnapshot {
  checkedAt: string;
  ok: boolean;
  tests: McpHealthCheck[];
}

export interface McpDashboardStatus {
  checkedAt: string;
  summary: {
    statusLabel: string;
    statusTone: DashboardTone;
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
  health: McpHealthSnapshot;
  database: McpDbStatus;
  quickActions: Array<{ label: string; href: string; external?: boolean }>;
  servers: McpServerRow[];
  tools: McpToolRow[];
  clients: McpClientRow[];
  accessKeys: McpAccessKeyRow[];
  activity: McpActivityRow[];
  toolCalls: McpToolCallRow[];
  tenants: McpTenantRow[];
  settings: McpSettingRow[];
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

export interface McpPublicStatus {
  checkedAt: string;
  summary: {
    statusLabel: string;
    statusTone: DashboardTone;
    endpointUrl: string;
    transport: string;
    authMode: string;
    enabledTools: number;
    healthyServers: number;
  };
  health: McpHealthSnapshot;
  capabilities: Array<{ title: string; detail: string }>;
  compatibility: Array<{ label: string; status: string; detail: string }>;
  snippets: {
    curl: string;
    javascript: string;
  };
}

function getAllowedOrigins() {
  const configured = process.env.MCP_ALLOWED_ORIGINS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured && configured.length > 0) {
    return configured;
  }

  return ['https://mcp.getouch.co', 'https://portal.getouch.co', 'https://getouch.co'];
}

function getOriginHeaders(origin: string | null | undefined) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  });

  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
  }

  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Origin, Mcp-Session-Id');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  return headers;
}

function isOriginAllowed(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const allowed = getAllowedOrigins().some((entry) => {
      const allowedUrl = new URL(entry);
      return allowedUrl.host === originUrl.host;
    });
    return allowed;
  } catch {
    return false;
  }
}

function getRequestIp(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return request.headers.get('x-real-ip') || null;
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function preview(value: unknown, maxLen = 320) {
  const text = typeof value === 'string' ? value : prettyJson(value);
  return text.length <= maxLen ? text : `${text.slice(0, maxLen)}...`;
}

function jsonRpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.method === 'string';
}

function statusLabel(health: McpHealthSnapshot) {
  if (health.tests.some((item) => item.status === 'degraded')) {
    return { label: 'Degraded', tone: 'warning' as const };
  }

  if (health.tests.some((item) => item.status === 'warning')) {
    return { label: 'Ready with warnings', tone: 'warning' as const };
  }

  return { label: 'Healthy', tone: 'healthy' as const };
}

function getCompatibilityMatrix() {
  return [
    {
      label: 'Generic Streamable HTTP clients',
      status: 'Ready',
      detail: 'Bearer-authenticated JSON-RPC over a single HTTP endpoint.',
    },
    {
      label: 'Cursor / Windsurf / Cline-style remote clients',
      status: 'Ready',
      detail: 'Connect to the public MCP endpoint URL with a bearer token.',
    },
    {
      label: 'Custom agents and internal orchestration',
      status: 'Ready',
      detail: 'Tool discovery, tool invocation, resources, and prompts are available over HTTP POST.',
    },
  ];
}

function getCapabilitiesSummary() {
  return [
    {
      title: 'Bearer-authenticated transport',
      detail: 'The public endpoint uses central Getouch API keys instead of Caddy Basic Auth.',
    },
    {
      title: 'Safe initial tools only',
      detail: 'The runtime exposes read-only service discovery and tenant context tools while unsafe scaffolds stay disabled.',
    },
    {
      title: 'Database-backed operations',
      detail: 'Servers, tools, activity, clients, tenants, and mirrored access-key metadata live in the existing mcp PostgreSQL database.',
    },
  ];
}

function buildSnippets() {
  return {
    curl: `curl -s ${MCP_ENDPOINT_URL} \\
  -H "Authorization: Bearer gtc_live_your_key" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{
    "jsonrpc": "2.0",
    "id": "init-1",
    "method": "initialize",
    "params": {
      "protocolVersion": "${MCP_PROTOCOL_VERSION}",
      "capabilities": {},
      "clientInfo": {
        "name": "curl",
        "version": "1.0.0"
      }
    }
  }'`,
    javascript: `const response = await fetch('${MCP_ENDPOINT_URL}', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer gtc_live_your_key',
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 'tools-list-1',
    method: 'tools/list',
    params: {},
  }),
});

const json = await response.json();`,
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || `mcp-${Date.now()}`;
}

function normalizeScopes(input: unknown) {
  const requested = Array.isArray(input) ? input.map((value) => String(value)) : [...DEFAULT_MCP_SCOPES];
  const unique = Array.from(new Set(requested.filter((scope) => (ALLOWED_MCP_SCOPES as readonly string[]).includes(scope))));
  return unique.length > 0 ? unique : [...DEFAULT_MCP_SCOPES];
}

function getServiceDirectory(): ServiceDirectoryEntry[] {
  const gatewayServices = getGatewayServices();
  const gatewayMap = new Map(gatewayServices.map((service) => [service.id, service]));

  return [
    {
      id: 'mcp',
      name: 'Getouch MCP',
      category: 'ai',
      status: 'active',
      publicUrl: MCP_PUBLIC_BASE_URL,
      adminUrl: MCP_ADMIN_URL,
      description: 'Public developer page and bearer-authenticated Streamable HTTP MCP endpoint.',
    },
    {
      id: 'vllm',
      name: 'vLLM AI Gateway',
      category: 'ai',
      status: gatewayMap.get('vllm')?.status || 'ready',
      publicUrl: 'https://vllm.getouch.co',
      adminUrl: `${PORTAL_ADMIN_URL}/service-endpoints/vllm`,
      description: 'OpenAI-compatible vLLM inference gateway.',
    },
    {
      id: 'dify',
      name: 'Dify',
      category: 'ai',
      status: 'managed',
      publicUrl: 'https://dify.getouch.co',
      adminUrl: `${PORTAL_ADMIN_URL}/service-endpoints/dify`,
      description: 'Managed Dify orchestration workspace and app runtime.',
    },
    {
      id: 'baileys',
      name: 'Baileys Gateway',
      category: 'messaging',
      status: 'managed',
      publicUrl: 'https://wa.getouch.co',
      adminUrl: `${PORTAL_ADMIN_URL}/service-endpoints/baileys`,
      description: 'WhatsApp gateway and tenant runtime surface.',
    },
    {
      id: 'voice',
      name: 'FusionPBX / Voice',
      category: 'messaging',
      status: gatewayMap.get('voice')?.status || 'planned',
      publicUrl: 'https://voice.getouch.co',
      adminUrl: `${PORTAL_ADMIN_URL}/service-endpoints/voice`,
      description: 'FusionPBX voice endpoint and broadcast control plane.',
    },
    {
      id: 'object-storage',
      name: 'Object Storage',
      category: 'operations',
      status: 'managed',
      publicUrl: 'https://s3.getouch.co',
      adminUrl: `${PORTAL_ADMIN_URL}/service-endpoints/object-storage`,
      description: 'S3-compatible SeaweedFS object storage gateway.',
    },
    {
      id: 'portal',
      name: 'Portal',
      category: 'operations',
      status: 'active',
      publicUrl: PORTAL_ADMIN_URL,
      adminUrl: PORTAL_ADMIN_URL,
      description: 'Operator portal for service endpoints, keys, and runtime control.',
    },
  ];
}

async function getMcpRuntimeServer(portalData?: McpPortalData) {
  const data = portalData ?? (await getMcpPortalData());
  return data.servers.find((server) => server.slug === 'getouch-core') || null;
}

export async function getMcpHealthSnapshot(): Promise<McpHealthSnapshot> {
  const checkedAt = new Date().toISOString();
  const portalData = await getMcpPortalData();
  const pepper = getApiKeyPepperStatus();
  const enabledTools = portalData.tools.filter((tool) => tool.enabled && tool.availability === 'enabled').length;

  const tests: McpHealthCheck[] = [
    {
      label: 'MCP database',
      status: portalData.status.connected ? 'healthy' : 'degraded',
      detail: portalData.status.connected
        ? `Connected to ${portalData.status.database} (${portalData.status.urlSource}).`
        : portalData.status.error || 'MCP database is not reachable.',
    },
    {
      label: 'Schema bootstrap',
      status: portalData.status.schemaApplied ? 'healthy' : 'degraded',
      detail: portalData.status.schemaApplied
        ? `${portalData.status.tableCount} tables discovered and ready.`
        : `Missing: ${portalData.status.missingTables.join(', ') || 'unknown'}`,
    },
    {
      label: 'Central API-key auth',
      status: pepper.source === 'central' ? 'healthy' : 'warning',
      detail:
        pepper.source === 'central'
          ? 'Dedicated CENTRAL_API_KEY_PEPPER is active for bearer validation.'
          : 'Using legacy AUTH_SECRET fallback until CENTRAL_API_KEY_PEPPER is configured.',
    },
    {
      label: 'Runtime tools',
      status: enabledTools > 0 ? 'healthy' : 'degraded',
      detail: `${enabledTools} enabled safe tools are registered for the public MCP runtime.`,
    },
    {
      label: 'Public endpoint contract',
      status: 'healthy',
      detail: `Streamable HTTP is exposed at ${MCP_ENDPOINT_URL}.`,
    },
  ];

  const ok = !tests.some((item) => item.status === 'degraded');

  await updateMcpServerHeartbeat({
    slug: 'getouch-core',
    healthStatus: ok ? 'healthy' : 'degraded',
    status: 'enabled',
  });

  return { checkedAt, ok, tests };
}

export async function getMcpDashboardStatus(): Promise<McpDashboardStatus> {
  const [portalData, dbStatus, health] = await Promise.all([
    getMcpPortalData(),
    getMcpDbStatus(),
    getMcpHealthSnapshot(),
  ]);
  const label = statusLabel(health);
  const runtimeServer = await getMcpRuntimeServer(portalData);

  return {
    checkedAt: new Date().toISOString(),
    summary: {
      statusLabel: label.label,
      statusTone: label.tone,
      publicUrl: MCP_PUBLIC_BASE_URL,
      endpointUrl: MCP_ENDPOINT_URL,
      transport: 'Streamable HTTP',
      authMode: 'Bearer token via central API keys',
      runtimeTarget: runtimeServer?.runtimeTarget || 'getouch-web:/api/mcp',
      servers: portalData.counts.servers,
      enabledTools: portalData.counts.enabledTools,
      activeKeys: portalData.counts.activeKeys,
      requests24h: portalData.counts.toolCalls24h,
    },
    health,
    database: dbStatus,
    quickActions: [
      { label: 'Open public developer page', href: MCP_PUBLIC_BASE_URL, external: true },
      { label: 'Open endpoint URL', href: MCP_ENDPOINT_URL, external: true },
      { label: 'Manage API keys', href: `${PORTAL_ADMIN_URL}/api-keys`, external: false },
    ],
    servers: portalData.servers,
    tools: portalData.tools,
    clients: portalData.clients,
    accessKeys: portalData.accessKeys,
    activity: portalData.activity,
    toolCalls: portalData.toolCalls,
    tenants: portalData.tenants,
    settings: portalData.settings,
    compatibility: getCompatibilityMatrix(),
    snippets: buildSnippets(),
    defaults: {
      scopes: [...DEFAULT_MCP_SCOPES],
      services: ['mcp'],
    },
  };
}

export async function getMcpPublicStatus(): Promise<McpPublicStatus> {
  const dashboard = await getMcpDashboardStatus();

  return {
    checkedAt: dashboard.checkedAt,
    summary: {
      statusLabel: dashboard.summary.statusLabel,
      statusTone: dashboard.summary.statusTone,
      endpointUrl: dashboard.summary.endpointUrl,
      transport: dashboard.summary.transport,
      authMode: dashboard.summary.authMode,
      enabledTools: dashboard.summary.enabledTools,
      healthyServers: dashboard.health.tests.filter((item) => item.status === 'healthy').length,
    },
    health: dashboard.health,
    capabilities: getCapabilitiesSummary(),
    compatibility: dashboard.compatibility,
    snippets: dashboard.snippets,
  };
}

export async function createMcpAccessKey(input: {
  clientName: string;
  clientType?: string;
  tenantId?: string | null;
  keyName?: string | null;
  scopes?: string[];
  expiresAt?: string | null;
  actorEmail: string | null;
  actorUserId: string | null;
}) {
  const clientName = input.clientName.trim();
  if (!clientName) {
    throw new Error('client_name_required');
  }

  const scopes = normalizeScopes(input.scopes);
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  const safeExpiresAt = expiresAt && Number.isFinite(expiresAt.getTime()) ? expiresAt : null;

  const client = await createMcpClient({
    name: clientName,
    clientType: input.clientType || 'external',
    tenantId: input.tenantId ?? null,
    scopes,
    metadata: { managedBy: 'portal' },
  });

  const created = await createApiKey({
    name: (input.keyName && input.keyName.trim()) || `${clientName} MCP Access`,
    environment: 'live',
    tenantId: input.tenantId ?? null,
    services: ['mcp'],
    scopes,
    expiresAt: safeExpiresAt,
    createdByEmail: input.actorEmail,
    createdByUserId: input.actorUserId,
    notes: 'Provisioned from MCP service endpoint console.',
  });

  const cacheRow = await syncMcpAccessKeyCache({
    apiKeyId: created.row.id,
    keyPrefix: created.row.keyPrefix,
    clientName,
    clientType: input.clientType || 'external',
    clientId: client?.id ?? null,
    tenantId: input.tenantId ?? null,
    status: String(created.row.status),
    scopes,
    services: ['mcp'],
    expiresAt: created.row.expiresAt,
  });

  await recordMcpActivity({
    eventType: 'access_key.created',
    summary: `Provisioned MCP access key for ${clientName}`,
    clientId: client?.id ?? null,
    apiKeyId: created.row.id,
    keyPrefix: created.row.keyPrefix,
    tenantId: input.tenantId ?? null,
    metadata: { scopes, expiresAt: safeExpiresAt?.toISOString() ?? null },
  });

  return {
    plaintext: created.plaintext,
    client,
    accessKey: cacheRow,
    key: {
      id: created.row.id,
      name: created.row.name,
      keyPrefix: created.row.keyPrefix,
      scopes,
      services: ['mcp'],
      expiresAt: created.row.expiresAt,
      status: created.row.status,
    },
  };
}

export async function createMcpServerRegistration(input: {
  name: string;
  slug?: string;
  description?: string | null;
  runtimeTarget?: string | null;
  actorEmail: string | null;
}) {
  const name = input.name.trim();
  if (!name) {
    throw new Error('server_name_required');
  }

  const server = await registerMcpServer({
    slug: slugify(input.slug?.trim() || name),
    displayName: name,
    description: input.description ?? null,
    runtimeTarget: input.runtimeTarget ?? null,
    originType: 'manual',
    metadata: { createdBy: input.actorEmail ?? 'unknown', managedBy: 'portal' },
  });

  if (!server) {
    throw new Error('server_registration_failed');
  }

  await recordMcpActivity({
    eventType: 'server.registered',
    summary: `Registered MCP server ${server.displayName}`,
    metadata: { slug: server.slug, runtimeTarget: server.runtimeTarget },
  });

  return server;
}

const TOOL_ANNOTATIONS = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  readOnlyHint: true,
};

async function getEnabledToolDefinitions() {
  const tools = await listRuntimeMcpTools();
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: TOOL_ANNOTATIONS,
  }));
}

async function toolGetStatus(verbose: boolean | undefined) {
  const [health, portalData, settings] = await Promise.all([
    getMcpHealthSnapshot(),
    getMcpPortalData(),
    listMcpSettings(),
  ]);

  return {
    endpointUrl: MCP_ENDPOINT_URL,
    publicUrl: MCP_PUBLIC_BASE_URL,
    authMode: 'bearer',
    status: statusLabel(health).label,
    health,
    counts: portalData.counts,
    settings: verbose ? settings : settings.slice(0, 3),
  };
}

async function toolListAvailableServices(kind: string | undefined) {
  const directory = getServiceDirectory();
  if (!kind || kind === 'all') {
    return directory;
  }
  return directory.filter((entry) => entry.category === kind);
}

async function toolGetServiceEndpointInfo(serviceId: string) {
  const directory = getServiceDirectory();
  const match = directory.find((entry) => entry.id === serviceId);
  if (!match) {
    return null;
  }

  if (serviceId === 'mcp') {
    const dashboard = await getMcpDashboardStatus();
    return {
      ...match,
      endpointUrl: dashboard.summary.endpointUrl,
      health: dashboard.health,
      tools: dashboard.tools.filter((tool) => tool.enabled).map((tool) => tool.name),
    };
  }

  return match;
}

async function toolGetTenantContext(tenantId: string | null | undefined, fallbackTenantId: string | null) {
  const targetTenant = tenantId || fallbackTenantId || 'platform';
  const tenant = await getMcpTenantMapping(targetTenant);
  return (
    tenant || {
      tenantId: targetTenant,
      displayName: targetTenant === 'platform' ? 'Getouch Platform' : null,
      status: 'unknown',
      metadata: {},
      clientCount: 0,
      keyCount: 0,
      toolCalls24h: 0,
      createdAt: null,
      updatedAt: null,
    }
  );
}

async function handleToolCall(methodName: string, args: Record<string, unknown>, validation: Awaited<ReturnType<typeof validateApiKey>>) {
  const startedAt = Date.now();
  const portalData = await getMcpPortalData();
  const runtimeServer = await getMcpRuntimeServer(portalData);
  const serverId = runtimeServer?.id ?? null;

  if (!validation.ok) {
    return {
      response: {
        content: [{ type: 'text', text: validation.message }],
        isError: true,
      },
      latencyMs: Date.now() - startedAt,
      serverId,
      errorCode: validation.code,
    };
  }

  try {
    let payload: unknown;

    switch (methodName) {
      case 'get_status':
        payload = await toolGetStatus(Boolean(args.verbose));
        break;
      case 'list_available_services':
        payload = await toolListAvailableServices(typeof args.kind === 'string' ? args.kind : undefined);
        break;
      case 'get_service_endpoint_info': {
        const serviceId = asString(args.serviceId).trim();
        if (!serviceId) {
          return {
            response: {
              content: [{ type: 'text', text: 'serviceId is required.' }],
              isError: true,
            },
            latencyMs: Date.now() - startedAt,
            serverId,
            errorCode: 'missing_service_id',
          };
        }
        const details = await toolGetServiceEndpointInfo(serviceId);
        if (!details) {
          return {
            response: {
              content: [{ type: 'text', text: `Unknown serviceId: ${serviceId}` }],
              isError: true,
            },
            latencyMs: Date.now() - startedAt,
            serverId,
            errorCode: 'unknown_service',
          };
        }
        payload = details;
        break;
      }
      case 'get_tenant_context':
        payload = await toolGetTenantContext(asString(args.tenantId).trim() || null, validation.tenantId);
        break;
      default:
        return {
          response: {
            content: [{ type: 'text', text: `Unknown tool: ${methodName}` }],
            isError: true,
          },
          latencyMs: Date.now() - startedAt,
          serverId,
          errorCode: 'unknown_tool',
        };
    }

    return {
      response: {
        content: [{ type: 'text', text: prettyJson(payload) }],
        isError: false,
      },
      latencyMs: Date.now() - startedAt,
      serverId,
      errorCode: null,
    };
  } catch (err) {
    return {
      response: {
        content: [{ type: 'text', text: err instanceof Error ? err.message : 'Tool execution failed.' }],
        isError: true,
      },
      latencyMs: Date.now() - startedAt,
      serverId,
      errorCode: 'tool_execution_failed',
    };
  }
}

async function buildResources(validation: Awaited<ReturnType<typeof validateApiKey>>) {
  const services = await toolListAvailableServices('all');
  const tenant = await toolGetTenantContext(validation.ok ? validation.tenantId : null, validation.ok ? validation.tenantId : null);

  return {
    resources: [
      {
        uri: 'getouch://mcp/status',
        name: 'MCP Status',
        description: 'Current Getouch MCP status snapshot.',
        mimeType: 'application/json',
      },
      {
        uri: 'getouch://mcp/services',
        name: 'Service Directory',
        description: 'Managed Getouch service endpoints visible to the MCP runtime.',
        mimeType: 'application/json',
      },
      {
        uri: `getouch://mcp/tenants/${tenant.tenantId}`,
        name: 'Tenant Context',
        description: 'Current tenant mapping and key counts.',
        mimeType: 'application/json',
      },
    ],
    serviceDirectory: services,
  };
}

async function readResource(uri: string, validation: Awaited<ReturnType<typeof validateApiKey>>) {
  if (uri === 'getouch://mcp/status') {
    const data = await toolGetStatus(true);
    return {
      contents: [{ uri, mimeType: 'application/json', text: prettyJson(data) }],
    };
  }

  if (uri === 'getouch://mcp/services') {
    const data = await toolListAvailableServices('all');
    return {
      contents: [{ uri, mimeType: 'application/json', text: prettyJson(data) }],
    };
  }

  if (uri.startsWith('getouch://mcp/tenants/')) {
    const tenantId = uri.slice('getouch://mcp/tenants/'.length);
    const data = await toolGetTenantContext(tenantId, validation.ok ? validation.tenantId : null);
    return {
      contents: [{ uri, mimeType: 'application/json', text: prettyJson(data) }],
    };
  }

  return null;
}

function listPrompts() {
  return {
    prompts: [
      {
        name: 'service_endpoint_triage',
        description: 'Structured prompt for triaging a Getouch service endpoint.',
        arguments: [
          { name: 'serviceId', description: 'Managed service identifier', required: true },
          { name: 'goal', description: 'Optional troubleshooting goal', required: false },
        ],
      },
    ],
  };
}

function getPrompt(name: string, args: Record<string, unknown>) {
  if (name !== 'service_endpoint_triage') {
    return null;
  }

  const serviceId = asString(args.serviceId).trim();
  if (!serviceId) {
    return { error: 'serviceId is required.' };
  }

  const goal = asString(args.goal).trim();

  return {
    description: 'Service endpoint triage prompt',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Review the Getouch service endpoint "${serviceId}". Focus on public URL, admin URL, auth shape, operator health signals, and the most likely next action.${goal ? ` Goal: ${goal}` : ''}`,
        },
      },
    ],
  };
}

function requiredScopeForMethod(method: string) {
  switch (method) {
    case 'initialize':
    case 'notifications/initialized':
    case 'prompts/list':
    case 'prompts/get':
      return 'mcp:connect';
    case 'tools/list':
      return 'mcp:tools:list';
    case 'tools/call':
      return 'mcp:tools:call';
    case 'resources/list':
    case 'resources/read':
    case 'resources/templates/list':
      return 'mcp:resources:read';
    default:
      return 'mcp:connect';
  }
}

async function validateForRequests(request: NextRequest, rpcRequests: JsonRpcRequest[]) {
  const requiredScope = rpcRequests
    .filter((entry) => typeof entry.method === 'string')
    .reduce<string | null>((current, entry) => {
      const scope = requiredScopeForMethod(String(entry.method));
      if (!current) return scope;
      if (current === scope) return current;
      if (current === 'mcp:connect') return scope;
      return current === 'mcp:tools:call' || scope === 'mcp:tools:call' ? 'mcp:tools:call' : current;
    }, null) || 'mcp:connect';

  return validateApiKey({
    authorizationHeader: request.headers.get('authorization'),
    requiredService: 'mcp',
    requiredScope,
    origin: request.headers.get('origin'),
    ip: getRequestIp(request),
  });
}

function buildAuthFailureResponses(rpcRequests: JsonRpcRequest[], message: string, code: string) {
  const requestIds = rpcRequests.filter((entry) => isJsonRpcRequest(entry) && entry.id !== undefined).map((entry) => entry.id ?? null);
  if (requestIds.length === 0) {
    return [jsonRpcError(null, -32001, message, { code })];
  }
  return requestIds.map((id) => jsonRpcError(id, -32001, message, { code }));
}

function successResponse(body: JsonRpcResponse | JsonRpcResponse[], origin: string | null | undefined) {
  const headers = getOriginHeaders(origin);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new NextResponse(JSON.stringify(body), { status: 200, headers });
}

function acceptedResponse(origin: string | null | undefined) {
  return new NextResponse(null, { status: 202, headers: getOriginHeaders(origin) });
}

async function handleRpcRequest(
  request: NextRequest,
  rpcRequest: JsonRpcRequest,
  validation: Awaited<ReturnType<typeof validateApiKey>>,
) {
  const method = String(rpcRequest.method);
  const params = asRecord(rpcRequest.params);
  const id = rpcRequest.id ?? null;

  switch (method) {
    case 'initialize': {
      return jsonRpcResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: {
          name: 'Getouch MCP',
          version: MCP_SERVER_VERSION,
        },
      });
    }
    case 'notifications/initialized':
      return null;
    case 'tools/list': {
      const tools = await getEnabledToolDefinitions();
      return jsonRpcResult(id, { tools });
    }
    case 'tools/call': {
      const toolName = asString(params.name).trim();
      if (!toolName) {
        return jsonRpcError(id, -32602, 'Tool name is required.');
      }

      const toolArgs = asRecord(params.arguments);
      const toolResult = await handleToolCall(toolName, toolArgs, validation);

      if (validation.ok) {
        await recordMcpToolCall({
          serverId: toolResult.serverId,
          toolName,
          apiKeyId: validation.keyId,
          keyPrefix: validation.keyPrefix,
          tenantId: validation.tenantId,
          status: toolResult.response.isError ? 'error' : 'success',
          errorCode: toolResult.errorCode,
          latencyMs: toolResult.latencyMs,
          args: toolArgs,
          resultPreview: preview(toolResult.response),
        });
      }

      return jsonRpcResult(id, toolResult.response);
    }
    case 'resources/list': {
      const resources = await buildResources(validation);
      return jsonRpcResult(id, { resources: resources.resources });
    }
    case 'resources/read': {
      const uri = asString(params.uri).trim();
      if (!uri) {
        return jsonRpcError(id, -32602, 'Resource uri is required.');
      }
      const resource = await readResource(uri, validation);
      if (!resource) {
        return jsonRpcError(id, -32002, 'Resource not found', { uri });
      }
      return jsonRpcResult(id, resource);
    }
    case 'resources/templates/list':
      return jsonRpcResult(id, { resourceTemplates: [] });
    case 'prompts/list':
      return jsonRpcResult(id, listPrompts());
    case 'prompts/get': {
      const name = asString(params.name).trim();
      if (!name) {
        return jsonRpcError(id, -32602, 'Prompt name is required.');
      }
      const result = getPrompt(name, asRecord(params.arguments));
      if (!result) {
        return jsonRpcError(id, -32602, `Unknown prompt: ${name}`);
      }
      if ('error' in result && typeof result.error === 'string') {
        return jsonRpcError(id, -32602, result.error);
      }
      return jsonRpcResult(id, result);
    }
    default:
      return jsonRpcError(id, -32601, `Method not found: ${method}`);
  }
}

export async function handleMcpPost(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!isOriginAllowed(request)) {
    const headers = getOriginHeaders(origin);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    return new NextResponse(
      JSON.stringify(jsonRpcError(null, -32099, 'Origin not allowed.')),
      { status: 403, headers },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const headers = getOriginHeaders(origin);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    return new NextResponse(JSON.stringify(jsonRpcError(null, -32700, 'Invalid JSON body.')), { status: 400, headers });
  }

  const entries = Array.isArray(body) ? body : [body];
  const rpcRequests = entries.filter((entry) => isJsonRpcRequest(entry)) as JsonRpcRequest[];
  if (rpcRequests.length === 0) {
    return acceptedResponse(origin);
  }

  const validation = await validateForRequests(request, rpcRequests);
  if (!validation.ok) {
    await recordUsage({
      apiKeyId: null,
      keyPrefix: null,
      service: 'mcp',
      route: '/mcp',
      statusCode: validation.status,
      errorCode: validation.code,
      ip: getRequestIp(request),
      latencyMs: null,
    });

    const errors = buildAuthFailureResponses(rpcRequests, validation.message, validation.code);
    const headers = getOriginHeaders(origin);
    headers.set('Content-Type', 'application/json; charset=utf-8');
    return new NextResponse(JSON.stringify(errors.length === 1 ? errors[0] : errors), {
      status: validation.status,
      headers,
    });
  }

  const clientInfo = rpcRequests
    .map((entry) => asRecord(entry.params).clientInfo)
    .map((entry) => asRecord(entry))
    .find((entry) => typeof entry.name === 'string');
  const clientName = typeof clientInfo?.name === 'string' ? clientInfo.name : `Client ${validation.keyPrefix}`;
  const now = new Date();

  const accessCache = await syncMcpAccessKeyCache({
    apiKeyId: validation.keyId,
    keyPrefix: validation.keyPrefix,
    clientName,
    tenantId: validation.tenantId,
    status: 'active',
    scopes: validation.scopes,
    services: validation.services,
    lastUsedAt: now,
    lastUsedIp: getRequestIp(request),
  });

  await touchMcpUsage({
    apiKeyId: validation.keyId,
    keyPrefix: validation.keyPrefix,
    tenantId: validation.tenantId,
    lastUsedIp: getRequestIp(request),
    seenAt: now,
  });

  await recordMcpActivity({
    eventType: 'request.accepted',
    summary: `${rpcRequests.length} MCP request${rpcRequests.length === 1 ? '' : 's'} accepted`,
    clientId: accessCache?.clientId ?? null,
    apiKeyId: validation.keyId,
    keyPrefix: validation.keyPrefix,
    tenantId: validation.tenantId,
    metadata: { methods: rpcRequests.map((entry) => entry.method) },
  });

  const responses = await Promise.all(
    rpcRequests.map((entry) => handleRpcRequest(request, entry, validation)),
  );
  const output = responses.filter((entry): entry is JsonRpcResponse => Boolean(entry));

  await recordUsage({
    apiKeyId: validation.keyId,
    keyPrefix: validation.keyPrefix,
    service: 'mcp',
    route: '/mcp',
    statusCode: output.length > 0 ? 200 : 202,
    errorCode: null,
    ip: getRequestIp(request),
    latencyMs: null,
  });

  return output.length > 0
    ? successResponse(output.length === 1 ? output[0] : output, origin)
    : acceptedResponse(origin);
}

export async function handleMcpOptions(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!isOriginAllowed(request)) {
    return new NextResponse(null, { status: 403, headers: getOriginHeaders(origin) });
  }

  return new NextResponse(null, { status: 204, headers: getOriginHeaders(origin) });
}

export async function getMcpHealthzResponse() {
  const health = await getMcpHealthSnapshot();
  return NextResponse.json(
    {
      ok: health.ok,
      checkedAt: health.checkedAt,
      endpoint: MCP_ENDPOINT_URL,
      tests: health.tests,
    },
    {
      status: health.ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}