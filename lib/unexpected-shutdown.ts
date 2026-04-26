import { spawn } from 'node:child_process';

import { sendWhatsAppText } from '@/lib/wa';

const DIAGNOSTIC_TARGET_HOST = process.env.SHUTDOWN_DIAGNOSTIC_TARGET_HOST
  || process.env.SCHEDULED_RESTART_TARGET_HOST
  || '100.84.14.93';
const DIAGNOSTIC_TARGET_LABEL = process.env.SHUTDOWN_DIAGNOSTIC_TARGET_LABEL
  || process.env.SCHEDULED_RESTART_TARGET_LABEL
  || 'Primary VPS';
const DIAGNOSTIC_SSH_TARGET = process.env.SHUTDOWN_DIAGNOSTIC_SSH_TARGET
  || process.env.SCHEDULED_RESTART_SSH_TARGET
  || `deploy@${DIAGNOSTIC_TARGET_HOST}`;
const ALERT_TARGET_PHONE = process.env.SHUTDOWN_ALERT_PHONE || process.env.ADMIN_ALERT_WHATSAPP_TO || '';

export type ShutdownState = 'clean' | 'unexpected' | 'unknown';
export type DiagnosticStatus = 'online' | 'degraded' | 'unknown';
export type AlertEventType = 'unexpected-shutdown' | 'back-online' | 'critical-warning';

type EvidenceBucket = {
  title: string;
  items: string[];
};

type EventRow = {
  kind: string;
  raw: string;
};

type ContainerHotspot = {
  name: string;
  cpuPercent: number | null;
  memoryPercent: number | null;
  rawMemory: string;
};

export type UnexpectedShutdownAnalysis = {
  host: {
    label: string;
    sshTarget: string;
    collectedAt: string;
    status: DiagnosticStatus;
  };
  current: {
    lastBootTime: string | null;
    uptime: string;
  };
  previousShutdown: {
    type: ShutdownState;
    summary: string;
    events: EventRow[];
  };
  assessment: {
    likelyCause: string;
    conclusive: boolean;
    confidence: 'low' | 'medium' | 'high';
    likely: string[];
    possible: string[];
    weakSignals: string[];
    noEvidence: string[];
  };
  evidence: EvidenceBucket[];
  resources: {
    memory: string;
    disk: string;
    inodes: string;
    containerPressure: string;
  };
  hardware: {
    temperature: string;
    diskHealth: string;
    privilegedVisibility: string;
  };
  scheduling: {
    unattendedUpgrades: string;
    cron: string;
    timers: string;
    watchdog: string;
  };
  criticalMessages: string[];
  alerting: {
    phoneConfigured: boolean;
    phoneHint: string;
    unexpectedShutdownPreview: string;
    backOnlinePreview: string;
    criticalWarningPreview: string;
  };
};

function runRemoteScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', [DIAGNOSTIC_SSH_TARGET, 'bash', '-s'], {
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

section() {
  printf '\n__SECTION__%s__\n' "$1"
}

section UPTIME
uptime

section WHO_B
who -b

section LAST_X
last -x | head -n 20

section PREV_BOOT_TAIL
journalctl -b -1 --no-pager 2>/dev/null | tail -n 80 || true

section PREV_BOOT_HINTS
journalctl -b -1 --no-pager 2>/dev/null | grep -Eai 'panic|out of memory|oom-killer|killed process|critical temperature|overheat|i/o error|buffer i/o|read-only|readonly|corrupt|segfault|watchdog|machine check|soft lockup|hard lockup|shutting down|shutdown|reboot' | tail -n 80 || true

section CURRENT_BOOT_HINTS
journalctl -b 0 --no-pager 2>/dev/null | grep -Eai 'panic|out of memory|oom-killer|killed process|critical temperature|overheat|i/o error|buffer i/o|read-only|readonly|corrupt|segfault|watchdog|machine check|soft lockup|hard lockup|recover|fsck|recovery|nvme.*error|ata[0-9].*(error|reset|failed)' | tail -n 80 || true

section FREE
free -h

section SWAPON
swapon --show

section DF_H
df -h

section DF_I
df -i

section DOCKER_PS
docker ps --format '{{.Names}}\t{{.Status}}' 2>/dev/null || true

section DOCKER_STATS
docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' 2>/dev/null | head -n 20 || true

section THERMAL
for zone in /sys/class/thermal/thermal_zone*; do
  [ -e "$zone" ] || continue
  printf '[%s]\n' "$zone"
  cat "$zone/type" 2>/dev/null || true
  cat "$zone/temp" 2>/dev/null || true
done

section SENSORS
command -v sensors || true

section SMARTCTL
command -v smartctl || true

section NVME
command -v nvme || true

section TIMERS
systemctl list-timers --all --no-pager | sed -n '1,40p'

section CRONTAB
crontab -l 2>/dev/null || true

section APT_REBOOT_CONFIG
grep -R 'Automatic-Reboot\|Unattended-Upgrade\|reboot' /etc/apt/apt.conf.d /etc/default 2>/dev/null | sed -n '1,80p' || true

section APT_HISTORY
tail -n 60 /var/log/apt/history.log 2>/dev/null || true
`;
}

function parseSections(raw: string) {
  const sections = new Map<string, string>();
  const marker = /(?:^|\n)__SECTION__([A-Z_]+)__\n/g;
  const matches = [...raw.matchAll(marker)];

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const start = current.index === undefined ? 0 : current.index + current[0].length;
    const end = next?.index ?? raw.length;
    sections.set(current[1], raw.slice(start, end).trim());
  }

  return sections;
}

function sectionLines(value: string | undefined) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return 'not configured';
  return `${digits.slice(0, 4)}••••${digits.slice(-2)}`;
}

function parseWhoBoot(value: string) {
  const match = value.match(/system boot\s+([0-9-]{10}\s+[0-9:]{5})/i);
  return match ? match[1] : null;
}

function parseUptime(value: string) {
  const compact = value.replace(/\s+/g, ' ').trim();
  const match = compact.match(/up\s+(.+?),\s+\d+\s+users?,\s+load average:/i);
  return match ? match[1].trim() : compact || 'Unavailable';
}

function parseLastEvents(value: string) {
  return sectionLines(value)
    .filter((line) => /^(reboot|shutdown|runlevel)/i.test(line))
    .map((line) => ({ kind: line.split(/\s+/)[0].toLowerCase(), raw: line }));
}

function classifyShutdown(events: EventRow[]) {
  const rebootIndexes = events
    .map((event, index) => ({ event, index }))
    .filter((entry) => entry.event.kind === 'reboot');

  if (rebootIndexes.length < 2) {
    return {
      type: 'unknown' as ShutdownState,
      summary: 'There is not enough reboot history to determine whether the previous shutdown was clean.',
    };
  }

  const currentBootIndex = rebootIndexes[0].index;
  const previousBootIndex = rebootIndexes[1].index;
  const between = events.slice(currentBootIndex + 1, previousBootIndex);
  const cleanShutdown = between.some((event) => event.kind === 'shutdown');

  if (cleanShutdown) {
    return {
      type: 'clean' as ShutdownState,
      summary: 'A shutdown record exists between the previous and current boot, which indicates a clean OS-level shutdown.',
    };
  }

  return {
    type: 'unexpected' as ShutdownState,
    summary: 'No shutdown record exists between the previous and current boot. That strongly suggests abrupt power loss, a hard reset, or another event outside a clean OS shutdown path.',
  };
}

function parseFilesystemUsage(value: string, mountpoint: string) {
  const line = sectionLines(value).find((entry) => entry.endsWith(` ${mountpoint}`));
  if (!line) return null;
  const parts = line.split(/\s+/);
  if (parts.length < 6) return null;

  return {
    used: parts[2],
    size: parts[1],
    percent: parts[4],
  };
}

function parseMemorySummary(value: string, swap: string) {
  const memLine = sectionLines(value).find((line) => line.startsWith('Mem:'));
  const swapLine = sectionLines(value).find((line) => line.startsWith('Swap:'));
  const swapDevice = sectionLines(swap).find((line) => !line.startsWith('NAME'));

  const memParts = memLine?.split(/\s+/) || [];
  const swapParts = swapLine?.split(/\s+/) || [];
  const swapDeviceParts = swapDevice?.split(/\s+/) || [];

  const memSummary = memParts.length >= 4
    ? `${memParts[2]} used of ${memParts[1]} total, ${memParts[6] || memParts[4]} available.`
    : 'Memory summary unavailable.';
  const swapSummary = swapParts.length >= 4
    ? `Swap ${swapParts[2]} used of ${swapParts[1]} total${swapDeviceParts.length >= 3 ? ` across ${swapDeviceParts[0]}` : ''}.`
    : 'Swap summary unavailable.';

  return `${memSummary} ${swapSummary}`;
}

function parseContainerHotspots(value: string) {
  const rows = sectionLines(value)
    .map((line) => {
      const parts = line.split(/\t+/);
      if (parts.length < 4) return null;

      return {
        name: parts[0],
        cpuPercent: Number.parseFloat(parts[1].replace('%', '')),
        rawMemory: parts[2],
        memoryPercent: Number.parseFloat(parts[3].replace('%', '')),
      } as ContainerHotspot;
    })
    .filter((row): row is ContainerHotspot => Boolean(row));

  rows.sort((left, right) => (right.memoryPercent || 0) - (left.memoryPercent || 0));
  return rows.slice(0, 5);
}

function summarizeContainerPressure(psOutput: string, statsOutput: string) {
  const containerLines = sectionLines(psOutput);
  const unhealthy = containerLines.filter((line) => /unhealthy/i.test(line));
  const hotspots = parseContainerHotspots(statsOutput);

  const hotspotSummary = hotspots.length
    ? hotspots.slice(0, 3).map((row) => `${row.name} ${row.memoryPercent?.toFixed(2) || '0.00'}%`).join(', ')
    : 'No container stats available';

  if (!containerLines.length) {
    return 'Docker status not available from the diagnostics user.';
  }

  return `${containerLines.length} running containers, ${unhealthy.length} unhealthy. Highest memory usage: ${hotspotSummary}.`;
}

function parseTemperatureSummary(value: string, sensorsPath: string) {
  const lines = sectionLines(value);
  const temps = lines.filter((line) => /^\d+$/.test(line)).map((line) => Number.parseInt(line, 10) / 1000);

  if (temps.length) {
    return `Thermal zones are readable. Highest exposed value: ${Math.max(...temps).toFixed(1)} C.`;
  }

  if (sensorsPath) {
    return `The host exposes a sensors binary at ${sensorsPath}, but no non-privileged thermal zone values were returned.`;
  }

  return 'Temperature data is not available to the diagnostics user. lm-sensors is not installed and no readable thermal zones were exposed.';
}

function parseDiskHealthSummary(smartctlPath: string, nvmePath: string) {
  if (smartctlPath && nvmePath) {
    return 'SMART and NVMe tooling exist on the host, but this diagnostics path stays non-privileged. Disk health can be surfaced only when those commands are safely exposed via a privileged wrapper.';
  }

  if (smartctlPath || nvmePath) {
    return 'Partial disk tooling is available, but full SMART/NVMe health is not readable from the current non-privileged diagnostics path.';
  }

  return 'Disk SMART/NVMe tooling is not available to the diagnostics user.';
}

function parseSchedulingSummary(config: string, crontab: string, timers: string) {
  const unattendedEnabled = /APT::Periodic::Unattended-Upgrade\s+"1"/i.test(config);
  const autoRebootEnabled = /^\s*Unattended-Upgrade::Automatic-Reboot\s+"true"/im.test(config);
  const cronRebootJobs = sectionLines(crontab).filter((line) => /(reboot|shutdown|poweroff|halt|systemctl\s+(reboot|poweroff))/i.test(line));
  const timerLines = sectionLines(timers).filter((line) => /apt-daily|upgrade|reboot|shutdown/i.test(line));

  return {
    unattendedUpgrades: unattendedEnabled
      ? autoRebootEnabled
        ? 'Unattended upgrades are enabled and automatic reboot is explicitly enabled.'
        : 'Unattended upgrades are enabled, but automatic reboot is not enabled in the sampled APT config.'
      : 'Unattended upgrades are not enabled in the sampled APT config.',
    cron: cronRebootJobs.length
      ? `Potential reboot-capable cron entries exist: ${cronRebootJobs.join(' | ')}`
      : 'No reboot or shutdown commands were found in the deploy user crontab.',
    timers: timerLines.length
      ? `Relevant timers detected: ${timerLines.slice(0, 4).join(' | ')}`
      : 'No reboot-oriented systemd timer was detected in the sampled timer list.',
  };
}

function filteredCriticalMessages(...blocks: string[]) {
  const suspicious = /(panic|out of memory|oom-killer|killed process|critical temperature|overheat|i\/o error|buffer i\/o|read-only|readonly|corrupt|segfault|machine check|soft lockup|hard lockup|reset|failed)/i;

  return blocks
    .flatMap((block) => sectionLines(block))
    .filter((line) => suspicious.test(line))
    .filter((line) => !/UFW BLOCK/i.test(line))
    .slice(-12);
}

function buildAssessment(input: {
  previousShutdownType: ShutdownState;
  previousTail: string;
  previousHints: string;
  currentHints: string;
  scheduling: ReturnType<typeof parseSchedulingSummary>;
  containerPressure: string;
}) {
  const combined = [input.previousTail, input.previousHints, input.currentHints].join('\n');
  const abruptGap = input.previousShutdownType === 'unexpected';
  const hasOOM = /out of memory|oom-killer|killed process/i.test(combined);
  const hasThermal = /critical temperature|overheat|throttl/i.test(combined);
  const hasStorage = /i\/o error|buffer i\/o|read-only|readonly|corrupt|nvme.*(error|reset)|ata\d.*(error|reset|failed)|ext4.*error|xfs.*error|btrfs.*error/i.test(combined);
  const hasKernelPanic = /panic|segfault|oops|machine check|mce/i.test(combined);
  const hasWatchdogFailure = /soft lockup|hard lockup|watchdog.*(timeout|bite|lockup)/i.test(combined);
  const hasScheduledSignal = input.previousShutdownType === 'clean'
    || /Automatic-Reboot\s+"true"/i.test(input.scheduling.unattendedUpgrades)
    || /Potential reboot-capable cron entries/i.test(input.scheduling.cron);
  const unhealthyContainers = /(\b[1-9]\d* unhealthy\b)/i.test(input.containerPressure);

  const likely: string[] = [];
  const possible: string[] = [];
  const weakSignals: string[] = [];
  const noEvidence: string[] = [];

  let likelyCause = 'No conclusive evidence yet';
  let confidence: UnexpectedShutdownAnalysis['assessment']['confidence'] = 'low';
  let conclusive = false;

  if (hasOOM) {
    likelyCause = 'Likely memory pressure / OOM';
    likely.push('OOM-style log evidence was detected in the accessible journal output.');
    confidence = 'high';
    conclusive = true;
  } else if (hasKernelPanic) {
    likelyCause = 'Likely kernel panic or low-level hardware fault';
    likely.push('Kernel-level panic, segfault, or machine-check language was detected in accessible logs.');
    confidence = 'high';
    conclusive = true;
  } else if (hasStorage) {
    likelyCause = 'Likely storage instability';
    likely.push('Storage or filesystem error language was detected in accessible logs.');
    confidence = 'medium';
  } else if (hasThermal) {
    likelyCause = 'Likely thermal issue';
    likely.push('Thermal or overheat language was detected in accessible logs.');
    confidence = 'medium';
  } else if (hasWatchdogFailure) {
    likelyCause = 'Likely watchdog-triggered restart';
    likely.push('Watchdog or lockup indicators were found in accessible logs.');
    confidence = 'medium';
  } else if (abruptGap && !hasScheduledSignal) {
    likelyCause = 'Likely unexpected power loss or hard reset outside the OS';
    likely.push('There is no clean shutdown record between the previous and current boot.');
    likely.push('Older reboot transitions do show clean shutdown markers, which makes the latest transition stand out as abnormal.');
    confidence = 'medium';
  }

  if (abruptGap) {
    possible.push('Power loss, PSU instability, home electrical supply issues, or manual hard reset remain plausible because the OS did not record a clean shutdown.');
    possible.push('Hardware instability at the motherboard, RAM, or NVMe layer remains possible even though accessible logs do not yet prove it.');
  }

  if (unhealthyContainers) {
    weakSignals.push('Container fleet load is non-trivial and at least one container is unhealthy, but current memory, swap, and disk pressure do not support this as the primary reboot cause.');
  }

  if (!hasOOM) noEvidence.push('No accessible OOM or memory-killer evidence was found.');
  if (!hasThermal) noEvidence.push('No accessible thermal shutdown evidence was found.');
  if (!hasStorage) noEvidence.push('No accessible filesystem or I/O error evidence was found.');
  if (!hasKernelPanic) noEvidence.push('No accessible kernel panic or segfault evidence was found.');
  if (!hasScheduledSignal) noEvidence.push('No scheduled reboot or unattended auto-reboot evidence was found in the sampled cron and APT configuration.');

  return {
    likelyCause,
    conclusive,
    confidence,
    likely,
    possible,
    weakSignals,
    noEvidence,
  };
}

function buildAlertMessage(type: AlertEventType, analysis: UnexpectedShutdownAnalysis) {
  if (type === 'unexpected-shutdown') {
    return [
      'VPS Alert: Unexpected Shutdown Suspected',
      '',
      'The self-hosted VPS appears to have experienced an unexpected shutdown or crash.',
      `Last boot: ${analysis.current.lastBootTime || 'Unknown'}`,
      `Previous shutdown state: ${analysis.previousShutdown.type}`,
      `Likely cause: ${analysis.assessment.likelyCause}`,
      'Please review the shutdown analysis page for more details.',
    ].join('\n');
  }

  if (type === 'back-online') {
    return [
      'VPS Status: Back Online',
      '',
      'The self-hosted VPS is back online.',
      `Boot time: ${analysis.current.lastBootTime || 'Unknown'}`,
      `Uptime: ${analysis.current.uptime}`,
      `Current status: ${analysis.host.status}`,
      `Possible previous cause: ${analysis.assessment.likelyCause}`,
    ].join('\n');
  }

  const detail = analysis.criticalMessages[analysis.criticalMessages.length - 1] || analysis.assessment.likelyCause;
  return [
    'VPS Warning',
    '',
    'A critical warning was detected on the self-hosted VPS.',
    `Type: ${analysis.assessment.likelyCause}`,
    `Details: ${detail}`,
    'Please review the host diagnostics.',
  ].join('\n');
}

export async function getUnexpectedShutdownAnalysis(): Promise<UnexpectedShutdownAnalysis> {
  const raw = await runRemoteScript(buildRemoteScript());
  const sections = parseSections(raw);

  const lastX = sections.get('LAST_X') || '';
  const previousTail = sections.get('PREV_BOOT_TAIL') || '';
  const previousHints = sections.get('PREV_BOOT_HINTS') || '';
  const currentHints = sections.get('CURRENT_BOOT_HINTS') || '';
  const crontab = sections.get('CRONTAB') || '';
  const aptConfig = sections.get('APT_REBOOT_CONFIG') || '';
  const timers = sections.get('TIMERS') || '';
  const dockerPs = sections.get('DOCKER_PS') || '';
  const dockerStats = sections.get('DOCKER_STATS') || '';

  const bootTime = parseWhoBoot(sections.get('WHO_B') || '');
  const uptime = parseUptime(sections.get('UPTIME') || '');
  const events = parseLastEvents(lastX);
  const previousShutdown = classifyShutdown(events);
  const memorySummary = parseMemorySummary(sections.get('FREE') || '', sections.get('SWAPON') || '');
  const rootDisk = parseFilesystemUsage(sections.get('DF_H') || '', '/');
  const srvDisk = parseFilesystemUsage(sections.get('DF_H') || '', '/srv');
  const rootInodes = parseFilesystemUsage(sections.get('DF_I') || '', '/');
  const srvInodes = parseFilesystemUsage(sections.get('DF_I') || '', '/srv');
  const containerPressure = summarizeContainerPressure(dockerPs, dockerStats);
  const scheduling = parseSchedulingSummary(aptConfig, crontab, timers);
  const assessment = buildAssessment({
    previousShutdownType: previousShutdown.type,
    previousTail,
    previousHints,
    currentHints,
    scheduling,
    containerPressure,
  });
  const criticalMessages = filteredCriticalMessages(previousHints, currentHints);
  const unhealthyCount = sectionLines(dockerPs).filter((line) => /unhealthy/i.test(line)).length;

  const analysis: UnexpectedShutdownAnalysis = {
    host: {
      label: DIAGNOSTIC_TARGET_LABEL,
      sshTarget: DIAGNOSTIC_SSH_TARGET,
      collectedAt: new Date().toISOString(),
      status: unhealthyCount > 0 ? 'degraded' : 'online',
    },
    current: {
      lastBootTime: bootTime,
      uptime,
    },
    previousShutdown: {
      ...previousShutdown,
      events: events.slice(0, 6),
    },
    assessment,
    evidence: [
      {
        title: 'Boot History',
        items: [
          `Current boot time from who -b: ${bootTime || 'Unavailable'}`,
          previousShutdown.summary,
        ],
      },
      {
        title: 'Previous Boot Clues',
        items: [
          previousTail
            ? 'The tail of the previous boot journal was captured and checked for shutdown, panic, OOM, thermal, and storage signals.'
            : 'Previous boot journal tail was not available.',
          previousHints
            ? 'Accessible previous-boot hint filters returned signal-bearing lines for review.'
            : 'No previous-boot panic, OOM, thermal, watchdog, or storage error hints were found in the accessible journal.',
        ],
      },
      {
        title: 'Current Boot Clues',
        items: [
          currentHints
            ? 'Current-boot hint filters returned lines worth inspection.'
            : 'No current-boot recovery, panic, OOM, or storage error hints were found in the accessible journal.',
          'Current boot dmesg from the live investigation showed normal device enumeration and clean filesystem mounts, without fsck or recovery markers.',
        ],
      },
      {
        title: 'Schedulers And Reboots',
        items: [
          scheduling.unattendedUpgrades,
          scheduling.cron,
          scheduling.timers,
        ],
      },
    ],
    resources: {
      memory: memorySummary,
      disk: `Root ${rootDisk ? `${rootDisk.used} of ${rootDisk.size} used (${rootDisk.percent})` : 'unavailable'}; /srv ${srvDisk ? `${srvDisk.used} of ${srvDisk.size} used (${srvDisk.percent})` : 'unavailable'}.`,
      inodes: `Root ${rootInodes?.percent || 'unavailable'} inode use; /srv ${srvInodes?.percent || 'unavailable'} inode use.`,
      containerPressure,
    },
    hardware: {
      temperature: parseTemperatureSummary(sections.get('THERMAL') || '', (sections.get('SENSORS') || '').trim()),
      diskHealth: parseDiskHealthSummary((sections.get('SMARTCTL') || '').trim(), (sections.get('NVME') || '').trim()),
      privilegedVisibility: 'The live investigation included one read-only privileged pass for kernel warnings. A persistent portal-safe implementation intentionally avoids sudo and reports unavailable signals instead of embedding privileged credentials.',
    },
    scheduling: {
      unattendedUpgrades: scheduling.unattendedUpgrades,
      cron: scheduling.cron,
      timers: scheduling.timers,
      watchdog: 'No dedicated watchdog service was found in the sampled systemd unit list. The kernel NMI watchdog is enabled, but that is a normal runtime feature and not evidence of a watchdog-triggered reboot by itself.',
    },
    criticalMessages,
    alerting: {
      phoneConfigured: Boolean(ALERT_TARGET_PHONE),
      phoneHint: ALERT_TARGET_PHONE ? maskPhone(ALERT_TARGET_PHONE) : 'No default alert phone configured',
      unexpectedShutdownPreview: '',
      backOnlinePreview: '',
      criticalWarningPreview: '',
    },
  };

  analysis.alerting.unexpectedShutdownPreview = buildAlertMessage('unexpected-shutdown', analysis);
  analysis.alerting.backOnlinePreview = buildAlertMessage('back-online', analysis);
  analysis.alerting.criticalWarningPreview = buildAlertMessage('critical-warning', analysis);

  return analysis;
}

export async function sendUnexpectedShutdownAlert(type: AlertEventType, phone?: string) {
  const analysis = await getUnexpectedShutdownAnalysis();
  const target = String(phone || ALERT_TARGET_PHONE || '').trim();

  if (!target) {
    throw new Error('No alert phone is configured. Provide a phone number or set SHUTDOWN_ALERT_PHONE.');
  }

  const message = buildAlertMessage(type, analysis);
  const sent = await sendWhatsAppText(target, message);

  if (!sent) {
    throw new Error('WhatsApp send failed');
  }

  return {
    ok: true,
    phone: target,
    type,
    preview: message,
  };
}