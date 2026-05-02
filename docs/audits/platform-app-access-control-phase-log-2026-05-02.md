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
- No live portal resource named `getouch-web` was used. The stale naming was found only in repository docs/scripts and removed.

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

- Create App write flow remains planned/disabled.
- Add Tenant Binding write flow remains planned/disabled.
- Add Service Link write flow remains planned/disabled.
- Add Secret Ref write flow remains planned/disabled.
- No production tenant binding or service-link backfill was performed in this phase.

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

## Legacy getouch-web Cleanup

- Files searched: repo-wide search across the GetTouch portal repository using the requested `getouch-web`, `GETOUCH_WEB`, `getouch_web`, and `getouch web` patterns.
- Files changed:
  - `scripts/verify-no-legacy-web.sh`
  - `docs/ops/deployment-source-of-truth.md`
- Final grep result: `grep -Rni "getouch-web\|GETOUCH_WEB\|getouch_web" .` returned no output from the GetTouch portal repository root.
- Current naming now recorded as GetTouch portal / `getouch.co` / `edierwan/getouch.co:main` / Coolify application resource.
- No backup files were created.