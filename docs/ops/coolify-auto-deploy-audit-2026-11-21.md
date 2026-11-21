# Coolify auto-deploy audit (SERAPOD-INFRA-GOV-001, 2026-11-21)

**Question:** why does merging to `main` not deploy the portal?

**Status of the cause: INFERRED** (not confirmed). It stays INFERRED until the GitHub App's *Recent
Deliveries* page is checked by the repository owner.

**Policy outcome:** production deploys stay **manual**, after review and green CI checks. Unconditional
auto-deploy on merge is **not** to be enabled.

The audit was read-only. Detailed evidence (identifiers, timestamps, configuration values) is kept in the
restricted register held by the repository owner, because this repository is public.

## Findings

| # | Check | Result | Label |
|---|---|---|---|
| 1 | Portal app in Coolify | Linked to `main` through the organisation's GitHub App; Coolify's auto-deploy toggle is **on** | VERIFIED |
| 2 | Deployment history | Every recorded portal deployment was started manually; no webhook-triggered deployment has ever been recorded for any app using this GitHub App | VERIFIED |
| 3 | Webhook endpoint | Reachable through the edge and answering | VERIFIED |
| 4 | Do GitHub deliveries reach Coolify? | Yes, for at least one repository: a delivery arrived seconds after a push to that repository | VERIFIED |
| 5 | Coolify's matching rules for this repo (repository id, branch, App) | All correct | VERIFIED |
| 6 | Merge of PR #3 | No deployment queued and no signature failure logged | VERIFIED |
| 7 | Which repositories receive deliveries | Only a private repository was observed; `getouch.co` is public | VERIFIED |

## Inference

A delivery for this repository that reached Coolify would either fail its signature check (which is logged —
none seen) or match the portal app (all matching values are correct, so a deployment would be queued — none
seen). So GitHub most likely **does not send** push events for this repository to the App. The likely reason
is that the App's installation covers *selected repositories* that do not include this public repository.
Manual builds still work because public repositories can be read without being in the installation.

**Confirm (owner, needs GitHub login):** GitHub → Settings → Developer settings → GitHub Apps → the Coolify
app → *Install App* (repository access) and *Advanced → Recent Deliveries* for a push to `main`.

## Recommended actions (owner approval needed; none applied)

1. **Turn off the portal's auto-deploy toggle in Coolify.** Today it is on but inert. If the App's repository
   access ever changes, every merge would start deploying unconditionally, contrary to policy.
2. **Keep deploys manual** with the CI checks added in PR #7 (`.github/workflows/ci.yml`: tests, type-check,
   build on every PR and on `main`). Deploy only a commit whose checks passed.
3. **Optionally confirm the inference** via *Recent Deliveries*. Changing the App's repository access is not
   needed for the manual policy and should not be done together with an enabled auto-deploy toggle.

## Documentation drift

`docs/ops/deployment-source-of-truth.md` states that pushes auto-deploy and names a different edge proxy;
both are outdated. A banner was added to that file.
