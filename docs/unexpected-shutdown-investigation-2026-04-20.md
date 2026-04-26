# Unexpected Shutdown Investigation

Date: 20 April 2026

## Scope

This investigation focused on unexpected shutdown, reboot, or offline events on the self-hosted home VPS at 100.84.14.93. The priority was evidence gathering and safe visibility, not blind remediation.

## Host Findings

### Reboot and shutdown history

- Current boot time at investigation: 2026-04-20 12:06 UTC from `who -b`
- Uptime at investigation start: about 9 minutes from `uptime`
- `last -x` showed several older boot transitions with clean `shutdown system down` markers.
- The most recent transition into the current boot did **not** show a `shutdown` marker between the previous boot and the current boot.

Interpretation:

- That pattern strongly suggests the latest outage was **not** a clean OS-level shutdown.
- It is consistent with abrupt power loss, hard reset, PSU or electrical instability, board-level instability, or a crash that prevented normal shutdown bookkeeping.

### Previous boot evidence

Sources used:

- `journalctl -b -1`
- `journalctl -k -b -1`
- focused grep filters for panic, OOM, thermal, watchdog, storage, filesystem, and shutdown keywords

Findings:

- Accessible previous-boot logs did not show clear kernel panic, OOM killer, thermal shutdown, filesystem corruption, or NVMe/SATA I/O error evidence.
- The tail of the previous boot journal ended with ordinary runtime noise such as UFW blocks and cron activity, not a clean shutdown sequence.
- No clear `systemd-shutdown`, `Reached target Shutdown`, or similar clean-stop markers were found for the latest outage window.

Interpretation:

- The absence of clean shutdown markers plus the absence of explicit in-OS crash signatures points more toward **power interruption or hard reset outside software control** than toward a normal reboot command.

### Current boot evidence

Sources used:

- `journalctl -b 0`
- `dmesg -T`

Findings:

- Current boot showed normal storage discovery for:
  - NVMe: KINGSTON SFYRDK2000G
  - SATA archive disk: SSD 1TB
- Current boot mounted ext4 filesystems normally.
- No fsck or recovery sequence was visible in the captured current-boot logs.
- No obvious panic, OOM, or thermal event was visible in the accessible current boot logs.

Interpretation:

- There is no strong evidence that the system came back after a storage-level crash or heavy filesystem recovery event.

### Hardware visibility

Sources used:

- `lsblk`
- `/sys/class/thermal`
- `command -v sensors`
- `command -v smartctl`
- `command -v nvme`
- privileged read-only kernel and dmesg inspection

Findings:

- `lm-sensors` was not installed.
- No readable non-privileged `thermal_zone` temperature values were exposed.
- `smartctl` and `nvme` are present on the host, but the safe portal implementation does not rely on sudo or embedded credentials.
- Privileged dmesg review did not show obvious storage fault lines or thermal-failure lines in the captured output.

Interpretation:

- Temperature and SMART health remain only **partially verified** from this session.
- There is still no positive software evidence for overheating or storage failure, but those causes are not completely eliminated without persistent hardware telemetry.

### Resource pressure

Sources used:

- `free -h`
- `swapon --show`
- `df -h`
- `df -i`
- `ps`
- `docker ps`
- `docker stats --no-stream`

Findings:

- RAM: 17 GiB used of 62 GiB, 45 GiB available
- Swap: 0 used of 8 GiB
- Root disk: 18% used
- `/srv`: 8% used
- Inodes: low usage on both root and `/srv`
- Large Docker fleet is running, but there is no current host-level memory or disk pressure.
- One container was unhealthy at investigation time: `docker-api-1`
- Heavy application presence includes Coolify, Open WebUI, Ollama, Dify-related services, Supabase stacks, SeaweedFS, news services, Chatwoot, Grafana, and others.

Interpretation:

- Container density is real and worth monitoring, but current pressure does **not** support OOM or storage exhaustion as the primary cause of the reboot event.

### Scheduled reboot and update possibilities

Sources used:

- `systemctl list-timers --all`
- `crontab -l`
- `/etc/cron.d`
- `/etc/cron.daily`
- `grep` in `/etc/apt/apt.conf.d`
- `tail /var/log/apt/history.log`

Findings:

- Unattended upgrades are enabled.
- Automatic unattended reboot is **not enabled** in the sampled config.
- Deploy crontab contains health snapshots, perf trending, alias repair, and backup jobs.
- No reboot, poweroff, or shutdown commands were found in the deploy crontab.
- Timers showed normal maintenance and alert timers, but nothing that directly explains a forced reboot.

Interpretation:

- There is **no evidence** that unattended upgrades or a scheduled cron job intentionally rebooted the VPS.

## Root-Cause Assessment

### Likely cause

- Likely unexpected power loss or hard reset outside the OS

Why:

- No clean shutdown marker exists between the previous boot and the current boot.
- Older reboot transitions do show normal clean shutdown bookkeeping, so the missing marker is meaningful.
- Accessible logs did not show a competing strong signal such as OOM, panic, thermal shutdown, or storage corruption.

### Possible causes

- PSU instability
- home electrical supply interruption
- motherboard instability
- RAM instability
- abrupt manual reset or forced power event
- hardware issue that did not leave a software trace

### Weak signal / needs more monitoring

- high service and container density on the host
- one unhealthy container at investigation time
- lack of persistent thermal telemetry
- lack of non-privileged SMART visibility in the portal

### No evidence found

- no accessible OOM evidence
- no accessible kernel panic evidence
- no accessible thermal shutdown evidence
- no accessible filesystem corruption or I/O error evidence
- no scheduled reboot or unattended auto-reboot evidence

### Conclusion quality

- Not fully conclusive
- Strongest current category: **unexpected power loss / hard reset outside software control**

## Commands And Log Sources Used

- `uptime`
- `who -b`
- `last -x`
- `journalctl -b -1`
- `journalctl -k -b -1`
- `journalctl -b 0`
- `dmesg -T`
- `free -h`
- `swapon --show`
- `df -h`
- `df -i`
- `ps`
- `docker ps`
- `docker stats --no-stream`
- `systemctl list-timers --all`
- `crontab -l`
- `/etc/cron.d`
- `/etc/cron.daily`
- `/etc/apt/apt.conf.d`
- `/var/log/apt/history.log`
- `lsblk`
- `/sys/class/thermal`
- `command -v sensors`
- `command -v smartctl`
- `command -v nvme`

## Portal Additions Implemented

### New monitoring page

- Added `Unexpected Shutdown Analysis` under Admin > Monitoring.
- The page gathers read-only evidence over SSH using the deploy account.
- Output is summarized and sanitized instead of dumping noisy raw logs.

Displayed fields include:

- current status
- last boot time
- system uptime
- previous shutdown type
- likely cause
- evidence confidence
- evidence summary buckets
- memory pressure summary
- disk pressure summary
- inode pressure summary
- container/app pressure summary
- temperature visibility summary
- disk health visibility summary
- unattended-upgrades and timer summary
- last reboot/shutdown events
- last critical kernel/system messages

### Safe design choices

- no destructive commands
- no service disablement
- no automatic reboot or shutdown action
- no sudo embedded in the portal flow
- unavailable privileged signals are shown as unavailable instead of bypassing safety

## WhatsApp Alert Integration Implemented

### What was added

- A manual admin-only WhatsApp alert test route was added.
- Three templates are supported:
  - unexpected shutdown suspected
  - system back online
  - critical hardware/system warning
- The page shows a live preview of the message before sending.

### Why it is manual first

- Automatic alerting needs dedupe state so the same boot event is not re-alerted repeatedly.
- That state does not exist yet in a minimal safe form.
- Manual test support was added first so the templates and delivery path can be verified safely.

### Lightest safe next step for automatic alerting

- Persist only the last alerted boot ID or boot timestamp plus the last classified shutdown state.
- Trigger from a small server-side polling job or existing alert timer.
- Send only on state transitions:
  - clean -> unexpected
  - unexpected previous state -> host back online

## Exact Files Changed

- `lib/unexpected-shutdown.ts`
- `app/api/admin/unexpected-shutdown/route.ts`
- `app/api/admin/unexpected-shutdown/alert-test/route.ts`
- `app/admin/unexpected-shutdown/page.tsx`
- `app/admin/unexpected-shutdown/UnexpectedShutdownConsole.tsx`
- `app/admin/data.ts`
- `docs/unexpected-shutdown-investigation-2026-04-20.md`

## Manual QA Checklist

- verify last boot time is detected correctly from the live host
- verify previous shutdown is classified clean vs unexpected when evidence exists in `last -x`
- verify previous boot and current boot kernel/system hints surface without dumping noisy raw logs
- verify temperature is shown when available, otherwise explicitly shown as unavailable
- verify disk health is shown when safely available, otherwise explicitly shown as unavailable
- verify memory, swap, disk, inode, and container pressure summaries render correctly
- verify no destructive system changes were introduced by the diagnostics path
- verify the WhatsApp test alert can be sent for simulated unexpected shutdown
- verify the WhatsApp test alert can be sent for simulated back-online recovery
- verify the WhatsApp test alert can be sent for simulated critical warning
- verify the admin page renders a useful summary instead of raw journal spam
- verify non-admin users cannot access the diagnostics API or page

## Recommended Next Investigation Outside Software

Because the strongest current category is power-loss or hard-reset outside the OS, the next most valuable checks are physical and electrical, not application-level:

- verify PSU health and connector seating
- verify motherboard event LEDs or BIOS hardware logs if available
- verify home electrical stability and whether the server is on a UPS
- verify BIOS settings for restore-after-AC-loss and hardware monitoring
- run RAM diagnostics during a maintenance window
- capture persistent thermal telemetry if the board exposes it
- run privileged SMART health collection through a narrow wrapper if storage confidence must be raised further