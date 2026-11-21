# GetTouch / Serapod Infrastructure — Project Status

> **Canonical project tracker.** This file is the single place where project status is recorded. Chat
> transcripts, private reports and PR descriptions are evidence, not status.
>
> **Live evidence wins.** When verified live evidence (the running production commit, the GitHub PR state,
> a health check) contradicts this file, the evidence is correct: record the mismatch in
> [§5 Discrepancy log](#5-discrepancy-log) and fix this file in the same change.
>
> **This repository is public.** This file holds no secrets, credentials, host paths, internal resource IDs,
> component versions or vulnerability details. Security evidence is kept in a **restricted register held by
> the repository owner**; this file refers to findings by ID only.
>
> AI agents: follow [`AGENTS.md`](../AGENTS.md).

- **Last reconciled:** 2026-11-21 (SERAPOD-INFRA-GOV-001 final gate, live-checked)
- **Production portal commit:** `fc57ab3` (= `main`), deployed 2026-11-20 17:17 UTC, healthy — VERIFIED 2026-11-21
- **Deployment policy:** production deploys are **manual** in Coolify, after review and green CI checks. Merging does not deploy. The portal's Coolify auto-deploy toggle is **off** (VERIFIED 2026-11-21).

## 1. Status vocabulary

Each task record carries three separate statuses.

| Field | Allowed values |
|---|---|
| Implementation | `PLANNED` · `IMPLEMENTED` (on a branch / open PR) · `MERGED` (on `main`) · `APPLIED` (operational change, no code) · `BLOCKED` · `N/A` |
| Deployment | `NOT DEPLOYED` · `DEPLOYED` (running in production; give commit and date) · `N/A` |
| Verification | `UNVERIFIED` · `VERIFIED` (checked in production; say what, when) · `VERIFIED (LIMITED)` (say what could not be checked) |

The board's **Stage** column is the furthest point reached: `PLANNED` → `IMPLEMENTED` → `MERGED` → `DEPLOYED` → `VERIFIED`, or `APPLIED`, `BLOCKED`.

## 2. Board

| Task ID | Title | Stage | Next safe action |
|---|---|---|---|
| SERAPOD-INFRA-007 | Portal statuses from live probes | VERIFIED | None |
| GETOUCH-UAT-001 | Separate Supabase API gateway from Studio | DEPLOYED | Owner: confirm Studio access in production |
| SERAPOD-INFRA-008 | Airbyte in portal + verified service statuses | VERIFIED | None |
| AIRBYTE-RUNTIME | Airbyte platform on the VPS | VERIFIED | Connect data sources only after approval |
| SERAPOD-INFRA-009 | Retire an unused n8n hostname | IMPLEMENTED | Review PR #4 |
| TASK-4 | Postiz platform | VERIFIED | Decide registration policy before team onboarding |
| TASK-4-PORTAL | Postiz in portal Business Applications | IMPLEMENTED | Review PR #5 |
| TASK-4B | Postiz CLI integration | BLOCKED | Decide access route (broker adapter or scoped service credential) |
| SEC-001-CONTAIN | Contain dormant platform credential | VERIFIED | None — do not repeat or reverse |
| SEC-001-UI | Security UI accuracy | IMPLEMENTED | Review PR #6 |
| SEC-001-DB-A | Least-privilege database access for the portal (phase A) | PLANNED | Owner approval |
| SEC-001-DB-B | Database object ownership (phase B) | PLANNED | After phase A |
| SEC-001-ROLE | Remove unused privileged database login | PLANNED | Owner approval |
| SEC-001-HOST | Reduce portal host-access privilege | PLANNED | Owner approval of design |
| SEC-001-IDP | Identity provider administrator hardening | PLANNED | Owner approval |
| SEC-001-BACKUP | Backup resilience | PLANNED | Owner decision on destination |
| BROKER-W1…W7 | Platform broker hardening waves | PLANNED | Approve wave 1 |
| GOV-001 | Project tracker, agent rules, CI checks | IMPLEMENTED | Review PR #7 |
| GOV-001-DEPLOY | Manual deploy policy + portal auto-deploy toggle off | VERIFIED | None |
| GOV-001-WEBHOOK | Coolify GitHub webhook delivery (misdirected) | PLANNED | Decide other apps' auto-deploy before any fix |
| GOV-001-DEBUG | Portal deployment debug logging | PLANNED | Owner: decide whether to keep it on |
| SEC-002 | Repository visibility and history hygiene | PLANNED | Owner approval (restricted plan) |
| GOV-001-UI | Admin-only Project Control page | PLANNED | Approve proposal |

## 3. Task records

Every record lists: owner, branch, PR, implementation, tests, deployment, verification, rollback, blockers,
next safe action. "Owner" is the accountable role; "AI agent" means work done by an AI coding agent under
owner approval.

### SERAPOD-INFRA-007 — Portal statuses from live probes
- **Owner:** repo owner · AI agent
- **Branch / PR:** `infra-007/evidence-based-status` · PR #1
- **Implementation:** MERGED (`d932de2`)
- **Tests:** not recorded at the time
- **Deployment:** DEPLOYED (included in `fc57ab3`, 2026-11-20)
- **Verification:** VERIFIED via SERAPOD-INFRA-008 (2026-11-21)
- **Rollback:** redeploy an earlier commit in Coolify
- **Blockers:** none
- **Next safe action:** none

### GETOUCH-UAT-001 — Separate Supabase API gateway from Studio
- **Owner:** repo owner · AI agent
- **Branch / PR:** `getouch-uat-001/supabase-studio` · PR #2
- **Implementation:** MERGED (`a38d46d`)
- **Tests:** `tests/supabase-health-classify.test.mjs` (passing on `main`, 2026-11-21)
- **Deployment:** DEPLOYED (included in `fc57ab3`)
- **Verification:** UNVERIFIED (no production check recorded)
- **Rollback:** redeploy an earlier commit in Coolify
- **Blockers:** none
- **Next safe action:** owner confirms Studio access works in production

### SERAPOD-INFRA-008 — Airbyte in portal + verified service statuses
- **Owner:** repo owner · AI agent
- **Branch / PR:** `infra008-airbyte-provisioned` · PR #3
- **Implementation:** MERGED (`fc57ab3`)
- **Tests:** `npm test` 22/22 (7 status-classification tests), `tsc`, `next build` — 2026-11-20
- **Deployment:** DEPLOYED 2026-11-20 16:40 UTC (manual), redeployed 17:17 UTC
- **Verification:** VERIFIED 2026-11-21 — running commit, navigation table and edge access control on the Airbyte link
- **Rollback:** redeploy `a38d46d` in Coolify
- **Blockers:** none
- **Next safe action:** none

### AIRBYTE-RUNTIME — Airbyte platform
- **Owner:** repo owner
- **Branch / PR:** none (operational)
- **Implementation:** APPLIED (before this tracker existed)
- **Tests:** n/a
- **Deployment:** N/A
- **Verification:** VERIFIED 2026-11-20 — health endpoint available, all components running
- **Rollback:** see restricted runbook
- **Blockers:** none
- **Next safe action:** connect production data sources only after approval

### SERAPOD-INFRA-009 — Retire an unused n8n hostname
- **Owner:** repo owner · AI agent
- **Branch / PR:** `infra009-retire-flow-news` · PR #4
- **Implementation:** IMPLEMENTED (portal part); APPLIED (edge part, 2026-11-20)
- **Tests:** `npm test` 23/23, `tsc`, `next build` at PR time
- **Deployment:** NOT DEPLOYED (portal part)
- **Verification:** UNVERIFIED (portal part); edge part VERIFIED 2026-11-20 (hostname no longer resolves; sibling hostnames unaffected)
- **Rollback:** portal — revert PR; edge — restore data in the restricted register
- **Blockers:** review
- **Next safe action:** review PR #4

### TASK-4 — Postiz platform
- **Owner:** repo owner · AI agent
- **Branch / PR:** none (operational)
- **Implementation:** APPLIED 2026-11-20 (isolated stack, pinned image, own database role, separate scheduler persistence)
- **Tests:** controlled restart, media persistence, backup + restore into a throwaway database, scheduler timer fired on schedule 6/6
- **Deployment:** N/A
- **Verification:** VERIFIED 2026-11-21 — all containers healthy; registration enabled for internal evaluation behind edge access control; existing admin unchanged
- **Rollback:** runbook on the host (restricted)
- **Blockers:** none
- **Next safe action:** decide registration and edge-access policy before Marketing Team onboarding

### TASK-4-PORTAL — Postiz in portal Business Applications
- **Owner:** repo owner · AI agent
- **Branch / PR:** `task4-postiz-portal` · PR #5
- **Implementation:** IMPLEMENTED
- **Tests:** `npm test` 22/22, `tsc`, `next build` at PR time
- **Deployment:** NOT DEPLOYED
- **Verification:** UNVERIFIED
- **Rollback:** revert PR
- **Blockers:** review
- **Next safe action:** review PR #5

### TASK-4B — Postiz CLI integration
- **Owner:** repo owner
- **Branch / PR:** none
- **Implementation:** BLOCKED — CLI installed on an operator workstation; API calls are stopped by edge access control
- **Tests:** read-only connectivity checks only
- **Deployment:** N/A
- **Verification:** N/A
- **Rollback:** uninstall the CLI
- **Blockers:** access-route decision
- **Next safe action:** choose broker read adapter (BROKER wave 5) or a scoped service credential

### SEC-001-CONTAIN — Contain dormant platform credential
- **Owner:** repo owner · AI agent
- **Branch / PR:** none (operational)
- **Implementation:** APPLIED 2026-11-21 (one credential disabled; nothing deleted or rotated; dependency check done first)
- **Tests:** n/a
- **Deployment:** N/A
- **Verification:** VERIFIED (LIMITED) 2026-11-21 — stored state confirmed and endpoint behaviour unchanged for other callers; not tested with the real credential (not held)
- **Rollback:** documented in the restricted register
- **Blockers:** none
- **Next safe action:** none. **Do not repeat or reverse without owner approval.**

### SEC-001-UI — Security UI accuracy
- **Owner:** repo owner · AI agent
- **Branch / PR:** `sec001-security-ui-corrections` · PR #6
- **Implementation:** IMPLEMENTED (copy-only)
- **Tests:** `npm test` 27/27 (adds `tests/security-ui-claims.test.mjs`), `tsc`, `next build`
- **Deployment:** NOT DEPLOYED
- **Verification:** UNVERIFIED
- **Rollback:** revert PR
- **Blockers:** review
- **Next safe action:** review PR #6

### SEC-001-DB-A — Least-privilege database access for the portal (phase A)
- **Owner:** repo owner
- **Branch / PR:** none yet
- **Implementation:** PLANNED — role design tested in an isolated environment (57/57 checks)
- **Tests:** isolated permission matrix, functional and denial tests (2026-11-21)
- **Deployment:** NOT DEPLOYED
- **Verification:** UNVERIFIED
- **Rollback:** restore previous connection settings and redeploy (documented in the restricted register)
- **Blockers:** owner approval
- **Next safe action:** approve rehearsal on an on-host copy, then cutover

### SEC-001-DB-B — Database object ownership (phase B)
- **Owner:** repo owner
- **Branch / PR:** none · **Implementation:** PLANNED · **Tests:** isolated rollback test passed
- **Deployment:** NOT DEPLOYED · **Verification:** UNVERIFIED
- **Rollback:** documented in the restricted register · **Blockers:** phase A
- **Next safe action:** none until phase A is stable

### SEC-001-ROLE — Remove unused privileged database login
- **Owner:** repo owner
- **Branch / PR:** none · **Implementation:** PLANNED · **Tests:** n/a
- **Deployment:** N/A · **Verification:** UNVERIFIED
- **Rollback:** re-enable login · **Blockers:** owner approval; confirm no admin tool depends on it
- **Next safe action:** dependency check, then approval

### SEC-001-HOST — Reduce portal host-access privilege
- **Owner:** repo owner
- **Branch / PR:** none · **Implementation:** PLANNED (restricted, read-only probe account) · **Tests:** to be defined
- **Deployment:** NOT DEPLOYED · **Verification:** UNVERIFIED
- **Rollback:** restore previous access configuration · **Blockers:** design approval
- **Next safe action:** approve design

### SEC-001-IDP — Identity provider administrator hardening
- **Owner:** repo owner
- **Branch / PR:** none · **Implementation:** PLANNED · **Tests:** n/a
- **Deployment:** N/A · **Verification:** UNVERIFIED
- **Rollback:** documented in the restricted register · **Blockers:** owner action (device enrolment first)
- **Next safe action:** owner enrols an MFA device, then approves enforcement

### SEC-001-BACKUP — Backup resilience
- **Owner:** repo owner
- **Branch / PR:** none · **Implementation:** PLANNED · **Tests:** restore test required after change
- **Deployment:** N/A · **Verification:** UNVERIFIED
- **Rollback:** n/a · **Blockers:** destination decision
- **Next safe action:** choose destination

### BROKER-W1…W7 — Platform broker hardening
- **Owner:** repo owner · AI agent
- **Branch / PR:** none yet · **Implementation:** PLANNED (waves: default-deny scopes and audit logs; credential lifecycle; rate limits; tenant isolation and secret manager; Postiz read adapter; identity-provider tokens; optional separate runtime)
- **Tests:** each wave ships with its own security tests (listed in the restricted plan)
- **Deployment:** NOT DEPLOYED · **Verification:** UNVERIFIED
- **Rollback:** per wave (feature flags or revert) · **Blockers:** approval per wave
- **Next safe action:** approve wave 1

### GOV-001 — Project tracker, agent rules, CI checks
- **Owner:** repo owner · AI agent
- **Branch / PR:** `gov001-project-tracker` · PR #7
- **Implementation:** IMPLEMENTED (docs, CI workflow, documentation checks)
- **Tests:** `npm test` incl. `tests/docs-governance.test.mjs`; `tsc`; `next build`
- **Deployment:** NOT DEPLOYED (no runtime change)
- **Verification:** UNVERIFIED (CI runs on the PR)
- **Rollback:** revert PR
- **Blockers:** review
- **Next safe action:** review PR #7

### GOV-001-DEPLOY — Manual deploy policy + portal auto-deploy toggle off
- **Owner:** repo owner · AI agent
- **Branch / PR:** policy and CI in PR #7; setting changed directly (operational)
- **Implementation:** APPLIED 2026-11-21 — portal application's Coolify auto-deploy toggle changed from on to off (target verified first; no other application changed)
- **Tests:** n/a
- **Deployment:** N/A (no restart, no redeploy; production still `fc57ab3`)
- **Verification:** VERIFIED 2026-11-21 — setting read back as off; other applications unchanged; no deployment queued; container not restarted; manual deploy action does not depend on the toggle (Coolify source)
- **Rollback:** switch the toggle back on in the portal application's Coolify settings
- **Blockers:** none
- **Next safe action:** none

### GOV-001-WEBHOOK — Coolify GitHub webhook delivery (misdirected)
- **Owner:** repo owner
- **Branch / PR:** none (operational)
- **Implementation:** PLANNED — cause VERIFIED: the GitHub App's webhook URL points to a host that does not run Coolify, so deliveries fail (see [audit](ops/coolify-auto-deploy-audit-2026-11-21.md))
- **Tests:** n/a
- **Deployment:** N/A
- **Verification:** N/A — nothing changed yet (the cause itself was confirmed from the App's delivery log on 2026-11-21)
- **Rollback:** n/a
- **Blockers:** correcting the URL would start auto-deploys for other applications whose toggles are still on
- **Next safe action:** leave as is; review other applications' auto-deploy toggles before any change

### GOV-001-DEBUG — Portal deployment debug logging
- **Owner:** repo owner
- **Branch / PR:** none (operational)
- **Implementation:** PLANNED — debug logging was turned on in the Coolify UI on 2026-11-20 (D4, confirmed from the Coolify audit log); still on
- **Tests:** recent deployment logs scanned: no credential-like content found
- **Deployment:** N/A
- **Verification:** N/A — nothing changed yet
- **Rollback:** toggle in Coolify settings
- **Blockers:** owner decision
- **Next safe action:** turn it off when no deployment is being debugged

### SEC-002 — Repository visibility and history hygiene
- **Owner:** repo owner
- **Branch / PR:** none
- **Implementation:** PLANNED — restricted plan prepared; making the repository private does not affect Coolify builds (verified)
- **Tests:** n/a
- **Deployment:** N/A
- **Verification:** UNVERIFIED
- **Rollback:** repository visibility can be changed back
- **Blockers:** owner approval of the restricted plan
- **Next safe action:** owner reviews the restricted plan and approves the steps in order

### GOV-001-UI — Admin-only Project Control page
- **Owner:** repo owner · AI agent
- **Branch / PR:** none · **Implementation:** PLANNED ([proposal](proposals/project-control-page.md))
- **Tests:** defined in the proposal · **Deployment:** NOT DEPLOYED · **Verification:** UNVERIFIED
- **Rollback:** revert PR · **Blockers:** approval
- **Next safe action:** approve proposal

## 4. Security findings (public summary)

Details, evidence and remediation specifics are in the restricted register. Listed in priority order.

| ID | Area | Status | Task |
|---|---|---|---|
| S1 | Portal host-access privilege | Open | SEC-001-HOST |
| S2 | Dormant platform credential | Contained | SEC-001-CONTAIN |
| S3 | Database connection privileges | Open | SEC-001-DB-A |
| S4 | Unused privileged database login | Open | SEC-001-ROLE |
| S5 | Identity provider administrator hardening | Open | SEC-001-IDP |
| S6 | Backup resilience | Open | SEC-001-BACKUP |
| S7 | Unused credentials in application configuration | Open | SEC-001-DB-A |
| S8 | Admin UI accuracy about enforced controls | Fix in review | SEC-001-UI |
| S9 | Platform credential lifecycle controls | Open | BROKER-W1…W3 |
| S10 | Edge identity integration | Open | BROKER-W6 |
| S11 | Repository history hygiene | Open | SEC-002 |

## 5. Discrepancy log

Mismatches between earlier records and verified live evidence.

| # | Found | Earlier record said | Live evidence | Resolution |
|---|---|---|---|---|
| D1 | 2026-11-20 | PR #3 description: merging to `main` triggers a deploy | No webhook-triggered deploy has ever been recorded; all deploys manual | Corrected here and in the audit |
| D2 | 2026-11-21 | `docs/ops/deployment-source-of-truth.md`: pushes auto-deploy; Caddy is the edge | Deploys are manual; the edge is Coolify's proxy | Banner added to that file |
| D3 | 2026-11-21 | Deploy policy: manual | Coolify auto-deploy toggle for the portal was **on** | Resolved 2026-11-21 — toggle off (GOV-001-DEPLOY) |
| D4 | 2026-11-21 | — | A portal settings change was made in the Coolify UI on 2026-11-20 16:40 UTC, followed by a redeploy; not linked to any task | Resolved — Coolify audit log: the admin account turned on deployment debug logging; tracked as GOV-001-DEBUG |
| D5 | 2026-11-21 | First draft of this file (PR #7, first commit) | Contained security details unsuitable for a public repository | Removed in a later commit; the earlier commit remains visible in PR history — owner decision |
| D6 | 2026-11-21 | First draft: auto-deploy "not working since at least 2026-09" | Evidence shows no webhook deploy recorded at all, not a start date | Wording corrected |
| D7 | 2026-11-21 | Audit (earlier revision): cause INFERRED as missing repository access for the GitHub App | App delivery log: the App covers all repositories; deliveries fail because its webhook URL points to the wrong host | Cause corrected to VERIFIED (GOV-001-WEBHOOK) |

## 6. Known issues and limitations

| Item | State |
|---|---|
| Older `docs/` files contain infrastructure detail (addresses, host paths) in a public repository | Open — owner decision (sanitise and/or repository visibility) |
| Origin certificate renewal error on an internal route | Accepted — no user impact |
| vLLM portal gateway disabled by configuration | Product decision |
| n8n runs internal-only; news stack compose still references retired services | Cleanup pending |
| Stale container left from an earlier redeploy | Cleanup pending |
| Postiz: Google login button cannot be hidden in the current version | Limitation |
| Postiz: some media platforms need an edge-access decision before channels are connected | Decision needed |
| Postiz: email delivery not configured | Open |
| Postiz: self-registered users get separate workspaces | Use in-app invites |
| Portal status probe prefers the first running container | Small follow-up |

## 7. Production map

| Component | Runs as | Deploy method |
|---|---|---|
| GetTouch Portal | Coolify application | Manual Coolify deploy |
| Edge | Cloudflare (tunnel + Access) → Coolify proxy | Cloudflare and Coolify consoles |
| Postiz | Dedicated compose project on the VPS | Compose, runbook on host |
| Airbyte | abctl-managed cluster on the VPS | abctl |
| PostgreSQL | Shared database server | — |
| Backups | Nightly systemd job | — |
| Identity | Authentik | Coolify |

## 8. Production deployment log (portal)

| Date (UTC) | Commit | Trigger | Verified |
|---|---|---|---|
| 2026-11-20 17:17 | `fc57ab3` | Manual (after a UI settings change, see D4) | 2026-11-21 |
| 2026-11-20 16:40 | `fc57ab3` (PR #3) | Manual | 2026-11-21 |
| 2026-11-17 14:29 | `a38d46d` (PR #2) | Manual | — |
| 2026-11-17 14:02 | `d932de2` (PR #1) | Manual | — |
| 2026-09-22 10:42 | `dd6c07a` | Manual | — |

## 9. Pre-tracker history

Work from 2026-03 to 2026-06 is described in older `docs/` files. Those files were not re-verified for this
tracker; treat their status claims as historical.
