# Proposal: admin-only Project Control page (GOV-001-UI) — PLANNED

**Goal:** one admin page in the GetTouch Portal that shows *what the project says* next to *what production
is actually running*, and flags where they disagree or are out of date.

## Data sources

| Panel | Source | Access | Refresh |
|---|---|---|---|
| Project status (board, task records, findings summary, discrepancy log) | `docs/PROJECT_STATUS.md` on `main`, fetched from the GitHub API | Read-only; public repository, optional read-only token for rate limits | Cached, ~5 min, with ETag |
| Open / merged PRs | GitHub API (PR list for the repository) | Read-only | Cached, ~5 min |
| Production commit | Portal's own `/api/build-info` | Local, read-only | On request |
| Latest deployment (time, status, trigger) | Coolify, through a **read-only** credential or the existing server-side probe | Read-only; never deploy-capable | Cached, ~1 min |
| Service health | Existing live service probes (same as the infrastructure pages) | Read-only | Existing probe cache (60 s) |

The tracker in GitHub remains the single source of **status**. Runtime panels show **facts**; the page never
writes to GitHub, Coolify or any service, and keeps no second copy of status in the database.

## Freshness and warnings

Every panel shows its **last successful sync time**. Warnings appear at the top of the page:

| Condition | Warning |
|---|---|
| A source fetch failed | "Showing cached data from <time>" (cached data is still shown, labelled) |
| Tracker "Last reconciled" older than 7 days | "Tracker not reconciled for N days" |
| Production commit ≠ `main` head | "`main` is N commits ahead of production (undeployed changes)" |
| Production commit not on `main` | "Production runs a commit not on `main`" |
| A board item says DEPLOYED/VERIFIED but its PR is not merged, or the commit is not in production | "Tracker disagrees with live evidence: <task>" — the live value is shown, per the tracker's precedence rule |
| Probe snapshot older than its cache window | "Health data stale" |

## Security

- Admin-only, behind the portal's existing admin session check; no new authentication.
- Shows only what is in the public tracker plus read-only runtime facts. Restricted security evidence is
  **not** displayed here.
- Credentials (GitHub token, Coolify read-only token) stay server-side, are read-only, and are never sent to
  the browser.
- Responses are sanitised: no environment values, host paths or internal identifiers on the page.

## Tests

- Parser: every section of the current tracker parses; unknown status values render as "UNKNOWN", never hidden.
- Freshness: each warning condition above triggers with fixture data; no warning on fresh, consistent data.
- Source failure: a failed GitHub or Coolify fetch shows cached data with its age, never an empty "all good".
- Access: non-admin → denied; admin → page renders.
- No secrets: rendered output contains no token or credential patterns.

## Size and rollback

Roughly one route, one parser, one small server-side fetch module and tests; no database change. Rollback =
revert the PR.
