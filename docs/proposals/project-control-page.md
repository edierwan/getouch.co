# Proposal: admin-only Project Control page (GOV-001-UI) — PLANNED

**Goal:** show `docs/PROJECT_STATUS.md` inside the GetTouch Portal so operators see current status without
reading GitHub, while the Markdown file stays the single source of truth.

## Principles

- **Read-only view of the tracker.** The page never edits status; changes happen through PRs to
  `docs/PROJECT_STATUS.md`. No second copy of status in the database.
- **Shows what is deployed, not what is on `main`.** The tracker is bundled at build time, so the page shows the
  tracker as of the running commit, next to that commit (from the existing `/api/build-info`).
- **Admin-only,** using the portal's existing admin session check (same as `/admin/*` pages). No new auth.

## Design

| Part | Approach |
|---|---|
| Route | `/admin/governance/project` (public path `/governance/project`), new sidebar item under ACCESS & SECURITY or a new GOVERNANCE section |
| Source | `docs/PROJECT_STATUS.md` read at build time (server component, `fs.readFile` during build or a generated JSON) |
| Parsing | Split by `##` sections; parse the Markdown tables into rows; render status values as badges using the legend (PLANNED, IMPLEMENTED, MERGED, DEPLOYED, VERIFIED, APPLIED, BLOCKED) |
| Header | Running commit + deploy time (from build-info) and the tracker's "Last reconciled" date; warn when the running commit is behind `main` is **out of scope** (would need GitHub calls) |
| Live overlays (optional, later) | Link each PR number to GitHub; reuse existing live probes to show service health beside related items |
| Security | No secrets in the tracker (enforced by review + a test that greps the file for key/secret patterns); page behind existing admin guard |

## Tests

- Unit: the table parser handles every section of the current tracker; unknown status values render as
  "UNKNOWN", not hidden.
- Unit: the tracker contains no secret-looking strings (`pk_…`, `sk-…`, `password=`, PEM headers).
- Route: non-admin → 403/redirect; admin → 200.

## Size and rollback

About 2 files plus a parser and tests; no database, no new dependency. Rollback = revert the PR.
