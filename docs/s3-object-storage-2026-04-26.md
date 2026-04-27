# Shared S3 Object Storage (SeaweedFS)

Last verified: 2026-04-26
Service URLs:
- Browser UI (Filestash): https://s3.getouch.co
- S3 API endpoint: https://s3api.getouch.co
- Internal endpoint (other containers on `getouch-edge`): `http://seaweed-s3:8333`

This is the single S3-compatible object storage shared by all getouch.co services
(getouch portal, news CMS, WAPI, openclaw, future services). It is NOT WAPI-only.

## 1. Purpose

Provide a self-hosted, S3-compatible bucket store on the getouch.co VPS to:

- Avoid per-GB egress charges of cloud S3.
- Keep tenant data in-region (Asia, Malaysia VPS).
- Let every service swap to AWS S3 / Cloudflare R2 later with no app code change
  (S3 API parity).
- Centralize backups, exports, large media (product/service images, chat media,
  campaign attachments, news media) in one disk pool.

## 2. Current deployment

Stack: SeaweedFS 4.16 (`chrislusf/seaweedfs:latest`), declared in
[compose.yaml](../compose.yaml) under the `seaweed-master`, `seaweed-volume`,
`seaweed-filer`, `seaweed-s3`, `filestash` services, and routed by
[infra/Caddyfile](../infra/Caddyfile).

| Container        | Role                       | Internal port | Health                    |
|------------------|----------------------------|---------------|---------------------------|
| `seaweed-master` | Topology + volume assigner | 9333          | healthy (5+ days)         |
| `seaweed-volume` | Data node (object bytes)   | 8080          | healthy (restarted today) |
| `seaweed-filer`  | Path/metadata layer        | 8888          | healthy (5+ days)         |
| `seaweed-s3`     | S3 API gateway             | 8333          | healthy (5+ days)         |
| `filestash`      | Browser UI                 | 8334          | healthy (5+ days)         |

Caddy routing (lines ~209-232 of `infra/Caddyfile`):

```caddy
http://s3api.getouch.co {
  import common_headers
  reverse_proxy seaweed-s3:8333
}

http://s3.getouch.co {
  import common_headers
  # custom login splash injects the SeaweedFS endpoint
  handle @login { root * /etc/caddy/static; rewrite * /s3-login.html; file_server }
  handle { reverse_proxy filestash:8334 { header_up X-Forwarded-Proto https } }
}
```

### 2.1 Storage layout (host disks)

| Component       | Container path | Host path                         | Backing disk                              |
|-----------------|----------------|-----------------------------------|-------------------------------------------|
| master          | `/data`        | `/srv/archive/seaweedfs/master`   | `/dev/sda` SATA SSD (1 TB), ext4, noatime |
| volume (bytes)  | `/data`        | `/srv/archive/seaweedfs/volume`   | `/dev/sda` SATA SSD                       |
| filer (paths)   | `/data`        | `/srv/archive/seaweedfs/filer`    | `/dev/sda` SATA SSD                       |
| seaweed-s3      | `/data`        | anonymous Docker volume           | NVMe (`/srv` LVM)                         |
| filestash state | `/app/data/state` | `/data/getouch/filestash`      | NVMe                                      |

Bulk object bytes live on the SATA SSD as required (see
`udevadm info /dev/sda` → `ID_BUS=ata`, `ID_MODEL=SSD_1TB`,
`/sys/block/sda/queue/rotational=0`).

`seaweed-s3` keeps only a small leveldb (`/data/filerldb2`); not bulk data, so the
anonymous volume on NVMe is acceptable. (Recommended follow-up: move it to a bind
mount on `/srv/archive/seaweedfs/s3-state` for backup parity.)

Free space (2026-04-26): `/srv/archive` 832 GB free of 953 GB.

### 2.2 Volume capacity (operational)

`seaweed-volume` is launched with `-max=200`. Each volume in SeaweedFS is up to
30 GB (see `volume.go:450` "30GB"), so the node can grow up to ~6 TB of object
data (capped in practice by the underlying disk). Volume files are pre-allocated
lazily; raising `-max` does not consume disk until objects arrive.

**Important historical note (fixed 2026-04-26)**: the volume server previously
ran with `-max=10`. All 10 slots were allocated, so any new bucket / collection
write returned `InternalError` ("No writable volumes and no free volumes left").
Reads still worked; writes to existing buckets that needed volume growth would
also have failed. The fix was a one-line compose change and a single-service
restart of `seaweed-volume` (data on bind mount survived).

## 3. Verification (smoke test, 2026-04-26)

Run from inside `getouch-edge` network using AWS CLI against the internal
`seaweed-s3:8333` endpoint:

```
[mb]       make_bucket: smoke-test-2026
[put]      upload: /tmp/smoke.txt to s3://smoke-test-2026/probe.txt
[ls]       2026-04-26 18:30:44   40   probe.txt
[get sha]  b681efd40b76e3252e3f82bcd2da6a8dd3e999153affc80a261d75a55772d6d3  -
           (matches expected SHA-256 of /tmp/smoke.txt)
[rb]       delete: s3://smoke-test-2026/probe.txt; remove_bucket
[final ls] myfiles, news-media, test-bucket  (smoke bucket gone)
```

Result: **PASS** (PutObject, GetObject byte-for-byte, DeleteObject, ListBuckets,
RemoveBucket, ACL via `admin` identity).

External anonymous probe at `https://s3api.getouch.co/` returns
`HTTP 403 AccessDenied` as expected (no public list-buckets).

## 4. Existing buckets (do not delete)

| Bucket       | Owner / use                                                |
|--------------|------------------------------------------------------------|
| `myfiles`    | Filestash demo / personal area                             |
| `news-media` | news.getouch.co article images                             |
| `test-bucket`| Smoke tests retained from initial provisioning             |

Smoke buckets created during verification are removed (`smoke-test-2026`).

## 5. Identity / credential model

Configured in `infra/seaweedfs/s3.json`, bind-mounted read-only into
`seaweed-s3` at `/etc/seaweedfs/s3.json`. **Never check this file into the
workspace repository with values populated; the live host copy is authoritative
and owned by `deploy`.**

Currently provisioned identities (in-container view, 2026-04-26):

| Name    | Actions                                       | Scope     |
|---------|-----------------------------------------------|-----------|
| `admin` | Admin, Read, Write, List, Tagging, Lock       | global    |

Operating principle: **`admin` is reserved for the host operator only**. Each
consuming service (WAPI, news CMS, openclaw, getouch portal, scheduled-backups,
etc.) gets its own least-privilege identity scoped to its own bucket(s) or
prefixes. A consumer must never be issued `Admin`.

**Provisioning record (2026-04-27)**: a `wapi-app` identity has been added per
the procedure in §5.1. Final identity table:

| Name       | Actions                                                    | Scope            |
|------------|------------------------------------------------------------|------------------|
| `admin`    | Admin, Read, Write, List, Tagging, Lock                    | global           |
| `wapi-app` | Read, Write, List, Tagging (all `:wapi-assets`-scoped)     | `wapi-assets`    |

Bucket `wapi-assets` was created the same day. Cross-bucket isolation has been
verified: the `wapi-app` key gets `AccessDenied` when listing or reading
`news-media`, `myfiles`, or `test-bucket`. The `wapi-app` access key + secret
are stored on the host at `/home/deploy/.secrets/wapi-s3-accesskey` and
`/home/deploy/.secrets/wapi-s3-secretkey` (mode 600, owner `deploy`); the same
values must be set as `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` in WAPI's
Coolify environment when wiring it to the live endpoint.

### 5.1 Procedure to add a per-service identity

(Documented but **not auto-executed**. Operator-only step.)

1. SSH to the host as `deploy`.
2. Edit `/home/deploy/apps/getouch.co/infra/seaweedfs/s3.json` and append a new
   identity object inside `"identities"`:

   ```jsonc
   {
     "name": "wapi-app",
     "credentials": [
       { "accessKey": "<20+ random hex>", "secretKey": "<40+ random hex>" }
     ],
     "actions": [
       "Read:wapi-assets",
       "Write:wapi-assets",
       "List:wapi-assets",
       "Tagging:wapi-assets"
     ]
   }
   ```

   - Use action **bucket scoping** (`Action:bucket-name`) so the key cannot
     touch other buckets.
   - Do NOT add `Admin`.
3. Reload the S3 gateway so it re-reads the file:
   `docker compose restart seaweed-s3` (sub-second downtime; data layer
   `seaweed-volume`/`-master`/`-filer` are unaffected).
4. Hand the new accessKey/secretKey to the service via its environment-variable
   secret store (Coolify env, `.env`, Docker secret) — never paste into a doc,
   chat log, or screenshot.

### 5.2 Rotation runbook

Trigger conditions for rotating an identity:
- The secret was viewed in plaintext outside `s3.json` (terminal, screenshot, doc).
- A consuming service is suspected compromised.
- Routine 12-month rotation.

Steps (per identity):
1. Generate new accessKey/secretKey.
2. Edit `s3.json` to add the **new** credential pair to the identity's
   `credentials` array (SeaweedFS allows multiple per identity for zero-downtime
   rollover).
3. `docker compose restart seaweed-s3`.
4. Update consumer env(s) with new key, redeploy/restart consumer.
5. Once the old key shows no usage (check `seaweed-s3` access log), edit
   `s3.json` again to remove the old credential pair, then restart.

The `admin` accessKey/secretKey was viewed during initial deployment audit
on 2026-04-26 (necessary to inspect the in-container config). It is operator-
only and not handed to any service, so rotation is **recommended but not
urgent**. Schedule it as a maintenance task.

## 6. Bucket strategy

Per-service buckets (top-level), each owned by exactly one identity:

| Bucket             | Owner identity     | Purpose                                  |
|--------------------|--------------------|------------------------------------------|
| `news-media`       | (existing)         | news.getouch.co article media            |
| `myfiles`          | operator (Filestash)| general operator scratch                |
| `wapi-assets`      | `wapi-app` (TBD)   | WAPI tenant uploads (private by default) |
| `wapi-public`      | `wapi-app` (TBD)   | Public-by-tenant-flag mirror, CDN-ready  |
| `getouch-portal`   | TBD                | Portal user uploads / avatars            |
| `getouch-backups`  | TBD                | Postgres / WA / Filestash nightly dumps  |
| `openclaw-media`   | TBD                | Openclaw assistant media cache           |

### 6.1 WAPI tenant prefix layout (inside `wapi-assets`)

```
tenants/{tenantId}/products/{productId}/{objectId}.{ext}
tenants/{tenantId}/services/{serviceId}/{objectId}.{ext}
tenants/{tenantId}/campaigns/{campaignId}/{objectId}.{ext}
tenants/{tenantId}/contacts/{contactId}/avatar.{ext}
tenants/{tenantId}/chat/inbound/{messageId}.{ext}
tenants/{tenantId}/chat/outbound/{messageId}.{ext}
tenants/{tenantId}/exports/{jobId}.zip
tenants/{tenantId}/knowledge/{docId}.{ext}
```

The `tenants/{tenantId}/...` prefix is mandatory at the application layer, so
that even if an SDK call accidentally omits scoping, the key still falls under
the tenant's namespace. Object keys are server-generated UUIDs; the client never
chooses the key.

## 7. Public vs private

Default: **all buckets are private**. Reads are gated by short-lived presigned
URLs (15 min default, max 60 min) issued by the owning service after permission
checks.

Public exposure path (per WAPI tenant flag, Phase 8+):
1. Tenant turns on "public marketing images".
2. Service mirrors selected objects to `wapi-public/tenants/{tenantId}/...`.
3. CDN points at `wapi-public` with allow-list cache rules.

Never trust client-supplied object keys; always look up via the
`storage_objects` row.

## 8. Standard environment variables (consumers)

```
S3_ENDPOINT=https://s3api.getouch.co     # external (cross-host)
S3_ENDPOINT=http://seaweed-s3:8333       # in-cluster (same Docker network)
S3_REGION=us-east-1                      # SeaweedFS ignores region; us-east-1 keeps SDK happy
S3_FORCE_PATH_STYLE=true
S3_BUCKET=wapi-assets                    # service-specific
S3_PUBLIC_BUCKET=wapi-public             # optional
S3_ACCESS_KEY_ID=<from secret store>
S3_SECRET_ACCESS_KEY=<from secret store>
```

App SDK: AWS SDK v3 (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`).

## 9. Backups (planned, not yet shipped)

Out of scope for this verification. Tracked in
[supabase-selfhosted-backup-restore.md](./supabase-selfhosted-backup-restore.md)
extension: nightly `weed s3 sync` of `wapi-assets` + Postgres dumps to
`getouch-backups`, then off-site replica to a separate disk or cloud bucket.

## 10. Known follow-ups

- **Rotate `admin` and `wapi-app` secret keys**: the current values were
  surfaced in tool output during the 2026-04-27 provisioning round. They are
  still confined to the host (`s3.json`) and the operator-only mirror at
  `/home/deploy/.secrets/wapi-s3-{access,secret}key`, but should be rotated
  before any external traffic. Procedure: edit `s3.json` → restart
  `seaweed-s3` → update consumer env (Coolify) → re-run the smoke test.
- Move `seaweed-s3` filer-state from anonymous Docker volume to a bind mount on
  `/srv/archive/seaweedfs/s3-state` so the SATA disk holds all SeaweedFS state.
- Wire metrics: SeaweedFS exposes Prometheus metrics on `:9333/metrics` and
  `:8333/metrics`; add to monitoring stack.
- Add an `admin_auth` Caddy gate on `s3.getouch.co` once Filestash sees real
  user data (currently it only fronts demo `myfiles`).
- Lifecycle policy for `tenants/{tenantId}/_meta/` pruning of stale tenants
  (cleanup runs only when an operator explicitly purges via WAPI's admin UI).

## 11. Operational commands

```bash
# Topology + capacity
docker exec seaweed-master sh -c 'wget -qO- http://127.0.0.1:9333/dir/status'

# Volume node disk + per-volume stats
docker exec seaweed-master sh -c 'wget -qO- http://seaweed-volume:8080/status'

# Live S3 logs (errors only)
docker logs --tail 100 -f seaweed-s3 2>&1 | grep -E '^[EW]'

# Restart S3 gateway only (re-reads s3.json, sub-second)
docker compose restart seaweed-s3

# Restart volume (≈10 s; reads/writes paused)
docker compose up -d seaweed-volume
```
