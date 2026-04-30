# FusionPBX Voice Service Endpoint UI — 2026-05-01

## Summary

The FusionPBX voice service endpoint page in the portal
(`/admin/service-endpoints/voice`) was upgraded from a single-screen
status dashboard to a full eight-tab management console modeled on the
attached UI design. The page now reads live data from the FusionPBX
`voice` Postgres database and FreeSWITCH where possible, and renders
graceful empty states when no data is yet available (which is the
current production state).

The page remains read-only: all create/edit actions deep-link to
FusionPBX (`https://pbx.getouch.co`), which is the system of record.
The Voice API (`https://voice.getouch.co`) is reserved for the future
programmatic API surface.

## Files changed

- `lib/voice-console-data.ts` — **new**. Server-only fetcher that runs a
  single SSH session against the production host, executes a Python
  helper which `psql`s the `voice` database (via
  `docker exec getouch-postgres psql -U getouch -d voice`) and
  best-effort `fs_cli` (FreeSWITCH ESL, currently unavailable). Returns
  a `VoiceConsoleExtras` payload covering domains, extensions,
  gateways, call flows, calls, recordings, and 7-day analytics.
  Exposes `getVoiceConsoleExtras()` and `emptyVoiceConsoleExtras()`.
- `app/api/admin/service-endpoints/voice/route.ts` — extended to merge
  `VoiceDashboardStatus` with `VoiceConsoleExtras`. Degraded paths
  return an empty extras envelope so the UI never crashes.
- `app/api/admin/service-endpoints/voice/health-check/route.ts` —
  **new**. Alias of `test-health` matching the design spec route name.
- `app/admin/service-endpoints/voice/VoiceServiceEndpointConsole.tsx` —
  rewritten as an eight-tab console (`Overview`, `Tenants`,
  `Extensions`, `Trunks`, `Call Flows`, `Calls`, `Analytics`,
  `Settings`) with inline SVG charts (`Donut`, `MiniLineChart`,
  `MiniBarChart`), filters, status pills, and quick-action shortcuts.
  Reuses `EvolutionStyles` for visual parity with the other endpoint
  consoles.
- `docs/voice-fusionpbx-service-endpoint-ui-2026-05-01.md` — this file.

## Tabs implemented

| Tab | What it shows | Live source |
|-----|---------------|-------------|
| Overview | 6 KPI cards, 7-day call volume line, tenant activity table, call-outcome donut, quick actions, health overview, recent web/freeswitch logs | `v_domains`, `v_extensions`, `v_gateways`, `v_xml_cdr`; `docker logs voice-fusionpbx`, `voice-freeswitch` |
| Tenants | 5 stats, search + status filter, tenant table, tenant-health donut, mapping panel (Portal↔FusionPBX) | `v_domains` joined with extension/gateway/CDR counts |
| Extensions | 5 stats, search + tenant + status filters, extensions table (top 50), registration-health donut | `v_extensions` |
| Trunks | 5 stats, search, gateway table, status donut, quality placeholder | `v_gateways` |
| Call Flows | 5 stats, search + type filter, unioned flow table with selectable rows + flow detail panel | `v_ivr_menus` ∪ `v_ring_groups` ∪ `v_call_center_queues` ∪ `v_call_flows`; counts also include `v_dialplans` time conditions |
| Calls | 6 stats, recent CDR table (live channel reads need ESL), recent recordings table, queue monitor, alerts placeholder | `v_xml_cdr`, `view_call_recordings` |
| Analytics | 6 stats, 7-day volume line, calls-by-hour bars, outcome donut, top tenants table | Aggregates over `v_xml_cdr` (last 7 days) |
| Settings | General/Defaults/Recording, Security/Integrations/System Status, Notes | `serviceInformation`, `runtime`, `notes` from existing `getVoiceDashboardStatus()` |

## Data sources

All queries run inside the production network via SSH to
`deploy@100.84.14.93` and exec into `getouch-postgres`:

```sql
-- Domains with rolled-up counts
select v_domains.* + (extension_count, gateway_count, calls_today, answer_rate)

-- 7-day call volume (per day)
generate_series(now()-7d, now()) join v_xml_cdr on date

-- Outcome aggregation (filter clauses on bridge_hangup_cause / hangup_cause)
sum(...) filter (where ...)
```

Confirmed `voice` DB schema: `v_domains`, `v_extensions`, `v_gateways`,
`v_xml_cdr`, `v_ivr_menus`, `v_ring_groups`, `v_call_center_queues`,
`v_call_flows`, `v_dialplans`, `view_call_recordings` — all present.
Live state at the time of cutover: 1 domain
(`pbx.getouch.co`), 0 extensions, 0 gateways, 0 CDR, 0 recordings.

## Live vs empty-state behaviour

Every tab renders without crash on empty data. KPIs show `0`, tables
render an inline `evo-empty` panel with guidance ("Provision a SIP
carrier in FusionPBX…", "Build IVRs, ring groups, and queues in
FusionPBX…", etc.). Charts only render when `total > 0`.

If the SSH probe fails or the DB query errors, the API returns the
degraded dashboard plus `emptyVoiceConsoleExtras(message)` and a
`X-Getouch-Degraded: 1` header; the UI surfaces a yellow banner with
the underlying error.

## Safe vs FusionPBX-native actions

| Action | Where it lives |
|--------|----------------|
| Create tenant / extension / trunk | Deep-link to FusionPBX |
| Edit call flow | Deep-link to FusionPBX |
| Test PBX Health | Portal POSTs `/api/admin/service-endpoints/voice/test-health` (existing `runFusionPbxHealthCheck` + `runVoiceApiHealthCheck`) |
| Open FusionPBX / Open Voice API | External links to `pbx.getouch.co` / `voice.getouch.co` |
| Bulk Import / Duplicate Flow / Test Route | Disabled buttons (not implemented) |

The portal does not write to the FusionPBX database. All mutations go
through the FusionPBX UI, preserving its security model.

## Multi-tenant mapping plan

Today FusionPBX domains are listed without portal `tenant_id` mapping
("Unmapped" pill in the Tenants tab). Future work:

1. Add a `voice_tenant_mappings` table (portal `tenant_id` ↔
   FusionPBX `domain_uuid`).
2. Backfill from existing portal tenants where `domain_name` matches.
3. Filter all per-tenant views by the logged-in admin's tenants when
   non-superadmin tenant scoping is introduced.

## Known limitations

- **No FreeSWITCH ESL access.** The portal cannot currently read live
  channels, registrations, or queue SLA. The Calls and Extensions tabs
  fall back to CDR / DB enabled-flag, and surface a note.
- **No SIP RTT / jitter monitoring.** Trunk Call Quality panel shows
  "Not monitored yet".
- **`peakConcurrent`** and **SLA** in the Analytics tab are placeholders
  (`—` / "not measured yet").
- **Recording audio playback** is not exposed in the portal — file
  names only. Streaming recordings would require an authenticated proxy
  to FusionPBX storage.

## Next steps

1. Provision a SIP carrier in FusionPBX (`v_gateways`) and at least one
   tenant + a few extensions to exercise the populated tabs end-to-end.
2. Wire FreeSWITCH ESL (event_socket) inside the compose network and
   expose a read-only `/admin/voice/freeswitch` proxy so the portal can
   show live channels/registrations without SSH.
3. Add `voice_tenant_mappings` table and the reverse lookup endpoint.
4. Build the Voice API at `voice.getouch.co` (currently 404/empty) for
   programmatic call origination, click-to-call, and webhook emission.

## Validation

- `npx tsc --noEmit` — passed.
- `npm run build` — passed (route `/api/admin/service-endpoints/voice/health-check`
  is now in the route table alongside the existing `/test-health`).
- Other service endpoint pages (Baileys, Evolution, vLLM, Dify,
  Chatwoot, MCP, Object Storage) are untouched and still build.
