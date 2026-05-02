import { spawn } from 'node:child_process';
import {
  describeBucket,
  getGatewayStatus,
  getMasterStatus,
  listFilerPath,
  parseMasterStatusPayload,
  type BucketInfo,
  type MasterStatus,
} from './seaweed';

const INFRA_SSH_TARGET = process.env.INFRA_METRICS_SSH_TARGET
  || process.env.SHUTDOWN_DIAGNOSTIC_SSH_TARGET
  || 'deploy@100.84.14.93';

const SSH_KEY_PATH = process.env.INFRA_METRICS_SSH_KEY_PATH || '/home/nextjs/.ssh/id_ed25519';
const SSH_KNOWN_HOSTS_PATH = process.env.INFRA_METRICS_SSH_KNOWN_HOSTS_PATH || '/home/nextjs/.ssh/known_hosts';
const SEAWEED_VOLUME_SIZE_BYTES = 30 * 1024 * 1024 * 1024;
const DEFAULT_STORAGE_PATH = process.env.SEAWEED_HOST_DATA_PATH || '/srv/archive/seaweedfs';

type ProbeSource = 'direct' | 'host-ssh' | 'unavailable';

type BucketListingProbe = {
  reachable: boolean;
  buckets: BucketInfo[];
  error?: string;
};

type HostProbePayload = {
  master?: {
    dirStatus?: unknown;
    volStatus?: unknown;
    error?: string;
  };
  buckets?: {
    reachable?: boolean;
    items?: BucketInfo[];
    error?: string;
  };
  filesystem?: {
    totalBytes?: number | null;
    usedBytes?: number | null;
    freeBytes?: number | null;
    mountPoint?: string | null;
    device?: string | null;
    pathBytes?: number | null;
    error?: string;
  };
};

export interface ObjectStorageControlPlaneStatus {
  source: ProbeSource;
  filerReachable: boolean;
  error?: string;
}

export interface ObjectStorageCapacityStatus {
  source: 'filesystem-host' | 'master-volume-estimate' | 'unavailable';
  totalBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  filesystemUsedBytes: number | null;
  mountPoint: string | null;
  device: string | null;
  detail: string;
}

export interface ObjectStorageSnapshot {
  gateway: Awaited<ReturnType<typeof getGatewayStatus>>;
  master: MasterStatus;
  controlPlane: ObjectStorageControlPlaneStatus;
  capacity: ObjectStorageCapacityStatus;
  buckets: BucketInfo[];
}

function runRemoteScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ssh',
      [
        '-i',
        SSH_KEY_PATH,
        '-o',
        `UserKnownHostsFile=${SSH_KNOWN_HOSTS_PATH}`,
        '-o',
        'StrictHostKeyChecking=yes',
        INFRA_SSH_TARGET,
        'bash',
        '-s',
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
      },
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `ssh exited with code ${code}`));
    });

    child.stdin.end(script);
  });
}

function buildHostProbeScript(storagePath: string) {
  const storagePathLiteral = JSON.stringify(storagePath);

  return String.raw`
set -euo pipefail

python3 - <<'PY'
import json
import subprocess
from datetime import datetime, timezone
from urllib.parse import quote

storage_path = ${storagePathLiteral}


def run(cmd: str):
  completed = subprocess.run(cmd, shell=True, text=True, capture_output=True)
  return completed.returncode, completed.stdout.strip(), completed.stderr.strip()


payload = {
  'collectedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
  'master': {
    'dirStatus': None,
    'volStatus': None,
    'error': None,
  },
  'buckets': {
    'reachable': False,
    'items': [],
    'error': None,
  },
  'filesystem': {
    'totalBytes': None,
    'usedBytes': None,
    'freeBytes': None,
    'mountPoint': None,
    'device': None,
    'pathBytes': None,
    'error': None,
  },
}

rc, out, err = run("docker exec seaweed-master sh -lc 'wget -qO- http://127.0.0.1:9333/dir/status'")
if rc == 0 and out:
  try:
    payload['master']['dirStatus'] = json.loads(out)
  except json.JSONDecodeError:
    payload['master']['error'] = 'invalid_master_dir_status_json'
else:
  payload['master']['error'] = err or out or f'master_dir_status_failed:{rc}'

rc, out, err = run("docker exec seaweed-master sh -lc 'wget -qO- http://127.0.0.1:9333/vol/status'")
if rc == 0 and out:
  try:
    payload['master']['volStatus'] = json.loads(out)
  except json.JSONDecodeError:
    payload['master']['error'] = payload['master']['error'] or 'invalid_master_vol_status_json'
else:
  payload['master']['error'] = payload['master']['error'] or err or out or f'master_vol_status_failed:{rc}'

rc, out, err = run("docker exec seaweed-filer sh -lc 'wget -qO- --header=\"Accept: application/json\" \"http://127.0.0.1:8888/buckets/?limit=200\"'")
if rc == 0 and out:
  try:
    listing = json.loads(out)
    entries = listing.get('Entries') or []
    items = []
    for entry in entries:
      full_path = str(entry.get('FullPath') or '')
      if not full_path.startswith('/buckets/'):
        continue
      name = full_path.replace('/buckets/', '', 1).strip('/')
      if not name:
        continue
      created_at = entry.get('Crtime') or entry.get('Mtime')
      object_count = None
      size_bytes = None

      rc_detail, out_detail, err_detail = run(
        "docker exec seaweed-filer sh -lc 'wget -qO- --header=\"Accept: application/json\" \"http://127.0.0.1:8888/buckets/{}?limit=500\"'".format(
          quote(f'{name}/', safe='')
        )
      )
      if rc_detail == 0 and out_detail:
        try:
          detail = json.loads(out_detail)
          detail_entries = detail.get('Entries') or []
          has_nested_prefixes = any(not item.get('Mime') for item in detail_entries)
          if not has_nested_prefixes:
            object_count = sum(1 for item in detail_entries if item.get('Mime'))
            size_bytes = sum(int(item.get('FileSize') or 0) for item in detail_entries)
        except json.JSONDecodeError:
          pass
      else:
        _ = err_detail

      items.append({
        'name': name,
        'objectCount': object_count,
        'sizeBytes': size_bytes,
        'createdAt': created_at,
      })

    payload['buckets']['reachable'] = True
    payload['buckets']['items'] = items
  except json.JSONDecodeError:
    payload['buckets']['error'] = 'invalid_filer_bucket_json'
else:
  payload['buckets']['error'] = err or out or f'filer_bucket_list_failed:{rc}'

rc, out, err = run(f"df -B1 --output=source,size,used,avail,target {storage_path} | tail -n +2")
if rc == 0 and out:
  parts = out.splitlines()[-1].split(None, 4)
  if len(parts) == 5:
    payload['filesystem']['device'] = parts[0]
    payload['filesystem']['totalBytes'] = int(parts[1])
    payload['filesystem']['usedBytes'] = int(parts[2])
    payload['filesystem']['freeBytes'] = int(parts[3])
    payload['filesystem']['mountPoint'] = parts[4]
else:
  payload['filesystem']['error'] = err or out or f'df_failed:{rc}'

rc, out, err = run(f"du -sb {storage_path}")
if rc == 0 and out:
  payload['filesystem']['pathBytes'] = int(out.split()[0])
else:
  payload['filesystem']['error'] = payload['filesystem']['error'] or err or out or f'du_failed:{rc}'

print(json.dumps(payload))
PY
`;
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function sumOptional(values: Array<number | null | undefined>) {
  if (values.length === 0) return 0;
  if (values.some((value) => value == null || !Number.isFinite(value))) {
    return null;
  }

  let total = 0;
  for (const value of values) {
    total += value ?? 0;
  }

  return total;
}

function sumVolumeBytes(volStatus: unknown) {
  const volumes = ((volStatus as { Volumes?: { DataCenters?: Record<string, Record<string, Record<string, Array<{ Size?: unknown }>>>> } })?.Volumes
    ?.DataCenters) || {};

  let total = 0;
  let seen = false;

  for (const dataCenter of Object.values(volumes)) {
    for (const rack of Object.values(dataCenter || {})) {
      for (const nodeVolumes of Object.values(rack || {})) {
        for (const volume of nodeVolumes || []) {
          const size = toNumber(volume?.Size);
          if (size == null) continue;
          total += size;
          seen = true;
        }
      }
    }
  }

  return seen ? total : null;
}

function buildDirectCapacity(master: MasterStatus, buckets: BucketInfo[]): ObjectStorageCapacityStatus {
  const totalBytes = master.total != null ? master.total * SEAWEED_VOLUME_SIZE_BYTES : null;
  const freeBytes = master.free != null ? master.free * SEAWEED_VOLUME_SIZE_BYTES : null;
  const usedBytes = sumOptional(buckets.map((bucket) => bucket.sizeBytes));

  if (totalBytes == null && freeBytes == null && usedBytes == null) {
    return {
      source: 'unavailable',
      totalBytes: null,
      usedBytes: null,
      freeBytes: null,
      filesystemUsedBytes: null,
      mountPoint: null,
      device: null,
      detail: 'Capacity is unavailable from the current runtime.',
    };
  }

  return {
    source: 'master-volume-estimate',
    totalBytes,
    usedBytes,
    freeBytes,
    filesystemUsedBytes: null,
    mountPoint: null,
    device: null,
    detail: 'Capacity is estimated from SeaweedFS volume slots and indexed bucket totals.',
  };
}

async function getDirectBucketInfos(): Promise<BucketListingProbe> {
  try {
    const listing = await listFilerPath('/buckets/');
    const metadataByName = new Map(
      (listing.Entries ?? [])
        .map((entry) => {
          const name = entry.FullPath.replace(/^\/buckets\//, '').replace(/\/$/, '');
          return [name, entry] as const;
        })
        .filter(([name]) => Boolean(name)),
    );
    const bucketNames = [...metadataByName.keys()];
    const buckets = await Promise.all(
      bucketNames.map(async (name) => {
        const details = await describeBucket(name);
        const entry = metadataByName.get(name);
        return {
          ...details,
          createdAt: entry?.Crtime ?? entry?.Mtime ?? details.createdAt,
        };
      }),
    );

    return { reachable: true, buckets };
  } catch (error) {
    return {
      reachable: false,
      buckets: [],
      error: error instanceof Error ? error.message : 'direct_bucket_probe_failed',
    };
  }
}

async function getHostSnapshot(storagePath: string) {
  const raw = await runRemoteScript(buildHostProbeScript(storagePath));
  const payload = JSON.parse(raw) as HostProbePayload;

  const hostMaster = payload.master?.dirStatus
    ? parseMasterStatusPayload(payload.master.dirStatus as { Topology?: unknown }, 'host-ssh')
    : {
        reachable: false,
        total: null,
        free: null,
        active: null,
        volumes: null,
        source: 'host-ssh' as const,
        error: payload.master?.error ?? 'host_master_probe_failed',
      };

  const usedBytes = payload.master?.volStatus ? sumVolumeBytes(payload.master.volStatus) : null;
  const master: MasterStatus = {
    ...hostMaster,
    usedBytes,
  };

  const buckets = payload.buckets?.items ?? [];
  const controlPlane: ObjectStorageControlPlaneStatus = {
    source: payload.buckets?.reachable || hostMaster.reachable ? 'host-ssh' : 'unavailable',
    filerReachable: Boolean(payload.buckets?.reachable),
    error: payload.buckets?.reachable ? undefined : payload.buckets?.error ?? payload.master?.error,
  };

  const capacity: ObjectStorageCapacityStatus = payload.filesystem?.totalBytes != null
    || payload.filesystem?.freeBytes != null
    || payload.filesystem?.pathBytes != null
    ? {
        source: 'filesystem-host',
        totalBytes: payload.filesystem?.totalBytes ?? null,
        usedBytes: payload.filesystem?.pathBytes ?? null,
        freeBytes: payload.filesystem?.freeBytes ?? null,
        filesystemUsedBytes: payload.filesystem?.usedBytes ?? null,
        mountPoint: payload.filesystem?.mountPoint ?? null,
        device: payload.filesystem?.device ?? null,
        detail:
          'Capacity is sourced from the backing filesystem via the host relay. Used storage reflects the SeaweedFS data path; free space reflects filesystem capacity shared with other services.',
      }
    : {
        source: 'unavailable',
        totalBytes: null,
        usedBytes: null,
        freeBytes: null,
        filesystemUsedBytes: null,
        mountPoint: null,
        device: null,
        detail: payload.filesystem?.error || 'Capacity is unavailable from the host relay.',
      };

  return { master, controlPlane, capacity, buckets };
}

export async function getObjectStorageSnapshot(storagePath = DEFAULT_STORAGE_PATH): Promise<ObjectStorageSnapshot> {
  const [gateway, directMaster, directBuckets] = await Promise.all([
    getGatewayStatus(),
    getMasterStatus(),
    getDirectBucketInfos(),
  ]);

  let master = directMaster;
  let buckets = directBuckets.buckets;
  let controlPlane: ObjectStorageControlPlaneStatus = {
    source: directMaster.reachable || directBuckets.reachable ? 'direct' : 'unavailable',
    filerReachable: directBuckets.reachable,
    error: directBuckets.reachable ? undefined : directBuckets.error ?? directMaster.error,
  };
  let capacity = buildDirectCapacity(directMaster, directBuckets.buckets);

  if (!directMaster.reachable || !directBuckets.reachable || capacity.source === 'unavailable') {
    try {
      const hostSnapshot = await getHostSnapshot(storagePath);

      if (hostSnapshot.master.reachable) {
        master = hostSnapshot.master;
      }

      if (hostSnapshot.controlPlane.filerReachable || !directBuckets.reachable) {
        buckets = hostSnapshot.buckets;
      }

      if (hostSnapshot.controlPlane.source !== 'unavailable') {
        controlPlane = hostSnapshot.controlPlane;
      }

      if (hostSnapshot.capacity.source !== 'unavailable') {
        capacity = hostSnapshot.capacity;
      }
    } catch (error) {
      if (controlPlane.error == null) {
        controlPlane = {
          ...controlPlane,
          error: error instanceof Error ? error.message : 'host_object_storage_probe_failed',
        };
      }
    }
  }

  return {
    gateway,
    master,
    controlPlane,
    capacity,
    buckets,
  };
}