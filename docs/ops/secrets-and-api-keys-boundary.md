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
- Not currently installed in production.
- Can become the centralized vault later once bootstrap and access policies are in place.

### Coolify Environment Variables

- Remain the current runtime configuration mechanism for deployed applications.
- Should not be exported into Git-tracked files.
- Can later be synchronized from a centralized vault when the secrets platform is established.

## Practical Rule of Thumb

- If a key is issued to a tenant, partner, app, or client: manage it in the portal API Key Manager.
- If a secret is used by platform infrastructure or an internal service: keep it in Coolify ENV today, and move it into Infisical when that vault becomes the managed source of truth.
