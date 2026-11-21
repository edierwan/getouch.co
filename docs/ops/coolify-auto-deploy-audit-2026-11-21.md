# Coolify auto-deploy audit (SERAPOD-INFRA-GOV-001, 2026-11-21)

**Question:** why does merging to `main` not deploy the portal?

**Cause: VERIFIED.** The organisation's GitHub App sends its webhook deliveries to a host that does not run
Coolify. Every recent delivery for this repository (pushes and pull requests) was answered with HTTP 404, so
Coolify never sees them. Confirmed from the App's own delivery log on 2026-11-21.

**Earlier inference corrected (tracker D7).** An earlier revision of this audit inferred that the App's
installation did not include this repository. The App's installation actually covers **all** repositories,
including this one; that inference was wrong.

**Policy outcome:** production deploys stay **manual**, after review and green CI checks. The portal's Coolify
auto-deploy toggle was turned **off** on 2026-11-21 (GOV-001-DEPLOY). Unconditional auto-deploy is not to be
enabled.

Detailed evidence (identifiers, hostnames, timestamps, configuration values) is kept in the restricted register
held by the repository owner, because this repository is public.

## Findings

| # | Check | Result | Label |
|---|---|---|---|
| 1 | Portal app in Coolify | Linked to `main` through the organisation's GitHub App. Auto-deploy toggle was on; now **off** | VERIFIED |
| 2 | Deployment history | Every recorded portal deployment was started manually; no webhook-triggered deployment has ever been recorded for any app using this App | VERIFIED |
| 3 | App installation | Covers all repositories; subscribed to push and pull-request events | VERIFIED |
| 4 | App webhook target | Points to a host that does not run Coolify | VERIFIED |
| 5 | Recent App deliveries for this repository | Pushes and pull requests, all answered 404 | VERIFIED |
| 6 | Coolify's own webhook endpoint | Reachable through the edge and answering | VERIFIED |
| 7 | Manual deployment | The UI deploy action does not depend on the auto-deploy toggle | VERIFIED (Coolify source) |

## Caution before any webhook fix

Several other applications on the same Coolify instance still have their auto-deploy toggles **on**. They are
inert only because deliveries are misdirected. Correcting the App's webhook URL would immediately start
automatic deployments for those applications. Review and decide each application's toggle first
(GOV-001-WEBHOOK).

## Options (owner approval needed)

| Option | Change | Effect |
|---|---|---|
| **A. Keep as is (recommended)** | None | Manual deploys everywhere in practice; webhooks keep failing harmlessly |
| B. Correct the webhook URL later | Update the App's webhook URL after reviewing every application's toggle | Applications with toggles on start auto-deploying; the portal stays manual |
| C. CI-triggered deploy | Not recommended: would store a deploy-capable Coolify credential in GitHub | — |

## Documentation drift

`docs/ops/deployment-source-of-truth.md` states that pushes auto-deploy and names a different edge proxy;
both are outdated. A banner was added to that file.
