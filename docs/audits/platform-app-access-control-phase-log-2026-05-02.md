# Platform App Access Control Phase Log (2026-05-02)

## 1. Objective

Implement a portal-side control-plane registry for product apps, tenant bindings, service integrations, and secret references, while preserving the existing API key manager and ensuring all schema work runs only against the GetTouch portal database.

## 2. Correct App/Container Verification

- Verified the current GetTouch portal Coolify application resource from the live host as `edierwangetouchcomain-mqmo5bwkxysedbg7vvh6tk1f`.
- Verified the running portal container as `mqmo5bwkxysedbg7vvh6tk1f` with FQDN `getouch.co` on branch `main`.
- Verified the redacted portal DB target from container env as host `getouch-postgres`, port `5432`, database `getouch.co`.
- Verified the production WAPI Coolify application resource as `wapimain-nql6rdsjrcmlvcee1o2dz8wd`.
- Verified the running WAPI container as `nql6rdsjrcmlvcee1o2dz8wd-045741258840` with FQDN `wapi.getouch.co` on branch `main`.
- Verified the redacted WAPI DB target from container env as host `getouch-postgres`, port `5432`, database `wapi`.
- No stale legacy portal runtime name was used for the live verification path. The outdated naming was found only in repository docs/scripts and removed from active content.

## 3. Confirmed DB Target: getouch.co

- The migration execution path used the current portal container env as the source of truth.
- A `current_database()` guard ran before SQL execution and returned `getouch.co`.
- The migration was not allowed to proceed unless the target database name matched `getouch.co` exactly.

## 4. Confirmed WAPI DB Was Not Modified

- WAPI was verified separately against database `wapi`.
- Read-only verification on the WAPI DB returned `to_regclass('public.platform_apps') = null`.
- This confirms the new control-plane tables were not created in the WAPI database.

## 5. Migration File Path

- `drizzle/0012_platform_app_access_control.sql`

## 6. Tables Created

- `platform_apps`
- `platform_app_tenant_bindings`
- `platform_service_integrations`
- `platform_secret_refs`

## 7. Seed Data Inserted

- Seeded one real starter app row in `platform_apps`:
  - `app_code = wapi`
  - `name = WAPI`
  - `description = WhatsApp-first multi-tenant communication and AI product app`
  - `auth_model = app_owned`
  - `default_channel = whatsapp`
  - `status = active`
  - `metadata = {"primary": true, "uses_shared_ai_ecosystem": true, "tenant_model": "multi_tenant"}`
- No fake tenant bindings were inserted.
- No fake service integrations were inserted.
- No fake secret refs were inserted.

## 8. UI Files Changed

- `app/admin/api-keys/page.tsx`
- `app/admin/api-keys/AppAccessControlConsole.tsx`
- `app/admin/data.ts`
- `app/globals.css`
- `app/api/admin/platform-app-access/route.ts`
- `lib/platform-app-access.ts`
- `lib/schema.ts`

## 9. What Remains Planned

- External API provisioning remains out of scope for this registry phase.
- No production tenant binding, service-link, or secret-ref backfill was performed automatically.
- The seeded WAPI registry row remains in place until an operator deletes it manually from the writable UI.

## 10. Build/Test Result

- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- Live portal DB verification after migration:
  - `current_database() = getouch.co`
  - portal tables present: `platform_apps`, `platform_app_tenant_bindings`, `platform_service_integrations`, `platform_secret_refs`
  - `platform_apps` row count = `1`
  - seeded row present: `wapi|WAPI|active`
- Live WAPI DB verification:
  - `current_database() = wapi`
  - `public.platform_apps` absent

## 11. Git Commit Hash After Push

- The final pushed HEAD hash is reported in the operator handoff after push.
- Embedding that same final HEAD hash inside this document would require a follow-up commit, so this section intentionally records the operational limitation instead of creating a second deployment-only commit.

## Phase 2A — Writable Registry UI

- Objective:
  - Make App Access Control writable so operators can create, edit, disable, and delete registry-only app records, tenant bindings, service integrations, and secret refs from the portal UI.
- DB target verification:
  - Re-verified before Phase 2A work that the live portal Coolify app points to host `getouch-postgres`, database `getouch.co`.
  - Re-verified that the live WAPI Coolify app points to host `getouch-postgres`, database `wapi`.
- Files changed:
  - `app/admin/api-keys/AppAccessControlConsole.tsx`
  - `app/globals.css`
  - `app/api/admin/platform-app-access/_utils.ts`
  - `app/api/admin/platform-app-access/apps/route.ts`
  - `app/api/admin/platform-app-access/apps/[id]/route.ts`
  - `app/api/admin/platform-app-access/tenant-bindings/route.ts`
  - `app/api/admin/platform-app-access/tenant-bindings/[id]/route.ts`
  - `app/api/admin/platform-app-access/service-integrations/route.ts`
  - `app/api/admin/platform-app-access/service-integrations/[id]/route.ts`
  - `app/api/admin/platform-app-access/secret-refs/route.ts`
  - `app/api/admin/platform-app-access/secret-refs/[id]/route.ts`
  - `lib/platform-app-access.ts`
  - `lib/platform-app-access-mutations.ts`
- CRUD actions implemented:
  - Create app from UI.
  - Edit app display fields and status.
  - Disable app.
  - Delete app from registry only, with typed app-code confirmation and cascade through registry-only child rows.
  - Create, edit, disable, and delete tenant bindings.
  - Create, edit, disable, and delete service integrations.
  - Create, edit, disable, and delete secret refs.
- Safety boundaries:
  - All writes are admin-gated server-side via the portal auth pattern.
  - Secret ref forms store only reference paths and metadata, never raw secret values.
  - No WAPI business data is touched.
  - No Dify, Chatwoot, Evolution, LiteLLM, vLLM, Langfuse, or Infisical resource is created, modified, or deleted by Phase 2A actions.
- Reset/delete behavior:
  - Deleting an app deletes only portal registry rows through existing foreign-key cascades.
  - The delete modal shows app name, app code, tenant binding count, service integration count, secret ref count, and an explicit warning that only registry mappings are removed.
  - The seeded WAPI row was not auto-deleted; it can now be removed manually from the UI and recreated cleanly through the same UI.
- Build result:
  - `npx tsc --noEmit`: passed.
  - `npm run build`: passed.
- Commit hash:
  - The pushed Phase 2A commit hash is reported in the operator handoff after push to avoid a self-referential follow-up commit.

## Phase 2B — Simplified App Creation and Default Ecosystem Capabilities

- Objective:
  - Simplify App Access Control so admins create only the product container and tenant header records, while the portal auto-enables shared ecosystem capabilities by default.
- DB target verification:
  - Re-verified before the Phase 2B migration that the live portal Coolify app points to host `getouch-postgres`, database `getouch.co`.
  - Re-verified separately that the live WAPI Coolify app points to host `getouch-postgres`, database `wapi`.
  - Post-migration verification returned:
    - portal: `getouch.co|platform_app_service_capabilities|1|9|9`
    - wapi: `wapi|null|null`
  - This confirms the new capability table exists only in the portal DB and that WAPI remained untouched.
- New table and migration summary:
  - Added `drizzle/0013_platform_app_service_capabilities.sql`.
  - Added `platform_apps.environment` with default `production`.
  - Added new portal-only table `platform_app_service_capabilities` with one row per app and ecosystem service.
  - Backfilled default capability rows for existing apps, including the seeded WAPI app.
  - Default ecosystem services backfilled or created automatically:
    - `evolution`
    - `baileys`
    - `dify`
    - `litellm`
    - `vllm`
    - `qdrant`
    - `chatwoot`
    - `langfuse`
    - `webhooks`
- UI changes:
  - Replaced the technical Create App form with a simplified flow using only App Name, Environment, and optional Description.
  - App Code is now generated automatically and shown as a read-only system identifier in the overview.
  - Added an Ecosystem Services grid showing default capability access per app.
  - Simplified Add Tenant Binding to Tenant Name, Environment, and optional Description.
  - Renamed Service Integrations wording in the admin UI to Service Links.
  - Renamed Secret Refs wording in the admin UI to Secret References.
  - Removed technical create-time choices from the normal path, including manual app code input, auth model, default channel, and metadata flags.
  - Kept advanced JSON behind a collapsible Advanced section only.
- App code and tenant key generation behavior:
  - `app_code` is now generated from App Name using lowercase slug rules.
  - Duplicate app names append numeric suffixes such as `wapi-2` and `wapi-3`.
  - `app_tenant_key` is now generated from Tenant Name using the same slug rules, scoped per app.
  - Duplicate tenant names inside the same app append numeric suffixes such as `abc-trading-2`.
- Default ecosystem capability behavior:
  - Creating an app now automatically inserts capability rows for the shared ecosystem service catalog.
  - The portal does not create fake tenant bindings, fake service links, or fake secret refs during app creation.
  - Default app metadata now records ecosystem access as enabled and marks the record as created from App Access Control.
- Meaning of status labels:
  - `Available` means the app is allowed to use that ecosystem service, but no actual resource link exists yet.
  - `Not Linked` means a tenant has inherited the capability, but no concrete service resource is mapped for that tenant yet.
  - `Linked` means a real registry service link row exists for the service.
  - `Disabled` means the capability or specific link is intentionally unavailable.
  - `Error` means the capability or link requires operator attention.
- What is not implemented yet:
  - No external API provisioning for Dify, Chatwoot, Evolution, LiteLLM, vLLM, Qdrant, Langfuse, Baileys, or webhook systems.
  - No direct writes to any external tool database.
  - No external resource deletion.
  - No secret value storage or display. Secret References still store only path, provider, key, and scope metadata.
- Build result:
  - `npx tsc --noEmit`: passed.
  - `npm run build`: passed.
- Commit hash:
  - Phase 2B feature implementation commit: `8159190`

## Legacy Portal Naming Cleanup

- Files searched: repo-wide search across the GetTouch portal repository using the retired portal naming variants requested in the task.
- Files changed:
  - `scripts/verify-no-legacy-web.sh`
  - `docs/ops/deployment-source-of-truth.md`
- Final grep result:
  - Working tree search excluding `.git` returned no output.
  - The exact repo-root grep still returns historical matches under `.git/logs` and `.git/lost-found`, which are Git metadata rather than active repository content and are not safe to rewrite as part of application work.
- Current naming now recorded as GetTouch portal / `getouch.co` / `edierwan/getouch.co:main` / Coolify application resource.
- No backup files were created.