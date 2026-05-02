import { spawn } from 'node:child_process';

const INFRA_SSH_TARGET = process.env.INFRA_METRICS_SSH_TARGET
  || process.env.SHUTDOWN_DIAGNOSTIC_SSH_TARGET
  || 'deploy@100.84.14.93';

const SSH_KEY_PATH = process.env.INFRA_METRICS_SSH_KEY_PATH || '/home/nextjs/.ssh/id_ed25519';
const SSH_KNOWN_HOSTS_PATH = process.env.INFRA_METRICS_SSH_KNOWN_HOSTS_PATH || '/home/nextjs/.ssh/known_hosts';
const SUPPORTED_STORAGE_FS = new Set(['ext4', 'xfs', 'btrfs', 'zfs']);
const PREFERRED_STORAGE_TARGETS = ['/', '/srv', '/srv/archive'];

type FindmntFilesystem = {
  source?: string;
  target?: string;
  fstype?: string;
  size?: number | string;
  used?: number | string;
  avail?: number | string;
  children?: FindmntFilesystem[];
};

type FindmntPayload = {
  filesystems?: FindmntFilesystem[];
};

type LsblkDevice = {
  name?: string;
  path?: string;
  pkname?: string | null;
  type?: string;
  tran?: string | null;
  model?: string | null;
  size?: number | string;
  children?: LsblkDevice[];
};

type LsblkPayload = {
  blockdevices?: LsblkDevice[];
};

type StorageDevice = {
  name: string;
  path: string;
  type: string;
  pkname: string | null;
  transport: string | null;
  model: string | null;
  sizeBytes: number;
};

export type InfrastructureStorageVolume = {
  id: string;
  name: string;
  mountPoint: string;
  filesystem: string;
  device: string;
  backingDevice: string | null;
  totalBytes: number;
  physicalTotalBytes: number | null;
  usedBytes: number;
  availableBytes: number;
  percentUsed: number;
  transport: string | null;
  deviceModel: string | null;
  descriptor: string;
};

export type InfrastructureStorageSnapshot = {
  available: boolean;
  collectedAt: string;
  volumes: InfrastructureStorageVolume[];
  total: {
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
    percentUsed: number;
  };
  error?: string;
};

export type InfrastructureGpuProcess = {
  pid: number | null;
  name: string;
  memoryUsedMiB: number | null;
};

export type InfrastructureGpuDevice = {
  index: number | null;
  name: string;
  utilizationPercent: number | null;
  memoryUsedMiB: number | null;
  memoryTotalMiB: number | null;
  memoryPercent: number | null;
  powerDrawWatts: number | null;
  temperatureC: number | null;
};

export type InfrastructureNodeSnapshot = {
  available: boolean;
  collectedAt: string;
  uptime: string | null;
  loadAverage1m: number | null;
  memory: {
    totalBytes: number | null;
    usedBytes: number | null;
    percentUsed: number | null;
  };
  containers: {
    running: number | null;
  };
  gpu: {
    available: boolean;
    devices: InfrastructureGpuDevice[];
    processes: InfrastructureGpuProcess[];
    error?: string;
  };
  error?: string;
};

type RemoteInfrastructureGpuProcess = Partial<InfrastructureGpuProcess>;

type RemoteInfrastructureGpuDevice = Partial<InfrastructureGpuDevice>;

type RemoteInfrastructureNodeSnapshot = {
  collectedAt?: string;
  uptime?: string | null;
  loadAverage1m?: number | null;
  memory?: {
    totalBytes?: number | null;
    usedBytes?: number | null;
    percentUsed?: number | null;
  };
  containers?: {
    running?: number | null;
  };
  gpu?: {
    available?: boolean;
    devices?: RemoteInfrastructureGpuDevice[];
    processes?: RemoteInfrastructureGpuProcess[];
    error?: string;
  };
};

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
      }
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

function buildRemoteScript() {
  return String.raw`
set -euo pipefail

echo '__FINDMNT__'
findmnt -J -b -o SOURCE,TARGET,FSTYPE,SIZE,USED,AVAIL

echo '__LSBLK__'
lsblk -J -b -o NAME,PATH,PKNAME,TYPE,TRAN,MODEL,SIZE,MOUNTPOINTS
`;
}

function buildNodeRemoteScript() {
  return String.raw`
set -euo pipefail

python3 - <<'PY'
import json
import subprocess
from datetime import datetime, timezone


def run(cmd: str):
  completed = subprocess.run(cmd, shell=True, text=True, capture_output=True)
  return completed.returncode, completed.stdout.strip(), completed.stderr.strip()


def parse_number(value: str):
  try:
    return float(value)
  except (TypeError, ValueError):
    return None


status = {
  'collectedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
  'uptime': None,
  'loadAverage1m': None,
  'memory': {
    'totalBytes': None,
    'usedBytes': None,
    'percentUsed': None,
  },
  'containers': {
    'running': None,
  },
  'gpu': {
    'available': False,
    'devices': [],
    'processes': [],
  },
}

rc, out, _err = run('uptime -p')
if rc == 0 and out:
  status['uptime'] = out.replace('up ', '', 1)

rc, out, _err = run('cat /proc/loadavg')
if rc == 0 and out:
  parts = out.split()
  if parts:
    status['loadAverage1m'] = parse_number(parts[0])

rc, out, _err = run('free -b')
if rc == 0 and out:
  lines = [line for line in out.splitlines() if line.strip()]
  if len(lines) >= 2:
    parts = lines[1].split()
    if len(parts) >= 3:
      total = parse_number(parts[1])
      used = parse_number(parts[2])
      status['memory']['totalBytes'] = total
      status['memory']['usedBytes'] = used
      if total and total > 0 and used is not None:
        status['memory']['percentUsed'] = round((used / total) * 100, 1)

rc, out, _err = run("docker ps --format '{{.ID}}'")
if rc == 0:
  status['containers']['running'] = len([line for line in out.splitlines() if line.strip()])

gpu_query = 'nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,power.draw,temperature.gpu --format=csv,noheader,nounits'
rc, out, err = run(gpu_query)
if rc == 0 and out:
  devices = []
  for line in out.splitlines():
    parts = [part.strip() for part in line.split(',')]
    if len(parts) < 7:
      continue
    memory_used = parse_number(parts[3])
    memory_total = parse_number(parts[4])
    memory_percent = None
    if memory_used is not None and memory_total and memory_total > 0:
      memory_percent = round((memory_used / memory_total) * 100, 1)
    devices.append({
      'index': int(parts[0]) if parts[0].isdigit() else None,
      'name': parts[1],
      'utilizationPercent': parse_number(parts[2]),
      'memoryUsedMiB': memory_used,
      'memoryTotalMiB': memory_total,
      'memoryPercent': memory_percent,
      'powerDrawWatts': parse_number(parts[5]),
      'temperatureC': parse_number(parts[6]),
    })
  status['gpu']['devices'] = devices
  status['gpu']['available'] = len(devices) > 0
else:
  status['gpu']['error'] = err or 'nvidia-smi unavailable'

proc_query = 'nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits'
rc, out, _err = run(proc_query)
if rc == 0 and out:
  processes = []
  for line in out.splitlines():
    parts = [part.strip() for part in line.split(',')]
    if len(parts) < 3:
      continue
    processes.append({
      'pid': int(parts[0]) if parts[0].isdigit() else None,
      'name': parts[1],
      'memoryUsedMiB': parse_number(parts[2]),
    })
  processes.sort(key=lambda item: item.get('memoryUsedMiB') or 0, reverse=True)
  status['gpu']['processes'] = processes

print(json.dumps(status))
PY
`;
}

function extractSection(raw: string, marker: string, nextMarker?: string) {
  const start = raw.indexOf(marker);
  if (start < 0) return '';

  const sliceStart = start + marker.length;
  const sliceEnd = nextMarker ? raw.indexOf(nextMarker, sliceStart) : raw.length;
  return raw.slice(sliceStart, sliceEnd >= 0 ? sliceEnd : raw.length).trim();
}

function toNumber(value: number | string | undefined) {
  if (typeof value === 'number') return value;
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function flattenFilesystems(filesystems: FindmntFilesystem[] | undefined) {
  const flattened: FindmntFilesystem[] = [];

  const visit = (filesystem: FindmntFilesystem) => {
    flattened.push(filesystem);

    for (const child of filesystem.children || []) {
      visit(child);
    }
  };

  for (const filesystem of filesystems || []) {
    visit(filesystem);
  }

  return flattened;
}

function buildDeviceIndex(devices: LsblkDevice[] | undefined) {
  const index = new Map<string, StorageDevice>();

  const visit = (device: LsblkDevice) => {
    const record: StorageDevice = {
      name: device.name || '',
      path: device.path || '',
      type: device.type || '',
      pkname: device.pkname || null,
      transport: device.tran || null,
      model: device.model || null,
      sizeBytes: toNumber(device.size),
    };

    if (record.name) index.set(record.name, record);
    if (record.path) index.set(record.path, record);

    for (const child of device.children || []) {
      visit(child);
    }
  };

  for (const device of devices || []) {
    visit(device);
  }

  return index;
}

function resolveBackingDisk(source: string, deviceIndex: Map<string, StorageDevice>) {
  let current = deviceIndex.get(source) || deviceIndex.get(source.replace('/dev/', ''));

  while (current && current.type !== 'disk' && current.pkname) {
    current = deviceIndex.get(current.pkname) || deviceIndex.get(`/dev/${current.pkname}`);
  }

  return current?.type === 'disk' ? current : null;
}

function preferredStorageTargets(filesystems: FindmntFilesystem[]) {
  const candidates = flattenFilesystems(filesystems).filter((filesystem) => {
    const target = filesystem.target || '';
    return (
      (target === '/' || target.startsWith('/srv'))
      && SUPPORTED_STORAGE_FS.has(filesystem.fstype || '')
      && toNumber(filesystem.size) > 0
    );
  });

  const explicitTargets = PREFERRED_STORAGE_TARGETS
    .map((target) => candidates.find((filesystem) => filesystem.target === target))
    .filter((filesystem): filesystem is FindmntFilesystem => Boolean(filesystem));

  if (explicitTargets.length) {
    return explicitTargets;
  }

  // Fall back to the largest supported filesystems when explicit targets differ.
  return [...candidates]
    .sort((left, right) => toNumber(right.size) - toNumber(left.size))
    .slice(0, 3)
    .sort((left, right) => (left.target || '').localeCompare(right.target || ''));
}

function buildStorageName(target: string, transport: string | null, index: number) {
  const label = target === '/'
    ? 'System Root'
    : target === '/srv'
      ? 'Primary Services'
      : target === '/srv/archive'
        ? 'Archive Storage'
        : `Storage ${index + 1}`;
  const transportLabel = transport ? transport.toUpperCase() : '';
  return transportLabel ? `${label} (${transportLabel})` : label;
}

function buildDescriptor(target: string, device: StorageDevice | null) {
  if (target === '/') {
    return device?.model ? `${target} · system filesystem on ${device.model}` : `${target} · system filesystem`;
  }

  if (target === '/srv/archive') {
    return device?.model ? `${target} · archive filesystem on ${device.model}` : `${target} · archive filesystem`;
  }

  if (target === '/srv') {
    return device?.model ? `${target} · primary services filesystem on ${device.model}` : `${target} · primary services filesystem`;
  }

  return device?.model ? `${target} · filesystem on ${device.model}` : target;
}

function emptySnapshot(error?: string): InfrastructureStorageSnapshot {
  return {
    available: false,
    collectedAt: new Date().toISOString(),
    volumes: [],
    total: {
      totalBytes: 0,
      usedBytes: 0,
      availableBytes: 0,
      percentUsed: 0,
    },
    error,
  };
}

function emptyNodeSnapshot(error?: string): InfrastructureNodeSnapshot {
  return {
    available: false,
    collectedAt: new Date().toISOString(),
    uptime: null,
    loadAverage1m: null,
    memory: {
      totalBytes: null,
      usedBytes: null,
      percentUsed: null,
    },
    containers: {
      running: null,
    },
    gpu: {
      available: false,
      devices: [],
      processes: [],
      error,
    },
    error,
  };
}

export async function getInfrastructureStorageSnapshot(): Promise<InfrastructureStorageSnapshot> {
  try {
    const raw = await runRemoteScript(buildRemoteScript());
    const findmntJson = extractSection(raw, '__FINDMNT__\n', '\n__LSBLK__');
    const lsblkJson = extractSection(raw, '__LSBLK__\n');

    const findmnt = JSON.parse(findmntJson) as FindmntPayload;
    const lsblk = JSON.parse(lsblkJson) as LsblkPayload;
    const selected = preferredStorageTargets(findmnt.filesystems || []);
    const deviceIndex = buildDeviceIndex(lsblk.blockdevices);

    const volumes = selected.map((filesystem, index) => {
      const target = filesystem.target || `storage-${index + 1}`;
      const source = filesystem.source || 'unknown';
      const totalBytes = toNumber(filesystem.size);
      const usedBytes = toNumber(filesystem.used);
      const availableBytes = toNumber(filesystem.avail);
      const percentUsed = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
      const backingDisk = resolveBackingDisk(source, deviceIndex);
      const transport = backingDisk?.transport || null;

      return {
        id: target,
        name: buildStorageName(target, transport, index),
        mountPoint: target,
        filesystem: filesystem.fstype || 'unknown',
        device: source,
        backingDevice: backingDisk?.path || null,
        totalBytes,
        physicalTotalBytes: backingDisk?.sizeBytes || null,
        usedBytes,
        availableBytes,
        percentUsed,
        transport,
        deviceModel: backingDisk?.model || null,
        descriptor: buildDescriptor(target, backingDisk || null),
      } satisfies InfrastructureStorageVolume;
    });

    if (!volumes.length) {
      return emptySnapshot('No eligible storage mounts were detected from the runtime host.');
    }

    const totalBytes = volumes.reduce((sum, volume) => sum + volume.totalBytes, 0);
    const usedBytes = volumes.reduce((sum, volume) => sum + volume.usedBytes, 0);
    const availableBytes = volumes.reduce((sum, volume) => sum + volume.availableBytes, 0);

    return {
      available: true,
      collectedAt: new Date().toISOString(),
      volumes,
      total: {
        totalBytes,
        usedBytes,
        availableBytes,
        percentUsed: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to collect infrastructure storage metrics';
    return emptySnapshot(message);
  }
}

export async function getInfrastructureNodeSnapshot(): Promise<InfrastructureNodeSnapshot> {
  try {
    const raw = await runRemoteScript(buildNodeRemoteScript());
    const parsed = JSON.parse(raw) as RemoteInfrastructureNodeSnapshot;
    const devices = (parsed.gpu?.devices || []).map((device) => {
      const memoryUsedMiB = toOptionalNumber(device.memoryUsedMiB);
      const memoryTotalMiB = toOptionalNumber(device.memoryTotalMiB);
      const memoryPercent = toOptionalNumber(device.memoryPercent)
        ?? (memoryUsedMiB !== null && memoryTotalMiB && memoryTotalMiB > 0
          ? (memoryUsedMiB / memoryTotalMiB) * 100
          : null);

      return {
        index: toOptionalNumber(device.index),
        name: device.name || 'Unknown GPU',
        utilizationPercent: toOptionalNumber(device.utilizationPercent),
        memoryUsedMiB,
        memoryTotalMiB,
        memoryPercent,
        powerDrawWatts: toOptionalNumber(device.powerDrawWatts),
        temperatureC: toOptionalNumber(device.temperatureC),
      } satisfies InfrastructureGpuDevice;
    });

    const processes = (parsed.gpu?.processes || []).map((process) => ({
      pid: toOptionalNumber(process.pid),
      name: process.name || 'Unknown process',
      memoryUsedMiB: toOptionalNumber(process.memoryUsedMiB),
    } satisfies InfrastructureGpuProcess));

    return {
      available: true,
      collectedAt: parsed.collectedAt || new Date().toISOString(),
      uptime: parsed.uptime || null,
      loadAverage1m: toOptionalNumber(parsed.loadAverage1m),
      memory: {
        totalBytes: toOptionalNumber(parsed.memory?.totalBytes),
        usedBytes: toOptionalNumber(parsed.memory?.usedBytes),
        percentUsed: toOptionalNumber(parsed.memory?.percentUsed),
      },
      containers: {
        running: toOptionalNumber(parsed.containers?.running),
      },
      gpu: {
        available: Boolean(parsed.gpu?.available && devices.length > 0),
        devices,
        processes,
        error: parsed.gpu?.error,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to collect infrastructure node telemetry';
    return emptyNodeSnapshot(message);
  }
}