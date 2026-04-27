import { spawn } from 'node:child_process';

const INFRA_SSH_TARGET = process.env.INFRA_METRICS_SSH_TARGET
  || process.env.SHUTDOWN_DIAGNOSTIC_SSH_TARGET
  || process.env.SCHEDULED_RESTART_SSH_TARGET
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