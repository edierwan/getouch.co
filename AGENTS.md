# Instructions for AI coding agents

These rules are mandatory for any AI agent working in this repository or on the infrastructure it manages.

1. **Read [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) first.** It is the single source of truth for
   status, open PRs, pending decisions and security findings.
2. **Update it in the same PR** as the work it describes. Operational (non-code) changes get a docs PR.
   Use only the legend statuses (PLANNED, IMPLEMENTED, MERGED, DEPLOYED, VERIFIED, APPLIED, BLOCKED) and give
   evidence for each change of status. State what could not be verified.
3. **Merging does not deploy.** Production deploys are manual in Coolify. Never claim DEPLOYED or VERIFIED
   without checking the running commit (`/api/build-info`).
4. **Ask before production changes.** Items marked PLANNED that need a decision must not be applied without
   explicit approval. Do not repeat or undo items marked APPLIED (e.g. the disabled WAPI key) without approval.
5. **No secrets** in the repo, the tracker, PRs, logs or commit messages. Record where a secret lives, never
   its value.
6. Work on a branch, open a PR, do not merge or force-push without approval. Run `npm test`, `npx tsc --noEmit`
   and `npm run build` before asking for review.
