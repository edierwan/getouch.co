import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { scheduledRestartLogs, scheduledRestarts } from '@/lib/schema';
import type { SessionPayload } from '@/lib/auth';

const RESTART_TARGET_HOST = process.env.SCHEDULED_RESTART_TARGET_HOST || '100.84.14.93';
const RESTART_TARGET_LABEL = process.env.SCHEDULED_RESTART_TARGET_LABEL || 'Primary VPS';
const RESTART_SSH_TARGET = process.env.SCHEDULED_RESTART_SSH_TARGET || `deploy@${RESTART_TARGET_HOST}`;
const REMOTE_RESTART_DIR = process.env.SCHEDULED_RESTART_REMOTE_DIR || '/home/deploy/.getouch/scheduled-restart';
const REMOTE_STATE_FILE = `${REMOTE_RESTART_DIR}/state.json`;
const REMOTE_HISTORY_FILE = `${REMOTE_RESTART_DIR}/history.log`;
const REMOTE_WRAPPER_FILE = `${REMOTE_RESTART_DIR}/run-scheduled-restart.sh`;

export type RestartScheduleType = 'one-time' | 'daily' | 'weekly';

export type RestartHistoryEntry = {
  id: string;
  createdAt: string;
  source: 'portal' | 'remote';
  status: string;
  eventType: string;
  summary: string;
  actorEmail: string | null;
  details: Record<string, unknown>;
};

export type ScheduledRestartInput = {
  enabled: boolean;
  scheduleType: RestartScheduleType;
  timezone: string;
  oneTimeAt?: string | null;
  dailyTime?: string | null;
  weeklyDay?: number | null;
  weeklyTime?: string | null;
  note?: string | null;
};

export type ScheduledRestartOverview = {
  config: {
    id: string | null;
    targetHost: string;
    targetLabel: string;
    enabled: boolean;
    scheduleType: RestartScheduleType;
    timezone: string;
    oneTimeAt: string | null;
    dailyTime: string | null;
    weeklyDay: number | null;
    weeklyTime: string | null;
    note: string | null;
    nextRunAt: string | null;
    lastAppliedAt: string | null;
    lastAppliedBy: string | null;
    lastRemoteStatus: string | null;
    lastRemoteMessage: string | null;
    lastRemoteSyncAt: string | null;
  };
  server: {
    sshTarget: string;
    timezone: string;
    timezoneOffset: string;
    currentTime: string;
    bootedAt: string | null;
    cronInstalled: boolean;
  };
  latestJobStatus: {
    status: string;
    summary: string;
    createdAt: string | null;
    source: 'portal' | 'remote' | null;
  };
  history: RestartHistoryEntry[];
};

type RemoteOverview = {
  serverTimezone: string;
  serverTimezoneOffset: string;
  currentTime: string;
  bootedAt: string | null;
  cronInstalled: boolean;
  nextRunAt: string | null;
  enabled: boolean;
  lastRemoteStatus: string | null;
  lastRemoteMessage: string | null;
  history: Array<{
    createdAt: string;
    status: string;
    eventType: string;
    summary: string;
    details?: Record<string, unknown>;
  }>;
};

function runRemoteScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', [RESTART_SSH_TARGET, 'bash', '-s'], {
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

function normalizeText(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeTime(value: unknown) {
  const normalized = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeTimezone(value: unknown) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error('Timezone is required');
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized });
  } catch {
    throw new Error('Timezone is invalid');
  }

  return normalized;
}

function parseBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value === 'true';
  }

  return false;
}

export function sanitizeScheduledRestartInput(input: Partial<ScheduledRestartInput>): ScheduledRestartInput {
  const enabled = parseBoolean(input.enabled);
  const scheduleType = (normalizeText(input.scheduleType) as RestartScheduleType | null) || 'daily';
  const timezone = normalizeTimezone(input.timezone || 'Asia/Kuala_Lumpur');
  const note = normalizeText(input.note);
  const oneTimeAt = normalizeText(input.oneTimeAt);
  const dailyTime = normalizeTime(input.dailyTime);
  const weeklyTime = normalizeTime(input.weeklyTime);
  const rawWeeklyDay = input.weeklyDay as number | string | null | undefined;
  const weeklyDay = rawWeeklyDay === null || rawWeeklyDay === undefined || rawWeeklyDay === ''
    ? null
    : Number(rawWeeklyDay);

  if (!['one-time', 'daily', 'weekly'].includes(scheduleType)) {
    throw new Error('Schedule type is invalid');
  }

  if (scheduleType === 'one-time') {
    if (!oneTimeAt) {
      throw new Error('One-time restart date and time is required');
    }

    const parsed = new Date(oneTimeAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('One-time restart date and time is invalid');
    }

    if (enabled && parsed.getTime() <= Date.now()) {
      throw new Error('One-time restart must be scheduled in the future');
    }
  }

  if (scheduleType === 'daily' && !dailyTime && enabled) {
    throw new Error('Daily restart time is required');
  }

  if (scheduleType === 'weekly') {
    if (enabled && (weeklyDay === null || !Number.isInteger(weeklyDay) || weeklyDay < 0 || weeklyDay > 6)) {
      throw new Error('Weekly restart day is required');
    }

    if (enabled && !weeklyTime) {
      throw new Error('Weekly restart time is required');
    }
  }

  return {
    enabled,
    scheduleType,
    timezone,
    oneTimeAt,
    dailyTime,
    weeklyDay,
    weeklyTime,
    note,
  };
}

function encodeRemoteState(payload: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function buildRemoteApplyScript(stateBase64: string) {
  return `
set -euo pipefail

REMOTE_DIR='${REMOTE_RESTART_DIR}'
STATE_FILE='${REMOTE_STATE_FILE}'
WRAPPER_FILE='${REMOTE_WRAPPER_FILE}'
HISTORY_FILE='${REMOTE_HISTORY_FILE}'
MARKER_BEGIN='# GETOUCH_SCHEDULED_RESTART_BEGIN'
MARKER_END='# GETOUCH_SCHEDULED_RESTART_END'
PAYLOAD_B64='${stateBase64}'

mkdir -p "$REMOTE_DIR"

cat > "$WRAPPER_FILE" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

REMOTE_DIR='${REMOTE_RESTART_DIR}'
STATE_FILE='${REMOTE_STATE_FILE}'
HISTORY_FILE='${REMOTE_HISTORY_FILE}'
MARKER_BEGIN='# GETOUCH_SCHEDULED_RESTART_BEGIN'
MARKER_END='# GETOUCH_SCHEDULED_RESTART_END'
EVENT_SOURCE="\${1:-scheduled}"
DRY_RUN="\${2:-0}"

append_history() {
  python3 - "$STATE_FILE" "$HISTORY_FILE" "$EVENT_SOURCE" "$DRY_RUN" "$1" "$2" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone

state_file, history_file, event_source, dry_run, status, summary = sys.argv[1:7]

with open(state_file, 'r', encoding='utf-8') as handle:
    state = json.load(handle)

entry = {
    'createdAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
    'status': status,
    'eventType': 'manual_test' if dry_run == '1' else 'execution_requested',
    'summary': summary,
    'details': {
        'scheduleType': state.get('scheduleType'),
        'timezone': state.get('timezone'),
        'note': state.get('note'),
        'source': event_source,
    },
}

os.makedirs(os.path.dirname(history_file), exist_ok=True)
with open(history_file, 'a', encoding='utf-8') as handle:
    handle.write(json.dumps(entry) + '\n')
PY
}

update_state() {
  python3 - "$STATE_FILE" "$1" "$2" <<'PY'
import json
import sys
from datetime import datetime, timezone

state_file, status, message = sys.argv[1:4]
with open(state_file, 'r', encoding='utf-8') as handle:
    state = json.load(handle)

state['lastRemoteStatus'] = status
state['lastRemoteMessage'] = message
state['lastRemoteSyncAt'] = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

if state.get('scheduleType') == 'one-time' and status in {'reboot-requested', 'reboot-failed'}:
    state['enabled'] = False
    state['nextRunAt'] = None

with open(state_file, 'w', encoding='utf-8') as handle:
    json.dump(state, handle)
PY
}

remove_cron_block() {
  tmpfile=$(mktemp)
  (crontab -l 2>/dev/null || true) | awk -v begin="$MARKER_BEGIN" -v end="$MARKER_END" '
    $0 == begin { skip=1; next }
    $0 == end { skip=0; next }
    !skip { print }
  ' > "$tmpfile"
  crontab "$tmpfile"
  rm -f "$tmpfile"
}

append_history "pending" "Restart job reached host wrapper."

if [[ "$DRY_RUN" = "1" ]]; then
  update_state "dry-run" "Manual dry run completed without reboot."
  append_history "dry-run" "Manual dry run completed without reboot."
  exit 0
fi

schedule_type=$(python3 - "$STATE_FILE" <<'PY'
import json
import sys
with open(sys.argv[1], 'r', encoding='utf-8') as handle:
    state = json.load(handle)
print(state.get('scheduleType') or '')
PY
)

if [[ "$schedule_type" = "one-time" ]]; then
  remove_cron_block
fi

if sudo -n /sbin/shutdown -r now "GetTouch scheduled restart"; then
  update_state "reboot-requested" "Reboot command accepted by the server."
  append_history "success" "Reboot command accepted by the server."
  exit 0
fi

update_state "reboot-failed" "Reboot command was rejected. Check sudoers or system policy."
append_history "failed" "Reboot command was rejected. Check sudoers or system policy."
exit 1
SH

chmod 700 "$WRAPPER_FILE"

python3 - "$STATE_FILE" "$PAYLOAD_B64" <<'PY'
import base64
import json
import sys

state_file, payload_b64 = sys.argv[1:3]
payload = json.loads(base64.b64decode(payload_b64).decode('utf-8'))

with open(state_file, 'w', encoding='utf-8') as handle:
    json.dump(payload, handle)
PY
`;
}

function buildRemoteFinalizeScript() {
  return `
set -euo pipefail

REMOTE_DIR='${REMOTE_RESTART_DIR}'
STATE_FILE='${REMOTE_STATE_FILE}'
WRAPPER_FILE='${REMOTE_WRAPPER_FILE}'
HISTORY_FILE='${REMOTE_HISTORY_FILE}'
MARKER_BEGIN='# GETOUCH_SCHEDULED_RESTART_BEGIN'
MARKER_END='# GETOUCH_SCHEDULED_RESTART_END'

cron_expr=$(python3 - "$STATE_FILE" <<'PY'
import json
import sys
with open(sys.argv[1], 'r', encoding='utf-8') as handle:
    state = json.load(handle)

if not state.get('enabled'):
  print('')
elif state.get('scheduleType') == 'one-time' and state.get('oneTimeAt'):
  date_part, time_part = state['oneTimeAt'].split('T', 1)
  _year, month, day = date_part.split('-')
  hour, minute = time_part[:5].split(':')
  print(f"{int(minute)} {int(hour)} {int(day)} {int(month)} *")
elif state.get('scheduleType') == 'daily' and state.get('dailyTime'):
  hour, minute = state['dailyTime'].split(':')
  print(f"{int(minute)} {int(hour)} * * *")
elif state.get('scheduleType') == 'weekly' and state.get('weeklyTime') is not None and state.get('weeklyDay') is not None:
  hour, minute = state['weeklyTime'].split(':')
  print(f"{int(minute)} {int(hour)} * * {int(state['weeklyDay'])}")
else:
  print('')
PY
)

timezone=$(python3 - "$STATE_FILE" <<'PY'
import json
import sys
with open(sys.argv[1], 'r', encoding='utf-8') as handle:
    state = json.load(handle)
print(state.get('timezone') or 'UTC')
PY
)

enabled=$(python3 - "$STATE_FILE" <<'PY'
import json
import sys
with open(sys.argv[1], 'r', encoding='utf-8') as handle:
    state = json.load(handle)
print('true' if state.get('enabled') else 'false')
PY
)

tmpfile=$(mktemp)
(crontab -l 2>/dev/null || true) | awk -v begin="$MARKER_BEGIN" -v end="$MARKER_END" '
  $0 == begin { skip=1; next }
  $0 == end { skip=0; next }
  !skip { print }
' > "$tmpfile"

if [[ "$enabled" = "true" && -n "$cron_expr" ]]; then
  {
    printf '%s\n' "$MARKER_BEGIN"
    printf 'CRON_TZ=%s\n' "$timezone"
    printf '%s %s >> %s/cron.log 2>&1\n' "$cron_expr" "$WRAPPER_FILE" "$REMOTE_DIR"
    printf '%s\n' "$MARKER_END"
  } >> "$tmpfile"
fi

crontab "$tmpfile"
rm -f "$tmpfile"

python3 - "$STATE_FILE" "$MARKER_BEGIN" <<'PY'
import json
import pathlib
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

state_file, marker_begin = sys.argv[1:3]

with open(state_file, 'r', encoding='utf-8') as handle:
    state = json.load(handle)

def next_run(current_state):
    if not current_state.get('enabled'):
        return None

    timezone_name = current_state.get('timezone') or 'UTC'
    zone = ZoneInfo(timezone_name)
    now_local = datetime.now(zone)
    schedule_type = current_state.get('scheduleType')

    if schedule_type == 'one-time':
        raw = current_state.get('oneTimeAt')
        if not raw:
            return None
        return datetime.fromisoformat(raw.replace('Z', '+00:00')).astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')

    if schedule_type == 'daily':
        hour, minute = [int(part) for part in (current_state.get('dailyTime') or '00:00').split(':')]
        candidate = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if candidate <= now_local:
            candidate += timedelta(days=1)
        return candidate.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')

    if schedule_type == 'weekly':
        hour, minute = [int(part) for part in (current_state.get('weeklyTime') or '00:00').split(':')]
        target_day = (int(current_state.get('weeklyDay') or 0) + 6) % 7
        candidate = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0)
        days_ahead = (target_day - candidate.weekday()) % 7
        if days_ahead == 0 and candidate <= now_local:
            days_ahead = 7
        candidate += timedelta(days=days_ahead)
        return candidate.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')

    return None

cron_listing = subprocess.run(['bash', '-lc', 'crontab -l 2>/dev/null || true'], capture_output=True, text=True, check=False)
cron_installed = marker_begin in (cron_listing.stdout or '')

history_file = pathlib.Path('${REMOTE_HISTORY_FILE}')
history = []
if history_file.exists():
    for line in history_file.read_text(encoding='utf-8', errors='replace').splitlines()[-25:]:
        line = line.strip()
        if not line:
            continue
        try:
            history.append(json.loads(line))
        except Exception:
            history.append({
                'createdAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
                'status': 'warning',
                'eventType': 'log_parse',
                'summary': line,
                'details': {},
            })

booted_at = None
boot_info = subprocess.run(['bash', '-lc', 'uptime -s 2>/dev/null || true'], capture_output=True, text=True, check=False)
if boot_info.stdout.strip():
    try:
        zone = ZoneInfo(subprocess.run(['bash', '-lc', "timedatectl show --value -p Timezone 2>/dev/null || cat /etc/timezone 2>/dev/null || echo UTC"], capture_output=True, text=True, check=False).stdout.strip() or 'UTC')
        booted_at = datetime.fromisoformat(boot_info.stdout.strip().replace(' ', 'T')).replace(tzinfo=zone).astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
    except Exception:
        booted_at = None

server_tz = subprocess.run(['bash', '-lc', "timedatectl show --value -p Timezone 2>/dev/null || cat /etc/timezone 2>/dev/null || echo UTC"], capture_output=True, text=True, check=False).stdout.strip() or 'UTC'
server_offset = datetime.now(ZoneInfo(server_tz)).strftime('%z')
current_time = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
state['nextRunAt'] = next_run(state)
state['lastRemoteSyncAt'] = current_time

with open(state_file, 'w', encoding='utf-8') as handle:
    json.dump(state, handle)

print(json.dumps({
    'serverTimezone': server_tz,
    'serverTimezoneOffset': server_offset,
    'currentTime': current_time,
    'bootedAt': booted_at,
    'cronInstalled': cron_installed,
    'nextRunAt': state.get('nextRunAt'),
    'enabled': state.get('enabled', False),
    'lastRemoteStatus': state.get('lastRemoteStatus'),
    'lastRemoteMessage': state.get('lastRemoteMessage'),
    'history': history,
}))
PY
`;
}

function buildRemoteOverviewScript() {
  return `
set -euo pipefail

mkdir -p '${REMOTE_RESTART_DIR}'

if [[ ! -f '${REMOTE_STATE_FILE}' ]]; then
  cat > '${REMOTE_STATE_FILE}' <<'JSON'
{"enabled": false, "scheduleType": "daily", "timezone": "UTC", "nextRunAt": null, "lastRemoteStatus": null, "lastRemoteMessage": null}
JSON
fi

${buildRemoteFinalizeScript()}
`;
}

async function applyRemoteSchedule(input: ScheduledRestartInput) {
  const state = {
    enabled: input.enabled,
    scheduleType: input.scheduleType,
    timezone: input.timezone,
    oneTimeAt: input.oneTimeAt,
    dailyTime: input.dailyTime,
    weeklyDay: input.weeklyDay,
    weeklyTime: input.weeklyTime,
    note: input.note,
    lastRemoteStatus: input.enabled ? 'scheduled' : 'disabled',
    lastRemoteMessage: input.enabled ? 'Restart schedule saved to host cron.' : 'Restart schedule disabled on host cron.',
    lastRemoteSyncAt: new Date().toISOString(),
  } satisfies Record<string, unknown>;

  const initialScript = buildRemoteApplyScript(encodeRemoteState(state));
  await runRemoteScript(initialScript);

  const payload = await runRemoteScript(buildRemoteOverviewScript());
  return JSON.parse(payload) as RemoteOverview;
}

async function getRemoteOverview() {
  const payload = await runRemoteScript(buildRemoteOverviewScript());
  return JSON.parse(payload) as RemoteOverview;
}

async function runRemoteDryTest() {
  const payload = await runRemoteScript(`
set -euo pipefail
if [[ ! -x '${REMOTE_WRAPPER_FILE}' ]]; then
  echo '{"error":"Remote restart wrapper is not installed yet."}'
  exit 1
fi
'${REMOTE_WRAPPER_FILE}' manual-test 1
${buildRemoteOverviewScript()}
`);

  return JSON.parse(payload) as RemoteOverview;
}

function mapConfigRecord(record: typeof scheduledRestarts.$inferSelect | null) {
  return {
    id: record?.id || null,
    targetHost: record?.targetHost || RESTART_TARGET_HOST,
    targetLabel: record?.targetLabel || RESTART_TARGET_LABEL,
    enabled: record?.enabled ?? false,
    scheduleType: (record?.scheduleType || 'daily') as RestartScheduleType,
    timezone: record?.timezone || 'Asia/Kuala_Lumpur',
    oneTimeAt: record?.oneTimeAt ? record.oneTimeAt.toISOString() : null,
    dailyTime: record?.dailyTime || null,
    weeklyDay: record?.weeklyDay ?? null,
    weeklyTime: record?.weeklyTime || null,
    note: record?.note || null,
    nextRunAt: record?.nextRunAt ? record.nextRunAt.toISOString() : null,
    lastAppliedAt: record?.lastAppliedAt ? record.lastAppliedAt.toISOString() : null,
    lastAppliedBy: record?.lastAppliedBy || null,
    lastRemoteStatus: record?.lastRemoteStatus || null,
    lastRemoteMessage: record?.lastRemoteMessage || null,
    lastRemoteSyncAt: record?.lastRemoteSyncAt ? record.lastRemoteSyncAt.toISOString() : null,
  };
}

async function getRestartRecord() {
  const rows = await db.select().from(scheduledRestarts).where(eq(scheduledRestarts.targetHost, RESTART_TARGET_HOST)).limit(1);
  return rows[0] ?? null;
}

async function writeRestartLog(recordId: string | null, event: Omit<typeof scheduledRestartLogs.$inferInsert, 'restartId' | 'targetHost'>) {
  await db.insert(scheduledRestartLogs).values({
    restartId: recordId,
    targetHost: RESTART_TARGET_HOST,
    ...event,
  });
}

function mergeHistory(
  dbLogs: Array<typeof scheduledRestartLogs.$inferSelect>,
  remoteHistory: RemoteOverview['history'],
): RestartHistoryEntry[] {
  const mappedDb = dbLogs.map((entry) => ({
    id: entry.id,
    createdAt: entry.createdAt.toISOString(),
    source: 'portal' as const,
    status: entry.status,
    eventType: entry.eventType,
    summary: entry.summary,
    actorEmail: entry.actorEmail || null,
    details: (entry.details as Record<string, unknown>) || {},
  }));

  const mappedRemote = remoteHistory.map((entry, index) => ({
    id: `remote-${index}-${entry.createdAt}`,
    createdAt: entry.createdAt,
    source: 'remote' as const,
    status: entry.status,
    eventType: entry.eventType,
    summary: entry.summary,
    actorEmail: null,
    details: entry.details || {},
  }));

  return [...mappedDb, ...mappedRemote].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getScheduledRestartOverview(): Promise<ScheduledRestartOverview> {
  const [record, remoteOverview, dbLogs] = await Promise.all([
    getRestartRecord(),
    getRemoteOverview(),
    db.select().from(scheduledRestartLogs).where(eq(scheduledRestartLogs.targetHost, RESTART_TARGET_HOST)).orderBy(desc(scheduledRestartLogs.createdAt)).limit(20),
  ]);

  if (record) {
    await db
      .update(scheduledRestarts)
      .set({
        nextRunAt: remoteOverview.nextRunAt ? new Date(remoteOverview.nextRunAt) : null,
        lastRemoteStatus: remoteOverview.lastRemoteStatus,
        lastRemoteMessage: remoteOverview.lastRemoteMessage,
        lastRemoteSyncAt: new Date(remoteOverview.currentTime),
        enabled: remoteOverview.enabled,
        updatedAt: new Date(),
      })
      .where(eq(scheduledRestarts.id, record.id));
  }

  const mergedHistory = mergeHistory(dbLogs, remoteOverview.history);
  const latest = mergedHistory[0];

  return {
    config: {
      ...mapConfigRecord(record),
      enabled: record ? remoteOverview.enabled : false,
      nextRunAt: remoteOverview.nextRunAt,
      lastRemoteStatus: remoteOverview.lastRemoteStatus,
      lastRemoteMessage: remoteOverview.lastRemoteMessage,
      lastRemoteSyncAt: remoteOverview.currentTime,
    },
    server: {
      sshTarget: RESTART_SSH_TARGET,
      timezone: remoteOverview.serverTimezone,
      timezoneOffset: remoteOverview.serverTimezoneOffset,
      currentTime: remoteOverview.currentTime,
      bootedAt: remoteOverview.bootedAt,
      cronInstalled: remoteOverview.cronInstalled,
    },
    latestJobStatus: {
      status: latest?.status || 'idle',
      summary: latest?.summary || 'No restart activity recorded yet.',
      createdAt: latest?.createdAt || null,
      source: latest?.source || null,
    },
    history: mergedHistory,
  };
}

export async function saveScheduledRestart(input: Partial<ScheduledRestartInput>, session: SessionPayload) {
  const sanitized = sanitizeScheduledRestartInput(input);
  const remote = await applyRemoteSchedule(sanitized);
  const existing = await getRestartRecord();

  const values = {
    targetHost: RESTART_TARGET_HOST,
    targetLabel: RESTART_TARGET_LABEL,
    enabled: remote.enabled,
    scheduleType: sanitized.scheduleType,
    timezone: sanitized.timezone,
    oneTimeAt: sanitized.oneTimeAt ? new Date(sanitized.oneTimeAt) : null,
    dailyTime: sanitized.dailyTime,
    weeklyDay: sanitized.weeklyDay,
    weeklyTime: sanitized.weeklyTime,
    note: sanitized.note,
    nextRunAt: remote.nextRunAt ? new Date(remote.nextRunAt) : null,
    lastAppliedAt: new Date(),
    lastAppliedBy: session.email,
    lastRemoteStatus: remote.lastRemoteStatus,
    lastRemoteMessage: remote.lastRemoteMessage,
    lastRemoteSyncAt: new Date(remote.currentTime),
    metadata: {},
    updatedAt: new Date(),
  };

  let recordId: string;
  if (existing) {
    const rows = await db.update(scheduledRestarts).set(values).where(eq(scheduledRestarts.id, existing.id)).returning({ id: scheduledRestarts.id });
    recordId = rows[0].id;
  } else {
    const rows = await db.insert(scheduledRestarts).values(values).returning({ id: scheduledRestarts.id });
    recordId = rows[0].id;
  }

  await writeRestartLog(recordId, {
    eventType: sanitized.enabled ? 'schedule_saved' : 'schedule_disabled',
    status: sanitized.enabled ? 'success' : 'disabled',
    summary: sanitized.enabled
      ? `Scheduled ${sanitized.scheduleType} restart saved for ${RESTART_TARGET_LABEL}.`
      : `Scheduled restart disabled for ${RESTART_TARGET_LABEL}.`,
    details: {
      scheduleType: sanitized.scheduleType,
      timezone: sanitized.timezone,
      oneTimeAt: sanitized.oneTimeAt,
      dailyTime: sanitized.dailyTime,
      weeklyDay: sanitized.weeklyDay,
      weeklyTime: sanitized.weeklyTime,
      nextRunAt: remote.nextRunAt,
      note: sanitized.note,
    },
    actorEmail: session.email,
    source: 'portal',
  });

  return getScheduledRestartOverview();
}

export async function runScheduledRestartDryTest(session: SessionPayload) {
  const existing = await getRestartRecord();
  if (!existing) {
    throw new Error('Save a restart schedule first so the remote runner can be installed.');
  }

  const remote = await runRemoteDryTest();
  await db
    .update(scheduledRestarts)
    .set({
      lastRemoteStatus: 'dry-run',
      lastRemoteMessage: 'Manual dry run completed without reboot.',
      lastRemoteSyncAt: new Date(remote.currentTime),
      updatedAt: new Date(),
    })
    .where(eq(scheduledRestarts.id, existing.id));

  await writeRestartLog(existing.id, {
    eventType: 'manual_test',
    status: 'dry-run',
    summary: `Dry-run executed for ${RESTART_TARGET_LABEL}. No reboot was triggered.`,
    details: {
      serverTime: remote.currentTime,
      serverTimezone: remote.serverTimezone,
    },
    actorEmail: session.email,
    source: 'portal',
  });

  return getScheduledRestartOverview();
}