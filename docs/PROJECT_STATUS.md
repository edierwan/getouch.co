# GetTouch / Serapod Infrastructure — Project Status

> **This file is the single source of truth for project status.** Chat transcripts, Claude reports, PR
> descriptions and older `docs/` files are evidence, not status. If they disagree with this file, this
> file wins until it is corrected here. AI agents: read [`AGENTS.md`](../AGENTS.md) before working.

- **Last reconciled:** 2026-11-21 (SERAPOD-INFRA-GOV-001)
- **Production portal:** `main` @ `fc57ab3`, image `mqmo5bwkxysedbg7vvh6tk1f:fc57ab3…`, deployed 2026-11-20 17:17 UTC — VERIFIED 2026-11-21
- **Deploys are manual.** Merging to `main` does **not** deploy (see [Coolify auto-deploy audit](ops/coolify-auto-deploy-audit-2026-11-21.md)).

## Status legend

Use exactly one of these per item, and move items forward only with evidence.

| Status | Meaning | Required evidence |
|---|---|---|
| `PLANNED` | Designed or agreed, nothing built | Link to the plan or decision |
| `IMPLEMENTED` | Code exists on a branch or open PR, not on `main` | PR number |
| `MERGED` | On `main`, not yet running in production | Merge commit |
| `DEPLOYED` | Running in production | Deployed commit / image tag and date |
| `VERIFIED` | Checked in production after deployment | What was checked, when, by whom |
| `APPLIED` | Operational change made directly in production (no code / PR) | Exact change, date, rollback |
| `BLOCKED` | Cannot proceed | The blocker and who must decide |

`APPLIED` items still need `VERIFIED` when checked. Record verification limits honestly (what could *not* be checked).

## 1. Work items

### Delivered

| ID | Item | Status | Evidence | Notes |
|---|---|---|---|---|
| SERAPOD-INFRA-007 | Portal statuses from live probes instead of hardcoded values | DEPLOYED | PR #1 → `d932de2`; in production image `fc57ab3` | Behaviour later corrected by INFRA-008 |
| GETOUCH-UAT-001 | Separate Supabase API gateway from Studio (both stacks) | DEPLOYED | PR #2 → `a38d46d`; in production image `fc57ab3` | Production verification not recorded |
| SERAPOD-INFRA-008 | Airbyte shown as provisioned; verified-health Airbyte probe; status fixes (Open WebUI, Langfuse primary container, OFFLINE/UNKNOWN states, n8n link) | VERIFIED | PR #3 → `fc57ab3`; deployed 2026-11-20 16:40 UTC; `/api/build-info` route table checked 2026-11-21 | Airbyte link opens `https://airbyte.getouch.co` behind Cloudflare Access |
| AIRBYTE-RUNTIME | Airbyte 2.5.0 (abctl / kind) on NVMe | APPLIED · VERIFIED | 9/9 pods running, `/api/v1/health` = available (2026-11-20) | Installed before this tracker existed; config not in this repo |
| SERAPOD-INFRA-009 (ops) | Retire `flow.news.getouch.co`: DNS record, tunnel rule, Traefik host rule | APPLIED · VERIFIED | 2026-11-20; restore data recorded in PR #4 | `news-flow` (n8n) kept running, internal only |
| TASK-4 | Postiz v2.26.0 at `https://postiz.serapod.com` (own compose project, Temporal, Redis, `postiz_db`) | APPLIED · VERIFIED | Healthy; hourly Temporal job fired 6/6; restore test 88 + 37 tables (2026-11-20/21) | See §4 for runtime details |
| TASK-4 (ops) | Old unused Postiz `news-social` + `social.news.getouch.co` retired | APPLIED · VERIFIED | 2026-11-20 | `news_social` DB and uploads kept |
| TASK-4 (ops) | Postiz self-registration enabled for internal evaluation | APPLIED · VERIFIED | 2026-11-21; admin account unchanged; still behind Cloudflare Access | Revisit before Marketing Team onboarding (§3) |
| SEC-001-WAPI | Dormant WAPI Platform App Key (`pk_wapi`, `platform:*`) set to `disabled` | APPLIED · VERIFIED (limited) | 2026-11-21: DB shows `disabled` + containment marker; broker still answers 401 for missing/invalid keys | **Limit:** not tested with the real key (not held). Rejection follows from code (`validatePlatformAppKey` requires `active`). Rollback: set `status='active'` on the row with `metadata.containment = 'SERAPOD-INFRA-SEC-001'`. **Do not repeat or undo without approval.** |

### In review (open PRs)

| ID | Item | Status | PR | Notes |
|---|---|---|---|---|
| SERAPOD-INFRA-009 | Portal: stop showing `flow.news` as n8n's URL; drop Caddy block | IMPLEMENTED | #4 | Ops part already APPLIED |
| TASK-4 | Portal: Business Applications → Postiz with live status | IMPLEMENTED | #5 | |
| SEC-001-UI | Security UI: stop claiming unenforced protections | IMPLEMENTED | #6 | Copy-only; adds `tests/security-ui-claims.test.mjs` |
| GOV-001 | This tracker, `AGENTS.md`, Coolify audit, Project Control proposal | IMPLEMENTED | (this PR) | Docs only |

All four are independent and can ship in one manual deploy after review.

### Planned / awaiting decision

| ID | Item | Status | Decision needed from | Reference |
|---|---|---|---|---|
| SEC-001-PG-A | Portal least-privilege PostgreSQL role (Phase A) | PLANNED | Management | Tested in isolation 57/57; cutover + rollback in the SEC-001 report |
| SEC-001-PG-B | Move table ownership off the superuser (Phase B) | PLANNED | After Phase A | |
| SEC-001-ADMINROLE | Disable login for extra superuser `admin@getouch.co` | PLANNED | Management (check pgAdmin first) | |
| SEC-001-SSH | Replace portal's root-equivalent SSH access with a restricted read-only probe account | PLANNED | Management (design) | Finding S1, critical |
| SEC-001-MFA | Enforce MFA for Authentik administrators | PLANNED | Management | Enrol a device before enforcing |
| SEC-001-BACKUP | Off-host copy of nightly backups | PLANNED | Management (destination) | Finding S6 |
| GOV-001-DEPLOY | Fix Coolify auto-deploy (GitHub App repository access) — or decide to stay manual | PLANNED | Management | [Audit](ops/coolify-auto-deploy-audit-2026-11-21.md) |
| BROKER-W1…W7 | Broker hardening waves: default-deny scopes, audit logs, expiry/rotation, rate limits, tenant isolation + Infisical, Postiz read adapter, Authentik tokens | PLANNED | Per wave | SEC-001 report, roadmap |
| TASK-4B | Postiz CLI v2.0.29 on operator Mac | BLOCKED | Management | Installed locally; every API call is stopped by Cloudflare Access. Resolution = broker Postiz adapter (wave 5) or a scoped service token + local proxy |
| GOV-001-UI | Admin-only Project Control page sourced from this file | PLANNED | Management | [Proposal](proposals/project-control-page.md) |

## 2. Security findings register

| # | Severity | Finding | Status |
|---|---|---|---|
| S1 | Critical | Portal holds SSH to the host as a Docker-group user (root-equivalent) | Open — SEC-001-SSH |
| S2 | High | Dormant WAPI key could send WhatsApp messages via a public, unthrottled broker | **Contained** — SEC-001-WAPI (APPLIED) |
| S3 | High | Portal (and Chatwoot, Evolution, news CMS, n8n, Open WebUI) connect to PostgreSQL as a superuser | Open — SEC-001-PG-A (portal first) |
| S4 | High | Extra superuser login role `admin@getouch.co` with password, no expiry | Open — SEC-001-ADMINROLE |
| S5 | High | Authentik admin has no MFA (MFA stage = skip); no OIDC apps/providers configured | Open — SEC-001-MFA |
| S6 | High | Backups (nightly, OK) never leave the server | Open — SEC-001-BACKUP |
| S7 | Medium | Portal env holds unused pgAdmin password and a second superuser password | Open — removed during SEC-001-PG-A |
| S8 | Medium | Management UI claimed unenforced protections | Fix IMPLEMENTED — PR #6 |
| S9 | Medium | Broker keys: default `platform:*`, no expiry, no-overlap rotation, no admin audit, no rate limits | Open — broker waves 1–3 |
| S10 | Info | Cloudflare Access uses one-time PIN + Google; Authentik not connected | Open — broker wave 6 |

No secrets belong in this file. Record secret *locations* only (e.g. "Coolify env", "`/home/deploy/apps/postiz/.env`").

## 3. Known issues and limitations

| Item | State | Notes |
|---|---|---|
| Coolify auto-deploy | Not working since at least 2026-09 | Root cause INFERRED: GitHub App installation does not include the public repos. See audit |
| `coolify.getouch.co` Let's Encrypt renewal fails | Accepted (no user impact) | Origin cert unused behind tunnel; fix options in the ACME assessment (not applied) |
| vLLM portal gateway | Disabled by config | `/ready` 503 is accurate; enabling is a product decision |
| n8n (`news-flow`) | Internal only | `n8n.getouch.co` has no DNS; `news/compose.yaml` still names `flow.news` in env |
| `news/compose.yaml` still defines `news-social` | Drift | Container removed; `news-redis` now unused |
| Stale `e22ff0999a6a_open-webui` container (Created state) | Cleanup pending | Harmless after INFRA-008 probe fix |
| Postiz Google login button | Limitation of v2.26.0 | No supported option to hide it; Google login reuses `YOUTUBE_*` credentials |
| Postiz before connecting Instagram/TikTok media channels | Needs Access bypass for `/uploads/*` | Decision needed |
| Postiz email (SMTP) | Not configured | No password-reset emails |
| Self-registered Postiz users | Each gets a separate workspace | Use in-app invites for shared workspace; add Marketing to a Postiz-specific Access policy, **not** the shared operator policy |
| `docs/ops/deployment-source-of-truth.md` | Partly outdated | Edge is now Coolify Traefik, not Caddy; deploys are manual (banner added) |
| Portal status probe | Prefers the first *running* container | For multi-container services without a required public route this could mask a stopped main container — small follow-up |

## 4. Production map (no secrets)

| Component | Where | Deploy method |
|---|---|---|
| GetTouch Portal | Coolify app `mqmo5bwkxysedbg7vvh6tk1f` (`getouch-coolify-app`) | Manual Coolify deploy |
| Edge | Cloudflare → tunnel `getouch-home` (remote-managed ingress) → Coolify Traefik (`coolify-proxy`) | Cloudflare dashboard/API; Traefik dynamic files in `/data/coolify/proxy/dynamic/` |
| Postiz | `/home/deploy/apps/postiz` (compose project `postiz`); data `/data/getouch/postiz` + `./data`; runbook `RESTORE.md` there | `docker compose` on the VPS |
| Airbyte | abctl kind cluster `airbyte-abctl`, ingress `127.0.0.1:8006` | abctl |
| PostgreSQL (shared) | `getouch-postgres` (PG 16) | — |
| Backups | `getouch-backup.timer` → `/srv/backups/<date>` (14 days, same host) | systemd |
| Identity | Authentik 2025.10.3 at `sso.getouch.co` | Coolify |

## 5. Production deployment log (portal)

All rows are manual (`is_webhook = false` in Coolify).

| Date (UTC) | Commit | Trigger | Verified |
|---|---|---|---|
| 2026-11-20 17:17 | `fc57ab3` | Manual UI redeploy (after a UI settings change at 16:40:57) | Running now, healthy |
| 2026-11-20 16:40 | `fc57ab3` (PR #3) | Manual UI | `/api/build-info` 2026-11-21 |
| 2026-11-17 14:29 | `a38d46d` (PR #2) | Manual | — |
| 2026-11-17 14:02 | `d932de2` (PR #1) | Manual | — |
| 2026-09-22 10:42 | `dd6c07a` | Manual | — |

## 6. Pre-tracker history

Earlier work (2026-03 → 2026-06) is documented in `docs/` (AI gateway, Baileys, Evolution, Chatwoot, MCP,
object storage, FusionPBX, Supabase self-hosting, monitoring, latency and shutdown investigations). Those
documents were **not re-verified** for this tracker; treat their status claims as historical.

## 7. How to update this file

1. Change the item's row; never delete history — move it to *Delivered* with evidence.
2. Update **Last reconciled** and, after any deploy, §5 and the header line.
3. One status per item, from the legend. No secrets, ever.
4. Ship tracker edits in the same PR as the work they describe (ops changes: a docs PR).
