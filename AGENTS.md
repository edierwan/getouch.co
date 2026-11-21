# Instructions for AI coding agents

These rules are mandatory for any AI agent working in this repository or on the infrastructure it manages.

## Before you start

1. Read [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md). It is the canonical tracker.
2. Check it against live evidence (running production commit via `/api/build-info`, PR state on GitHub). If
   they disagree, **live evidence wins**: add a row to the tracker's discrepancy log and correct the tracker.

## Every task must have a task record

Add or update the task's record in `docs/PROJECT_STATUS.md` (board row + record) **in the same PR** as the
work. Operational (non-code) work gets a docs PR. Each record must contain all of these fields:

| Field | What to write |
|---|---|
| Task ID | Existing ID, or a new one agreed with the owner |
| Owner | Accountable role (e.g. "repo owner"), plus "AI agent" if an agent did the work. No personal emails |
| Branch / PR | Branch name and PR number, or "none (operational)" |
| Implementation | `PLANNED` · `IMPLEMENTED` · `MERGED` · `APPLIED` · `BLOCKED` · `N/A` |
| Tests | Commands run and results (e.g. `npm test` 27/27, `tsc`, `next build`), or why not applicable |
| Deployment | `NOT DEPLOYED` · `DEPLOYED` (commit + date) · `N/A` |
| Verification | `UNVERIFIED` · `VERIFIED` (what was checked, when) · `VERIFIED (LIMITED)` (what could not be checked) |
| Rollback | How to undo it; restricted details go to the restricted register |
| Blockers | What stops progress and who decides |
| Next safe action | The single next step that is safe to take |

Never mark `DEPLOYED` or `VERIFIED` without checking production. Never delete records; move them forward.

## This repository is public

Do not write secrets, credentials, host paths, IP addresses, internal resource IDs, component versions,
access-control bypass details or vulnerability specifics into the repo, PR descriptions or commit messages.
Refer to security findings by ID only. Detailed evidence goes to the restricted register held by the
repository owner. `tests/docs-governance.test.mjs` scans the governance docs for this.

## Production safety

- **Deploys are manual** in Coolify, after review and green CI checks. Do not enable automatic deployment.
- Ask the owner before any production change (database, credentials, Cloudflare, Coolify, service restarts).
- Do not repeat or reverse an `APPLIED` item (for example the SEC-001 credential containment) without owner
  approval.
- Work on a branch, open a PR, never merge or force-push without approval. Run `npm test`, `npx tsc --noEmit`
  and `npm run build` before asking for review.
