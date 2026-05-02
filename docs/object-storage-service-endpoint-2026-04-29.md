# Object Storage Service Endpoint

Date: 2026-04-29

## Purpose

This document records the canonical Getouch Object Storage control plane and
service endpoint shipped on 2026-04-29.

It does **not** replace the shared SeaweedFS infrastructure doc in
`docs/s3-object-storage-2026-04-26.md`. Instead, it adds the portal-facing
control plane, migration, operator workflow, and validation notes for the new
service endpoint.

## Canonical surfaces

- Portal route: `https://portal.getouch.co/infra/object-storage`
- Admin route: `https://portal.getouch.co/admin/infra/object-storage`
- Legacy redirect: `https://portal.getouch.co/admin/object-storage`
- Browser console: `https://s3.getouch.co`
- S3-compatible API: `https://s3api.getouch.co`
- Internal S3 endpoint: `http://seaweed-s3:8333`
- Internal filer endpoint: `http://seaweed-filer:8888`
- Internal master endpoint: `http://seaweed-master:9333`

## Scope of the rebuild

The rebuild introduces a portal-side control plane only. Real object bytes and
bucket metadata continue to live in SeaweedFS.

The portal now owns:

- bucket visibility and admin actions
- tenant-to-bucket/prefix mappings
- access-key inventory metadata
- object-storage activity/audit trail
- a browser-style operator console with 7 tabs

The portal does **not** become the S3 gateway itself. End-user and service
traffic still flows through `s3api.getouch.co`.

## Portal telemetry mode

The live Coolify app container is **not** attached to the SeaweedFS Docker
network, so the portal runtime cannot resolve or reach:

- `seaweed-master:9333`
- `seaweed-filer:8888`
- `seaweed-s3:8333`

Because of that runtime boundary, the Object Storage overview and settings
telemetry now use the same host-side SSH relay pattern already used by the
portal infrastructure pages.

Current telemetry sources:

- master status: `docker exec seaweed-master wget -qO- http://127.0.0.1:9333/dir/status`
- filer bucket index: `docker exec seaweed-filer wget -qO- --header="Accept: application/json" "http://127.0.0.1:8888/buckets/?limit=200"`
- backing filesystem capacity: `df -B1 /srv/archive/seaweedfs`
- SeaweedFS path usage: `du -sb /srv/archive/seaweedfs`

UI semantics after this change:

- `Used Storage` reflects the SeaweedFS data path footprint under
  `/srv/archive/seaweedfs`
- `Free` reflects backing filesystem availability on `/srv/archive`, which is a
  shared filesystem used by other platform services too
- bucket-level object and size totals intentionally degrade to `Unavailable`
  when the filer can only provide a prefix-level root listing and the totals
  would otherwise be misleading

## Storage engine decision

SeaweedFS was retained after live VPS audit.

Verified live containers:

- `seaweed-master`
- `seaweed-volume`
- `seaweed-filer`
- `seaweed-s3`
- `filestash`

## Host storage path

Requested target path in the original plan: `/srv/archive/object-storage`

Verified live path retained in production: `/srv/archive/seaweedfs`

Current bind-mounted live paths:

- `/srv/archive/seaweedfs/master`
- `/srv/archive/seaweedfs/volume`
- `/srv/archive/seaweedfs/filer`

Reason for deviation:

- SeaweedFS was already deployed and healthy on the VPS
- moving data paths during the portal rebuild would have been a separate storage
  migration with unnecessary production risk

If a path rename is still desired later, do it as a dedicated infra change with
 service downtime planning or bind-mount aliasing. It was intentionally **not**
 coupled to this portal rollout.

## Database migration

Migration file:

- `drizzle/0011_object_storage.sql`

Applied to the live portal database:

- database: `getouch.co`
- runtime source: `DATABASE_URL=postgresql://getouch@postgres:5432/getouch.co`

Migration checksum at rollout time:

- `ffc2882fdff148c48152de94a856a4a8857cfb1f7b0bef5a2002d926c1582324`

Objects created by the migration:

- enum `object_storage_tenant_status`
- enum `object_storage_access_key_status`
- enum `object_storage_access_key_permission`
- table `object_storage_tenant_mappings`
- table `object_storage_access_keys`
- table `object_storage_activity`

This migration is intentionally scoped to Object Storage control-plane objects
only. No unrelated tables were modified.

## Portal schema ownership

Portal-side Drizzle schema additions:

- `objectStorageTenantMappings`
- `objectStorageAccessKeys`
- `objectStorageActivity`

These tables are metadata only.

They do **not** duplicate:

- raw object bytes
- SeaweedFS filer metadata
- S3 auth runtime state inside `seaweed-s3`

## New portal APIs

The service endpoint is backed by these admin routes:

- `/api/admin/object-storage/overview`
- `/api/admin/object-storage/buckets`
- `/api/admin/object-storage/buckets/[bucket]`
- `/api/admin/object-storage/objects`
- `/api/admin/object-storage/tenants`
- `/api/admin/object-storage/access-keys`
- `/api/admin/object-storage/activity`
- `/api/admin/object-storage/settings`
- `/api/admin/object-storage/test`

These routes are admin-protected and use the existing portal session model.

## 7-tab portal console

The canonical UI is:

- `app/admin/service-endpoints/object-storage/page.tsx`
- `app/admin/service-endpoints/object-storage/ObjectStorageConsole.tsx`

Tabs shipped:

1. Overview
2. Buckets
3. Tenants
4. Access Keys
5. Browser
6. Activity
7. Settings

## Access key model

Important operational constraint:

- the portal can mint and track key metadata
- the portal stores only a hash of the secret
- the portal shows the secret exactly once
- the live SeaweedFS S3 gateway still authorizes identities from
  `/home/deploy/apps/getouch.co/infra/seaweedfs/s3.json`

That means access-key creation in the portal is currently a **control-plane
inventory plus issuance UI**, not fully automated gateway authorization.

Manual operator step still required after generating a key:

1. add matching credentials/policy to `infra/seaweedfs/s3.json` on the VPS
2. restart `seaweed-s3`

This limitation is explicitly surfaced in the UI under Access Keys and Settings.

## Recommended bucket and prefix strategy

Default multi-tenant pattern:

- bucket: service bucket such as `getouch-media`
- prefix: `<tenant_id>/<service>/`

Example:

- `getouch-media/ten_abc123/whatsapp/`
- `getouch-media/ten_abc123/chatwoot/`
- `getouch-media/ten_abc123/dify/`

This keeps the S3 surface stable while allowing future migration to AWS S3,
Cloudflare R2, or another compatible backend.

## App integration example

```env
S3_ENDPOINT=https://s3api.getouch.co
S3_REGION=us-east-1
S3_BUCKET=getouch-media
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY_ID=<generated-access-key>
S3_SECRET_ACCESS_KEY=<generated-secret>
```

For tenant-aware writes:

- prefix should be set by the application layer from the portal-controlled
  tenant mapping
- applications should not invent their own tenant identity source

## Health and smoke test

The Settings tab exposes a round-trip test through:

- `POST /api/admin/object-storage/test?op=roundtrip`

Current smoke sequence:

1. create bucket `getouch-smoketest`
2. upload a text object
3. list objects
4. delete the object

This validates the live filer/master control path and basic object lifecycle.

Important note after the Coolify runtime isolation audit:

- overview and settings telemetry use the host SSH relay described above
- the round-trip smoke test still uses the direct portal runtime control path
  and should be migrated to the same relay model if it needs to run from the
  isolated Coolify app container

## Rollback

Portal rollback is straightforward and does not require deleting SeaweedFS data.

Application rollback:

1. redeploy previous portal commit in Coolify
2. keep SeaweedFS containers and data as-is

Database rollback choices:

- safe option: leave the new `object_storage_*` tables in place unused
- destructive rollback: drop only the three `object_storage_*` tables and the
  three `object_storage_*` enums after confirming no portal code depends on them

Do **not** remove SeaweedFS buckets or host storage paths as part of a portal UI
rollback.

## Constraints honored in this rollout

- SeaweedFS kept as the live backend
- `s3.getouch.co` and `s3api.getouch.co` left in place
- no Baileys, Evolution, Dify, Chatwoot, MCP, LiteLLM, or Voice runtime changes
  were required for the Object Storage deployment itself
- no unrelated database objects were modified by migration `0011`

## Manual work still remaining after rollout

- optional: automate portal-generated access keys into `s3.json`
- optional: migrate host storage path from `/srv/archive/seaweedfs` to
  `/srv/archive/object-storage` if infrastructure standardization is still wanted
- optional: add service consumers to use tenant mappings programmatically