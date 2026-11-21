# Coolify auto-deploy audit (SERAPOD-INFRA-GOV-001, 2026-11-21)

**Question:** why does merging to `edierwan/getouch.co` `main` not deploy the portal?

**Answer (INFERRED, high confidence):** GitHub never sends push events for this repository to Coolify's
GitHub App, most likely because the App's installation does not include the (public) repository. Coolify
can still build it manually because public repositories are readable without being in the installation.
**Definitive check (needs the owner's GitHub login):** GitHub → Settings → Developer settings → GitHub Apps →
the Coolify app → *Install App* (repository access) and *Advanced → Recent Deliveries*.

Audit was read-only: no Coolify, GitHub, Cloudflare or database changes.

## Evidence

| # | Check | Result | Label |
|---|---|---|---|
| 1 | Coolify app for the portal | id 2, `edierwan/getouch.co`, branch `main`, source = private GitHub App (id 2), **auto-deploy enabled** | VERIFIED |
| 2 | GitHub App record in Coolify | App id, installation id, webhook secret and private key all set | VERIFIED |
| 3 | Deployment history | 6 portal deploys (2026-09-22 → 2026-11-20), **all manual** (`is_webhook = false`); **0 webhook-triggered deploys for any of the 9 apps** on this GitHub App | VERIFIED |
| 4 | Webhook path through the edge | `POST https://coolify.getouch.co/webhooks/source/github/events` (unsigned ping) → `pong` from Coolify; Cloudflare Access bypass for this path exists since 2026-03-16 | VERIFIED |
| 5 | Do GitHub deliveries reach Coolify? | Yes: Coolify logged a push delivery at 2026-11-20 05:14:29 UTC, matching a push to **`edierwan/serapod2u_new`** (private) at 05:14:23 UTC | VERIFIED |
| 6 | Coolify's matching rule | Push → app matched by GitHub numeric repo id (`repository_project_id`), App id, branch | VERIFIED (source) |
| 7 | Stored repo ids | All 9 apps' `repository_project_id` match GitHub's ids | VERIFIED |
| 8 | PR #3 merge push (2026-11-20 15:41:24 UTC) | No deploy queued; **no signature-failure audit entry** (Coolify 4.7.6 audits those; audit log covers the whole day) | VERIFIED |
| 9 | Repository visibility | `getouch.co`, `partime`, `wapi`, `systemqr.com` (and others tracked) are **public**; `serapod2u_new` is the only **private** one | VERIFIED |
| 10 | Repo-level webhooks on `getouch.co` | None (expected: a GitHub App delivers its own events) | VERIFIED |

**Reasoning:** a delivery for `getouch.co` that reached Coolify would either fail signature (audited — none
seen) or match the app (ids, branch and source all match → a webhook deploy would be queued — none seen). So
the delivery is not sent. The only repository with observed deliveries is the only private one, which fits an
installation limited to *selected repositories* that never included the public repos.

**Not ruled out without GitHub access:** the App's push-event subscription being disabled for that repo
(unlikely — push events are delivered for `serapod2u_new`), or GitHub delivery failures (Recent Deliveries
would show them).

## Remediation options (all need approval — none applied)

| Option | Change | Effect | Rollback |
|---|---|---|---|
| **A. Grant the App access to the repo** | GitHub App → Install App → *Only select repositories* → add `edierwan/getouch.co` (and other Coolify-tracked public repos), or *All repositories* | Every merge to `main` deploys the portal automatically | Remove the repository from the installation |
| B. Stay manual (current practice) | None; document it (done in `PROJECT_STATUS.md`) | Deploys remain a deliberate step after merge | — |
| C. Coolify deploy webhook from CI | A GitHub Action calls Coolify's deploy API with a stored token on merge | Automatic, but adds a long-lived Coolify token in GitHub secrets | Delete the workflow and revoke the token |

**Recommendation:** decide the deploy policy first. If automatic deploys are wanted, Option A is the smallest
correct fix. Enabling it means **every merge to `main` deploys immediately**, so merges must be treated as
releases. After enabling, verify with the next merge: Coolify should show a deployment with `is_webhook = true`
and Recent Deliveries should show `200` for the push.

## Related documentation drift

`docs/ops/deployment-source-of-truth.md` (2026-05-01) states that a push to `main` auto-deploys via the
Coolify GitHub webhook and that Caddy is the edge with the Coolify proxy disabled. Both are no longer true:
deploys are manual, and the edge is Coolify's Traefik (`coolify-proxy`). A banner was added to that file.
