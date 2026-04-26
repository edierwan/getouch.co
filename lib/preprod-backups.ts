import { spawn } from 'node:child_process';
import path from 'node:path';

export interface PreprodBackupEntry {
  name: string;
  path: string;
  createdAt: string;
  sizeHuman: string;
  hasStorageArchive: boolean;
  isLatest: boolean;
}

export interface PreprodBackupOverview {
  sshTarget: string;
  backupRoot: string;
  latest?: PreprodBackupEntry;
  entries: PreprodBackupEntry[];
  retentionDays: number;
  cronSchedule?: string;
  backupLogTail: string[];
}

const PREPROD_SSH_TARGET = process.env.PREPROD_BACKUP_SSH_TARGET || 'deploy@100.84.14.93';
const PREPROD_BACKUP_ROOT = process.env.PREPROD_BACKUP_ROOT || '/home/deploy/supabase-backups/serapod-preprod';
const PREPROD_BACKUP_SCRIPT =
  process.env.PREPROD_BACKUP_SCRIPT || '/home/deploy/apps/getouch.co/infra/scripts/supabase-backup.sh';
const PREPROD_RESTORE_SCRIPT =
  process.env.PREPROD_RESTORE_SCRIPT || '/home/deploy/apps/getouch.co/infra/scripts/supabase-restore.sh';
const PREPROD_RETENTION_DAYS = Number(process.env.PREPROD_BACKUP_RETENTION_DAYS || '14');

function runRemoteScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', [PREPROD_SSH_TARGET, 'bash', '-s'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

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
        resolve(stdout.trim());
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `ssh exited with code ${code}`));
    });

    child.stdin.end(script);
  });
}

function escapeForSingleQuotes(value: string) {
  return value.replace(/'/g, `'"'"'`);
}

export async function getPreprodBackupOverview(): Promise<PreprodBackupOverview> {
  const root = escapeForSingleQuotes(PREPROD_BACKUP_ROOT);
  const payload = await runRemoteScript(`
set -euo pipefail
export ROOT='${root}'
python3 - <<'PY'
import json
import os
import pathlib
import subprocess

root = pathlib.Path(os.environ['ROOT'])
entries = []
latest = None

try:
    latest_link = root.joinpath('latest').resolve(strict=True)
except Exception:
    latest_link = None

if root.exists():
    for child in sorted(root.iterdir(), reverse=True):
        if not child.is_dir() or not child.name[:2].isdigit():
            continue
        size = subprocess.run(['du', '-sh', str(child)], capture_output=True, text=True, check=False)
        size_human = size.stdout.split()[0] if size.returncode == 0 and size.stdout.strip() else 'unknown'
        entry = {
            'name': child.name,
            'path': str(child),
            'createdAt': child.name,
            'sizeHuman': size_human,
            'hasStorageArchive': child.joinpath('storage-files.tar.gz').exists(),
            'isLatest': latest_link is not None and child.resolve() == latest_link,
        }
        if entry['isLatest']:
            latest = entry
        entries.append(entry)

cron_schedule = None
cron = subprocess.run(['bash', '-lc', 'crontab -l 2>/dev/null || true'], capture_output=True, text=True, check=False)
if cron.stdout:
    for line in cron.stdout.splitlines():
        if 'supabase-backup.sh' in line:
            cron_schedule = line.strip()
            break

backup_log = root.joinpath('backup.log')
log_tail = []
if backup_log.exists():
    with backup_log.open('r', encoding='utf-8', errors='replace') as handle:
        log_tail = [line.rstrip('\\n') for line in handle.readlines()[-10:]]

print(json.dumps({
    'entries': entries,
    'latest': latest,
    'cronSchedule': cron_schedule,
    'backupLogTail': log_tail,
}))
PY
`);

  const parsed = JSON.parse(payload) as {
    entries: PreprodBackupEntry[];
    latest?: PreprodBackupEntry;
    cronSchedule?: string;
    backupLogTail: string[];
  };

  return {
    sshTarget: PREPROD_SSH_TARGET,
    backupRoot: PREPROD_BACKUP_ROOT,
    latest: parsed.latest,
    entries: parsed.entries,
    retentionDays: PREPROD_RETENTION_DAYS,
    cronSchedule: parsed.cronSchedule,
    backupLogTail: parsed.backupLogTail,
  };
}

export async function runPreprodBackupNow(): Promise<{ backupPath: string; backupName: string }> {
  const scriptPath = escapeForSingleQuotes(PREPROD_BACKUP_SCRIPT);
  const latestPath = escapeForSingleQuotes(path.posix.join(PREPROD_BACKUP_ROOT, 'latest'));
  const output = await runRemoteScript(`
set -euo pipefail
'${scriptPath}'
readlink '${latestPath}'
`);

  const lines = output.split('\n').filter(Boolean);
  const backupPath = lines[lines.length - 1]?.trim();
  if (!backupPath) {
    throw new Error('Backup completed but latest backup path was not returned.');
  }

  return {
    backupPath,
    backupName: path.posix.basename(backupPath),
  };
}

export async function queuePreprodRestore(backupPath: string): Promise<{ requestId: string; logPath: string }> {
  const escapedBackupPath = escapeForSingleQuotes(backupPath);
  const restorePath = escapeForSingleQuotes(PREPROD_RESTORE_SCRIPT);
  const root = escapeForSingleQuotes(PREPROD_BACKUP_ROOT);
  const output = await runRemoteScript(`
set -euo pipefail
ROOT='${root}'
request_id="restore-$(date +%Y%m%d-%H%M%S)"
log_path="$ROOT/$request_id.log"
nohup '${restorePath}' --backup-dir '${escapedBackupPath}' --yes > "$log_path" 2>&1 &
echo "$request_id|$log_path"
`);

  const [requestId, logPath] = output.trim().split('|');
  if (!requestId || !logPath) {
    throw new Error('Failed to queue restore job.');
  }

  return { requestId, logPath };
}