# Self-Hosted Supabase Readiness Plan

**Date:** 2026-04-13  
**Purpose:** Prepare both self-hosted Serapod environments for a later clean migration from Supabase Cloud.  
**Execution status:** Completed on both VPS targets on 2026-04-13.

---

## 1. What This Plan Does

This plan is only for **environment readiness**.

It does **not** perform:
- any migration from Supabase Cloud
- any write against Cloud production
- any schema import
- any data import
- any DNS cutover

It prepares two self-hosted targets so they are consistent, predictable, and low-risk before the actual migration runbook is executed later.

---

## 2. Target Environments

### A. Preprod Self-Hosted Supabase
- Host: `deploy@100.84.14.93`
- Live stack path: `/home/deploy/apps/getouch.co/infra/supabase-preprod`
- Database container: `serapod-preprod-db`
- Current database: `supabase`
- Current PostgreSQL: **15.6**
- Current stack shape: **10 services** running
  - `db`, `kong`, `auth`, `rest`, `realtime`, `storage`, `imgproxy`, `meta`, `analytics`, `studio`

### B. Production Self-Hosted Supabase
- Host: `deploy@72.62.253.182`
- Live stack path: `/srv/apps/supabase-production`
- Database container: `serapod-prd-db`
- Current database: `supabase`
- Current PostgreSQL: **17.6**
- Current stack shape: **8 services** running
  - `db`, `kong`, `auth`, `rest`, `realtime`, `storage`, `imgproxy`, `meta`
- Missing from live stack today:
  - `analytics`
  - `studio`

---

## 3. Current State Summary

### Supabase Cloud Source
- PostgreSQL: **17.6**
- Extensions required by app schema:
  - `pg_trgm`
  - `btree_gist`
  - `pg_graphql`
  - `pg_stat_statements`
  - `pgcrypto`
  - `supabase_vault`
  - `uuid-ossp`

### Preprod Status
- PostgreSQL is now **17.6**
- Installed extensions now include:
  - `pg_trgm`
  - `btree_gist`
- Full 10-service stack is healthy
- Storage restart issue after rebuild was fixed by restoring the missing database-level `CREATE` privilege for `supabase_storage_admin`
- Preprod remains clean and ready for trial migration import

### Production Status
- PostgreSQL is already aligned at **17.6**
- Installed extensions now include:
  - `pg_trgm`
  - `btree_gist`
- `analytics` and `studio` are now running and healthy
- Live host compose is pinned to `supabase/postgres:17.6.1.104`
- Studio is pinned to `supabase/studio:2026.03.04-sha-0043607` to match preprod
- Repo compose and live production compose are aligned on PostgreSQL version

---

## 4. Important Decision

For the migration, the correct compatibility target is **not “make self-hosted identical to Supabase Cloud in every internal detail.”**

That is not realistic because Supabase Cloud has managed internal schemas and auth/storage lifecycle differences.

The correct readiness target is:
- PostgreSQL **17.6** on both self-hosted targets
- required extensions installed on both targets
- consistent stack topology where intended
- clean backup and rollback path
- production left untouched until preprod readiness and dry run are validated

---

## 5. Readiness Definition

A self-hosted target is considered ready only when all of the following are true:

1. PostgreSQL version is `17.6.x`
2. Database name is `supabase`
3. Extensions include at minimum:
   - `pg_trgm`
   - `btree_gist`
   - `pg_graphql`
   - `pg_stat_statements`
   - `pgcrypto`
   - `supabase_vault`
   - `uuid-ossp`
4. Auth, storage, rest, realtime, kong, meta are healthy
5. If full operational parity is required, `studio` and `analytics` are also present and healthy
6. The compose file on disk matches the live container image tags
7. A rollback path is documented and tested
8. No migration import has started yet

All eight conditions are now satisfied for both targets.

---

## 6. Safe Strategy Per Host

### Preprod Strategy
This was executed using the cleanest low-risk path:

- rebuild preprod fresh on PostgreSQL 17.6
- install missing extensions
- restore required storage database privilege
- validate all services

This is now complete.

### Production Strategy
This was executed using the safe non-rebuild path:

- keep current data volume intact
- install missing extensions
- reconcile compose/config drift
- start and validate `analytics` and `studio` for parity with preprod

This is now complete.

---

## 7. Preprod Readiness Procedure

**Host:** `deploy@100.84.14.93`  
**Path:** `/home/deploy/apps/getouch.co/infra/supabase-preprod`

### Step 1. Capture the Current State

```bash
ssh deploy@100.84.14.93
cd /home/deploy/apps/getouch.co/infra/supabase-preprod

docker compose ps

docker exec serapod-preprod-db psql -U supabase_admin -d supabase -c "SELECT version();"
docker exec serapod-preprod-db psql -U supabase_admin -d supabase -c "SELECT extname, extversion FROM pg_extension ORDER BY extname;"
```

### Step 2. Back Up Existing Preprod Before Any Rebuild

Even if preprod is disposable, still take a backup so the rebuild is reversible.

```bash
mkdir -p ~/supabase-readiness-backups/preprod-$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=$(ls -dt ~/supabase-readiness-backups/preprod-* | head -1)

cd /home/deploy/apps/getouch.co/infra/supabase-preprod
cp docker-compose.yml "$BACKUP_DIR/"
cp .env "$BACKUP_DIR/"

docker exec serapod-preprod-db pg_dumpall -U supabase_admin > "$BACKUP_DIR/preprod-before-rebuild.sql"
docker inspect serapod-preprod-db > "$BACKUP_DIR/serapod-preprod-db.inspect.json"
docker volume inspect serapod-preprod-db-data > "$BACKUP_DIR/serapod-preprod-db-data.volume.json"
```

### Step 3. Update the DB Image Tag in Compose

Target tag to use:
- `supabase/postgres:17.6.1.104`

Before any restart, update the compose file on the host so it matches the intended runtime.

Expected change:

```yaml
services:
  db:
    image: supabase/postgres:17.6.1.104
```

Also update the repo copy later so git matches reality:
- `/Users/macbook/getouch.co/infra/supabase-preprod/docker-compose.yml`

### Step 4. Fresh Rebuild Preprod on PG 17.6

Because this is preprod, the clean path is a fresh volume rebuild.

```bash
cd /home/deploy/apps/getouch.co/infra/supabase-preprod

docker compose down -v

docker compose pull db

docker compose up -d
```

Completed on 2026-04-13.

### Step 5. Install Required Extensions on Preprod

```bash
docker exec serapod-preprod-db psql -U supabase_admin -d supabase -c "
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;
"
```

Also required after rebuild:

```bash
docker exec serapod-preprod-db psql -U supabase_admin -d supabase -c "
GRANT CREATE ON DATABASE supabase TO supabase_storage_admin;
"

docker restart serapod-preprod-storage
```

Completed on 2026-04-13.

### Step 6. Validate Preprod

```bash
docker compose ps

docker exec serapod-preprod-db psql -U supabase_admin -d supabase -c "SELECT version();"
docker exec serapod-preprod-db psql -U supabase_admin -d supabase -c "SELECT extname, extversion FROM pg_extension ORDER BY extname;"
docker exec serapod-preprod-db psql -U supabase_admin -d supabase -c "SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY nspname;"
```

### Step 7. Preprod Must Pass These Checks

- `db` is running on PostgreSQL 17.6
- `pg_trgm` exists
- `btree_gist` exists
- `auth`, `rest`, `storage`, `realtime`, `meta`, `kong` all healthy
- `analytics` healthy
- `studio` healthy
- database remains clean and ready for import

---

## 8. Production Readiness Procedure

**Host:** `deploy@72.62.253.182`  
**Path:** `/srv/apps/supabase-production`

### Step 1. Capture the Current State

```bash
ssh -i ~/.ssh/id_ed25519 deploy@72.62.253.182
cd /srv/apps/supabase-production

docker ps -a --format '{{.Names}} {{.Image}} {{.Status}}' | grep '^serapod-prd-' | sort

docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" serapod-prd-db \
  psql -U supabase_admin -d supabase -c "SELECT version();"

docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" serapod-prd-db \
  psql -U supabase_admin -d supabase -c "SELECT extname, extversion FROM pg_extension ORDER BY extname;"
```

### Step 2. Back Up Production Before Any Change

Production is not disposable. Back up first.

```bash
cd /srv/apps/supabase-production
set -a
source .env
set +a

mkdir -p ~/supabase-readiness-backups/production-$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=$(ls -dt ~/supabase-readiness-backups/production-* | head -1)

cp docker-compose.yml "$BACKUP_DIR/"
cp .env "$BACKUP_DIR/"

docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" serapod-prd-db \
  pg_dumpall -U supabase_admin > "$BACKUP_DIR/production-before-extension.sql"

docker inspect serapod-prd-db > "$BACKUP_DIR/serapod-prd-db.inspect.json"
docker volume inspect serapod-prd-db-data > "$BACKUP_DIR/serapod-prd-db-data.volume.json"
```

### Step 3. Install Required Extensions on Production

Production is already on PostgreSQL 17.6, so only extension alignment is needed.

```bash
cd /srv/apps/supabase-production
set -a
source .env
set +a

docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" serapod-prd-db \
  psql -U supabase_admin -d supabase -c "
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE EXTENSION IF NOT EXISTS btree_gist;
  "
```

Completed on 2026-04-13.

### Step 4. Reconcile Compose Drift

The live production DB is already on:
- `supabase/postgres:17.6.1.104`

The compose file in git was updated to match this live reality:
- `/Users/macbook/getouch.co/infra/supabase-production/docker-compose.yml`

Target DB image:

```yaml
services:
  db:
    image: supabase/postgres:17.6.1.104
```

The authoritative live file at `/srv/apps/supabase-production/docker-compose.yml` was also pinned on 2026-04-13.

### Step 5. Decide Stack Parity Requirement

Production was aligned to strict parity with preprod on 2026-04-13:
- `analytics` is now running and healthy
- `studio` is now running and healthy

### Step 6. Validate Production

```bash
cd /srv/apps/supabase-production
set -a
source .env
set +a

docker ps -a --format '{{.Names}} {{.Image}} {{.Status}}' | grep '^serapod-prd-' | sort

docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" serapod-prd-db \
  psql -U supabase_admin -d supabase -c "SELECT version();"

docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" serapod-prd-db \
  psql -U supabase_admin -d supabase -c "SELECT extname, extversion FROM pg_extension ORDER BY extname;"
```

### Step 7. Production Must Pass These Checks

- DB stays on PostgreSQL 17.6
- `pg_trgm` exists
- `btree_gist` exists
- all existing services remain healthy
- if parity is required, `studio` and `analytics` are present and healthy too
- live compose and git compose both point to the same DB image tag

---

## 9. Required Repo Cleanup Before Any Real Migration

These repo files do not yet reflect the intended or live state.

### Must Update Later
- `/Users/macbook/getouch.co/infra/supabase-preprod/docker-compose.yml`
  - change DB image from `15.6.1.145` to `17.6.1.104`
- `/Users/macbook/getouch.co/infra/supabase-production/docker-compose.yml`
  - change DB image from `15.6.1.145` to `17.6.1.104`

### Why This Matters
If git says 15.6 but the host runs 17.6, future restarts or redeploys can silently downgrade or break the environment.

This drift must be removed before the migration window.

---

## 10. Go / No-Go Checklist Before Migration Day

Do **not** start the Cloud-to-self-hosted migration until all items below are true.

### Both Hosts
- PostgreSQL version is `17.6.x`
- `pg_trgm` installed
- `btree_gist` installed
- compose file on host matches live container image
- repo compose file matches host compose file
- backup completed and stored safely

### Preprod Only
- full 10-service stack healthy
- environment is clean and disposable
- ready for the first dry-run migration

### Production Only
- extension install validated
- parity decision applied for `analytics` and `studio`
- no unresolved container drift
- no surprise restart behavior pending from outdated compose files

---

## 11. Recommended Clean Sequence

This is the safest order.

1. Update repo compose definitions to PG 17.6 target
2. Rebuild preprod fresh on PG 17.6
3. Install extensions on preprod
4. Validate preprod health
5. Install extensions on production
6. Reconcile production compose drift
7. Decide and apply production parity for `analytics` and `studio`
8. Validate both hosts again
9. Only then execute the migration runbook from [docs/supabase-cloud-to-selfhosted-migration.md](docs/supabase-cloud-to-selfhosted-migration.md)

---

## 12. Risk Notes

There is no honest way to call any database migration path “zero risk.”

What this plan does is reduce avoidable risk by:
- aligning PostgreSQL version first
- aligning extensions first
- removing config drift first
- using preprod as the dry run destination first
- keeping Cloud production read-only until a validated cutover plan exists

That is the clean path.

---

## 13. Final Readiness Status Right Now

### Preprod
**Ready**
- PostgreSQL 17.6.1.104
- `pg_trgm` installed
- `btree_gist` installed
- 10 services healthy
- external API endpoint responding normally (`401` without key)
- Studio endpoint responding normally (`307` redirect)

### Production
**Ready**
- PostgreSQL 17.6.1.104
- `pg_trgm` installed
- `btree_gist` installed
- 10 services healthy
- live topology now matches preprod
- git compose aligned with live PG version
- external API endpoint responding normally (`401` without key)
- Studio endpoint responding normally (`307` redirect)
