# Secrets and API Keys Boundary

Updated: 2026-05-01

## Boundary Rules

- Portal API Key Manager = keys issued to tenants, apps, and clients.
- Infisical = internal infrastructure and application secrets vault.
- Coolify ENV = current runtime environment variable source for deployed applications.
- No secrets are committed to Git.

## Current State

### Portal API Key Manager

- Intended for externally consumed keys and scoped access tokens.
- Keys should be masked in operator views and logs.
- This is the correct place for tenant-facing API credentials.

### Infisical

- Intended for internal service secrets, bootstrap credentials, provider keys, and non-public runtime secrets.
- Now installed in production on `infisical.getouch.co`.
- The portal sidebar opens the real Infisical UI directly; the old portal status page is no longer the primary navigation path.
- Initial admin onboarding and access policy setup are still pending before it should become the managed source of truth.

### Coolify Environment Variables

- Remain the current runtime configuration mechanism for deployed applications.
- Should not be exported into Git-tracked files.
- Remain the active source of runtime truth until Infisical onboarding and migration are completed.

## Practical Rule of Thumb

- If a key is issued to a tenant, partner, app, or client: manage it in the portal API Key Manager.
- If a secret is used by platform infrastructure or an internal service: keep it in Coolify ENV today, and move it into Infisical only after the vault bootstrap, operator access policy, and migration plan are completed.

## Runtime Install Note

- LiteLLM provider credentials, Langfuse bootstrap secrets, and other internal service secrets still belong on the internal side of this boundary.
- No `.env` files or secrets were committed during the runtime installation work.
