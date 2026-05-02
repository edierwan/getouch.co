/**
 * Lightweight SeaweedFS helper used by the Object Storage Gateway portal.
 *
 * The portal control plane talks to SeaweedFS over its native HTTP APIs
 * (master, filer) — NOT the S3 API — to avoid pulling AWS SDK into the
 * Next.js edge build. All heavy operations (uploads, listings) go through
 * the filer running on the internal Docker network (`seaweed-filer:8888`).
 *
 * Public S3 traffic from end-user apps continues to flow through
 * `s3api.getouch.co` → `seaweed-s3:8333` and is unaffected by this module.
 */

const MASTER_URL = process.env.SEAWEED_MASTER_URL ?? 'http://seaweed-master:9333';
const FILER_URL = process.env.SEAWEED_FILER_URL ?? 'http://seaweed-filer:8888';
const S3_INTERNAL_URL = process.env.SEAWEED_S3_INTERNAL_URL ?? 'http://seaweed-s3:8333';

const DEFAULT_TIMEOUT_MS = 4000;

type SeaweedDataNode = {
  Volumes?: number;
};

type SeaweedRack = {
  DataNodes?: SeaweedDataNode[];
};

type SeaweedDataCenter = {
  Racks?: SeaweedRack[];
};

type SeaweedTopology = {
  Max?: number;
  Free?: number;
  Active?: number;
  DataCenters?: SeaweedDataCenter[];
  layouts?: unknown;
  Layouts?: unknown;
};

async function fetchJson<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const controller = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const res = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: controller,
    headers: { Accept: 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export interface MasterStatus {
  reachable: boolean;
  total: number | null;
  free: number | null;
  active: number | null;
  volumes: number | null;
  usedBytes?: number | null;
  source?: 'direct' | 'host-ssh';
  layout?: unknown;
  error?: string;
}

function countActiveNodes(dataCenters: SeaweedDataCenter[] | undefined) {
  const racks = (dataCenters ?? []).flatMap((dataCenter) => dataCenter.Racks ?? []);
  const nodes = racks.flatMap((rack) => rack.DataNodes ?? []);
  return nodes.length > 0 ? nodes.length : null;
}

function countAllocatedVolumes(dataCenters: SeaweedDataCenter[] | undefined) {
  const nodes = (dataCenters ?? [])
    .flatMap((dataCenter) => dataCenter.Racks ?? [])
    .flatMap((rack) => rack.DataNodes ?? []);
  const total = nodes.reduce((count, node) => count + (typeof node.Volumes === 'number' ? node.Volumes : 0), 0);
  return total > 0 ? total : null;
}

export function parseMasterStatusPayload(
  json: { Topology?: unknown },
  source: MasterStatus['source'] = 'direct',
): MasterStatus {
  const topology = (json.Topology ?? {}) as SeaweedTopology;

  return {
    reachable: true,
    total: typeof topology.Max === 'number' ? topology.Max : null,
    free: typeof topology.Free === 'number' ? topology.Free : null,
    active: typeof topology.Active === 'number' ? topology.Active : countActiveNodes(topology.DataCenters),
    volumes: countAllocatedVolumes(topology.DataCenters),
    usedBytes: null,
    source,
    layout: topology.layouts ?? topology.Layouts,
  };
}

export async function getMasterStatus(): Promise<MasterStatus> {
  try {
    const json = await fetchJson<{ Topology?: SeaweedTopology }>(`${MASTER_URL}/dir/status`);
    return parseMasterStatusPayload(json, 'direct');
  } catch (err) {
    return {
      reachable: false,
      total: null,
      free: null,
      active: null,
      volumes: null,
      usedBytes: null,
      source: 'direct',
      error: err instanceof Error ? err.message : 'fetch_failed',
    };
  }
}

type EndpointProbe = {
  reachable: boolean;
  statusCode: number | null;
  error?: string;
};

export interface GatewayStatus {
  reachable: boolean;
  apiReachable: boolean;
  consoleReachable: boolean;
  apiStatusCode: number | null;
  consoleStatusCode: number | null;
  error?: string;
}

const ACCEPTABLE_GATEWAY_STATUS_CODES = new Set([200, 204, 301, 302, 307, 308, 401, 403, 404, 405]);

async function probeEndpoint(url: string, init: RequestInit = {}): Promise<EndpointProbe> {
  try {
    const res = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    return {
      reachable: res.ok || ACCEPTABLE_GATEWAY_STATUS_CODES.has(res.status),
      statusCode: res.status,
    };
  } catch (err) {
    return {
      reachable: false,
      statusCode: null,
      error: err instanceof Error ? err.message : 'fetch_failed',
    };
  }
}

export async function getGatewayStatus(): Promise<GatewayStatus> {
  const [api, console] = await Promise.all([
    probeEndpoint('https://s3api.getouch.co', { method: 'HEAD' }),
    probeEndpoint('https://s3.getouch.co'),
  ]);
  const errors = [api.error, console.error].filter(Boolean).join('; ');

  return {
    reachable: api.reachable || console.reachable,
    apiReachable: api.reachable,
    consoleReachable: console.reachable,
    apiStatusCode: api.statusCode,
    consoleStatusCode: console.statusCode,
    error: errors || undefined,
  };
}

export interface FilerEntry {
  FullPath: string;
  Mtime?: string;
  Crtime?: string;
  Mode?: number;
  Uid?: number;
  Gid?: number;
  Mime?: string;
  FileSize?: number;
  chunks?: unknown[];
}

export interface FilerListing {
  Path: string;
  Entries: FilerEntry[] | null;
  Limit: number;
  LastFileName: string;
  ShouldDisplayLoadMore: boolean;
}

/** List a directory on the filer (used for buckets + objects). */
export async function listFilerPath(path: string, limit = 200): Promise<FilerListing> {
  const url = new URL(`${FILER_URL}${path.startsWith('/') ? path : `/${path}`}`);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('pretty', 'y');
  const res = await fetchJson<FilerListing>(url.toString());
  return {
    Path: res.Path ?? path,
    Entries: res.Entries ?? [],
    Limit: res.Limit ?? limit,
    LastFileName: res.LastFileName ?? '',
    ShouldDisplayLoadMore: res.ShouldDisplayLoadMore ?? false,
  };
}

/** List buckets via the filer (each bucket is a top-level dir in /buckets). */
export async function listBuckets(): Promise<string[]> {
  try {
    const listing = await listFilerPath('/buckets/');
    return (listing.Entries ?? [])
      .filter((e) => !e.Mime) // directories have no Mime
      .map((e) => e.FullPath.replace(/^\/buckets\//, '').replace(/\/$/, ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export interface BucketInfo {
  name: string;
  objectCount: number | null;
  sizeBytes: number | null;
  createdAt: string | null;
}

/** Best-effort metadata for a bucket. */
export async function describeBucket(name: string): Promise<BucketInfo> {
  try {
    const listing = await listFilerPath(`/buckets/${name}/`);
    const entries = listing.Entries ?? [];
    const hasNestedPrefixes = entries.some((entry) => !entry.Mime);
    const objectCount = hasNestedPrefixes ? null : entries.filter((e) => e.Mime).length;
    const sizeBytes = hasNestedPrefixes ? null : entries.reduce((sum, e) => sum + (e.FileSize ?? 0), 0);
    return {
      name,
      objectCount,
      sizeBytes,
      createdAt: null,
    };
  } catch {
    return { name, objectCount: null, sizeBytes: null, createdAt: null };
  }
}

/**
 * Create a bucket. SeaweedFS treats a top-level directory under `/buckets/`
 * as a bucket. POST with no body creates the directory.
 */
export async function createBucket(name: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^[a-z0-9][a-z0-9.-]{1,62}$/.test(name)) {
    return { ok: false, error: 'invalid_bucket_name' };
  }
  try {
    const res = await fetch(`${FILER_URL}/buckets/${encodeURIComponent(name)}/`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok && res.status !== 204) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'fetch_failed' };
  }
}

export async function deleteBucket(name: string, force = false): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = new URL(`${FILER_URL}/buckets/${encodeURIComponent(name)}/`);
    if (force) url.searchParams.set('recursive', 'true');
    const res = await fetch(url.toString(), {
      method: 'DELETE',
      cache: 'no-store',
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok && res.status !== 204) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'fetch_failed' };
  }
}

/** List objects within a bucket (optionally under a prefix). */
export async function listObjects(bucket: string, prefix = ''): Promise<FilerEntry[]> {
  const cleanPrefix = prefix.replace(/^\/+/, '').replace(/\/+$/, '');
  const path = cleanPrefix
    ? `/buckets/${bucket}/${cleanPrefix}/`
    : `/buckets/${bucket}/`;
  try {
    const listing = await listFilerPath(path);
    return listing.Entries ?? [];
  } catch {
    return [];
  }
}

export async function deleteObject(bucket: string, key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const path = `/buckets/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const res = await fetch(`${FILER_URL}${path}`, {
      method: 'DELETE',
      cache: 'no-store',
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok && res.status !== 204) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'fetch_failed' };
  }
}

export async function uploadObject(
  bucket: string,
  prefix: string,
  filename: string,
  body: ArrayBuffer | Uint8Array,
  contentType?: string,
): Promise<{ ok: boolean; error?: string; key?: string }> {
  try {
    const cleanPrefix = prefix.replace(/^\/+/, '').replace(/\/+$/, '');
    const key = cleanPrefix ? `${cleanPrefix}/${filename}` : filename;
    const path = `/buckets/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const res = await fetch(`${FILER_URL}${path}`, {
      method: 'PUT',
      body: body as BodyInit,
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
      headers: contentType ? { 'Content-Type': contentType } : {},
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, key };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'fetch_failed' };
  }
}

export const ENDPOINTS = {
  fileConsole: 'https://s3.getouch.co',
  s3Api: 'https://s3api.getouch.co',
  internal: S3_INTERNAL_URL,
  master: MASTER_URL,
  filer: FILER_URL,
} as const;

export const STORAGE = {
  dataPath: '/srv/archive/seaweedfs',
  region: 'us-east-1',
  signatureVersion: 'v4',
  pathStyle: true,
  defaultBucket: 'getouch-media',
} as const;
