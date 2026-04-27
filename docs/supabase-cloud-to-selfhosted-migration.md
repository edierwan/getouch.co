# Supabase Cloud → Self-Hosted Migration Guide

**Date**: 2026-04-12  
**Source**: Supabase Cloud (aws-1-ap-southeast-1.pooler.supabase.com)  
**Target**: Self-Hosted Serapod Preprod (serapod-preprod-db on 100.84.14.93)  
**Status**: Assessment complete and prerequisites completed on both self-hosted targets — ready for trial migration to Preprod or Production

> **Readiness completed on 2026-04-13**
> - Preprod on `100.84.14.93` rebuilt cleanly onto PostgreSQL `17.6.1.104`
> - Production on `72.62.253.182` confirmed on PostgreSQL `17.6.1.104`
> - `pg_trgm` and `btree_gist` installed on both targets
> - Production `analytics` and `studio` brought up and healthy
> - External smoke checks passed for both API and Studio endpoints

---

## 1. Inventory Comparison

### 1.1 PostgreSQL Version

| Attribute | Cloud (Source) | Preprod (Target) |
|-----------|---------------|-----------------|
| PG Version | **17.6** | **15.6** |
| Database name | `postgres` | `supabase` |
| Database size | **1,939 MB** (~1.9 GB) | 7.4 MB (empty) |

> **⚠️ CRITICAL: Major version mismatch (PG 17 → PG 15)**  
> `pg_dump` from PG 17 *can* restore into PG 15 for most features, but:
> - Any PG 17-specific SQL syntax will fail (e.g., `JSON_TABLE`, new `MERGE` clauses)
> - Run `pg_restore --list` first and review for incompatibilities
> - The Supabase self-hosted image uses PG 15.6 — **do not upgrade** PG on preprod until ready to also upgrade production self-hosted

### 1.2 Schemas

| Schema | Cloud | Preprod | Notes |
|--------|-------|---------|-------|
| public | ✅ ~220 tables | ✅ empty | Main application data |
| auth | ✅ 22 tables | ✅ 16 tables | Preprod has base auth (GoTrue v2.164), Cloud has extras (oauth_*, webauthn_*, custom_oauth_providers) |
| storage | ✅ 8 tables | ✅ 5 tables | Cloud has extras (buckets_analytics, buckets_vectors, vector_indexes) |
| realtime | ✅ | ✅ | Managed by realtime container |
| extensions | ✅ | ✅ | Extension support functions |
| graphql / graphql_public | ✅ | ✅ | pg_graphql |
| vault | ✅ | ✅ | supabase_vault |
| pgsodium / pgsodium_masks | ❌ | ✅ | Self-hosted has pgsodium; Cloud doesn't expose it |
| pgbouncer | ✅ | ✅ | Connection pooling schema |
| core | ✅ | ❌ | Cloud-only schema (likely Supabase infra) |
| hr | ✅ | ❌ | Cloud has separate `hr` schema — **check if this has data** |
| payroll | ✅ | ❌ | Cloud has separate `payroll` schema — **check if this has data** |

### 1.3 Extensions

| Extension | Cloud Version | Preprod Version | Status |
|-----------|--------------|-----------------|--------|
| plpgsql | 1.0 | 1.0 | ✅ Match |
| uuid-ossp | 1.1 | 1.1 | ✅ Match |
| pgcrypto | 1.3 | 1.3 | ✅ Match |
| pg_graphql | 1.5.11 | 1.5.7 | ⚠️ Minor diff (should be compatible) |
| pg_stat_statements | 1.11 | 1.10 | ⚠️ Minor diff (PG version-dependent) |
| supabase_vault | 0.3.1 | 0.2.8 | ⚠️ Minor diff |
| pg_trgm | 1.6 | ❌ Missing | **🔴 MUST INSTALL** — used by text search functions |
| btree_gist | 1.7 | ❌ Missing | **🔴 MUST INSTALL** — used by GiST indexes |
| pgsodium | ❌ | 3.1.8 | Preprod-only (acceptable) |
| pgjwt | ❌ | 0.2.0 | Preprod-only (acceptable) |

### 1.4 Auth Schema Differences

**Cloud auth.schema_migrations (latest 10):**
```
20260302000000
20260219120000
20260121000000
20260115000000
20251201000000
20251111201300
20251104100000
20251007112900
20250925093508
20250904133000
```

**Preprod auth.schema_migrations (latest 10):**
```
20241009103726
20240806073726
20240729123726
20240612123726
20240427152123
20240314092811
20240306115329
20240214120130
20240115144230
```

> **⚠️ Cloud auth is ~18 months ahead of Preprod auth.**  
> Cloud has tables `custom_oauth_providers`, `oauth_authorizations`, `oauth_client_states`, `oauth_clients`, `oauth_consents`, `webauthn_challenges`, `webauthn_credentials` that don't exist on Preprod.  
> **We will NOT migrate auth schema tables directly. Instead, we export auth.users data only and insert after GoTrue creates its own schema.**

### 1.5 Data Volume Summary (Cloud)

**Tables with data (non-zero rows):**

| Table | Row Count | Notes |
|-------|-----------|-------|
| qr_codes | 1,092,332 | Largest table by far |
| consumer_qr_scans | 44,827 | |
| qr_master_codes | 13,047 | |
| referral_accruals | 4,207 | |
| points_transactions | 3,076 | |
| users | 1,738 | Public users table |
| auth.users | 1,742 | Auth users |
| organizations | 773 | |
| shop_distributors | 738 | |
| reference_assignments | 188 | |
| notification_logs | 144 | |
| notification_events | 116 | |
| audit_logs | 78 | |
| stock_movements | 74 | |
| All other tables | Various (0-48 rows) | ~180+ tables with 0 rows |

**Total active data**: ~1.16M rows across all tables  
**~94% of data** is in `qr_codes` table

### 1.6 Storage

**Cloud storage buckets:** Need to query separately (inventory query returned no bucket rows — may be empty or restricted)  
**Preprod storage:** 0 objects, no buckets

### 1.7 Public Schema Functions

| Metric | Cloud | Preprod |
|--------|-------|---------|
| Public functions | **525** | 0 |
| Auth functions | 4 | 4 |
| Storage functions | 22 | 10 |
| Extensions functions | 55 | 61 |

> **All 525 public functions must be migrated.** These include business logic (order processing, QR code handling, payroll, HR, WMS, etc.)

### 1.8 Custom Types (Enums)

Cloud has **~35 custom enum types** in public schema:
- `announcement_status`, `document_type`, `order_status`, `order_type`
- `gl_account_type`, `gl_journal_status`
- `incentive_*` (8 types), `support_*` (6 types)
- `payroll_component_category`, `referral_*`, `whatsapp_*`
- And authentication-related: `aal_level`, `code_challenge_method`, `factor_status`, `factor_type`, `one_time_token_type`

Preprod has **0 custom types** in public schema.

### 1.9 Triggers

Cloud has **~130 triggers** on public tables covering:
- `updated_at` timestamp management
- Business logic (order processing, stock movement, QR code assignment, referral accrual)
- Audit logging, notification dispatch
- Financial posting (GL auto-post, document acknowledgement)

### 1.10 Other Objects

| Object | Cloud | Preprod |
|--------|-------|---------|
| Materialized views | 2 (`mv_product_catalog`, `mv_shop_available_products`) | 0 |
| Sequences | 2 (`hr_employee_no_seq`, `support_case_number_seq`) | 0 |
| Foreign keys | **633** | 0 |
| Publications | `supabase_realtime` (not all tables), `supabase_realtime_messages_publication` | `supabase_realtime` |
| pg_cron | Not installed | Not installed |

---

## 2. Known Blockers & Risks

### 🔴 BLOCKER: Missing Extensions
```sql
-- Run on preprod supabase database BEFORE importing schema
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;
```
Without these, the schema dump will fail on GiST operator class references and trigram functions.

### ⚠️ RISK: PG 17 → PG 15 Downgrade
- `pg_dump` output from PG 17 client **may contain PG 17-only syntax**
- **Mitigation**: Use `pg_dump` from PG **15** client to connect to Cloud and produce PG 15-compatible SQL
- The PG 15 `pg_dump` client can connect to PG 17 servers (forward-compatible)
- Install PG 15 client locally: `brew install postgresql@15` or use the preprod container's `pg_dump`

### ⚠️ RISK: Auth Schema Version Mismatch
- Cloud's GoTrue is much newer than preprod's
- Extra tables on Cloud (oauth_*, webauthn_*) won't exist on preprod
- **Mitigation**: Only migrate `auth.users` data rows, skip schema DDL

### ⚠️ RISK: Database Name Mismatch
- Cloud uses database `postgres`
- Preprod uses database `supabase` (configured via `POSTGRES_DB=supabase`)
- **Mitigation**: All dump/restore commands target `supabase` database on preprod

### ℹ️ NOTE: btree_gist Functions in Public Schema
- Cloud has ~100+ `gbt_*` functions from `btree_gist` extension installed in public schema
- These will come over with `pg_dump --schema=public` but are extension-owned
- **Mitigation**: Install `btree_gist` extension first, then the dump will reference existing functions

---

## 3. Migration Strategy

**Approach: Logical dump — export roles, schema, and data separately.**

### Phase Overview

```
Phase 0: Prepare Preprod Environment
Phase 1: Export Cloud Data (READ ONLY)
Phase 2: Import Schema (DDL only, no data)
Phase 3: Import Data
Phase 4: Import Auth Users
Phase 5: Post-Migration Validation
Phase 6: Restart & Smoke Test
```

---

## 4. Step-by-Step Migration Procedure

### Phase 0: Prepare Preprod Environment

```bash
# 0.1 — SSH to server
ssh deploy@100.84.14.93
cd ~/apps/getouch.co/infra/supabase-preprod

# 0.2 — Install missing extensions on preprod
docker exec -e PGPASSWORD=Turun_2020- serapod-preprod-db \
  psql -U supabase_admin -d supabase -c "
    CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;
    CREATE EXTENSION IF NOT EXISTS btree_gist SCHEMA public;
  "

# 0.3 — Verify extensions
docker exec -e PGPASSWORD=Turun_2020- serapod-preprod-db \
  psql -U supabase_admin -d supabase -c "SELECT extname, extversion FROM pg_extension ORDER BY extname"

# 0.4 — Create a migration workspace on the server
mkdir -p ~/migration-workspace && cd ~/migration-workspace
```

### Phase 1: Export Cloud Data (READ ONLY)

**IMPORTANT: All commands below are READ ONLY against Cloud production.**

```bash
# 1.1 — Export public schema DDL only (types, tables, functions, triggers, indexes, constraints)
# Use PG 15 pg_dump from the preprod container to ensure PG 15-compatible output
docker exec -e PGPASSWORD='Turun_2020-' serapod-preprod-db \
  pg_dump \
    -h aws-1-ap-southeast-1.pooler.supabase.com \
    -p 5432 \
    -U postgres.hsvmvmurvpqcdmxckhnz \
    -d postgres \
    --schema=public \
    --schema-only \
    --no-owner \
    --no-privileges \
    --no-comments \
    -f /tmp/cloud_public_schema.sql

# 1.2 — Export public schema DATA only
docker exec -e PGPASSWORD='Turun_2020-' serapod-preprod-db \
  pg_dump \
    -h aws-1-ap-southeast-1.pooler.supabase.com \
    -p 5432 \
    -U postgres.hsvmvmurvpqcdmxckhnz \
    -d postgres \
    --schema=public \
    --data-only \
    --no-owner \
    --no-privileges \
    -f /tmp/cloud_public_data.sql

# 1.3 — Export auth.users data only (skip schema, skip sensitive internal tables)
docker exec -e PGPASSWORD='Turun_2020-' serapod-preprod-db \
  pg_dump \
    -h aws-1-ap-southeast-1.pooler.supabase.com \
    -p 5432 \
    -U postgres.hsvmvmurvpqcdmxckhnz \
    -d postgres \
    --data-only \
    --no-owner \
    --no-privileges \
    --table=auth.users \
    --table=auth.identities \
    --table=auth.sessions \
    --table=auth.refresh_tokens \
    --table=auth.mfa_factors \
    --table=auth.mfa_challenges \
    --table=auth.mfa_amr_claims \
    -f /tmp/cloud_auth_data.sql

# 1.4 — Export storage.buckets (bucket config, not actual files)
docker exec -e PGPASSWORD='Turun_2020-' serapod-preprod-db \
  pg_dump \
    -h aws-1-ap-southeast-1.pooler.supabase.com \
    -p 5432 \
    -U postgres.hsvmvmurvpqcdmxckhnz \
    -d postgres \
    --data-only \
    --no-owner \
    --no-privileges \
    --table=storage.buckets \
    --table=storage.objects \
    -f /tmp/cloud_storage_data.sql

# 1.5 — Copy dumps out of container
docker cp serapod-preprod-db:/tmp/cloud_public_schema.sql ~/migration-workspace/
docker cp serapod-preprod-db:/tmp/cloud_public_data.sql ~/migration-workspace/
docker cp serapod-preprod-db:/tmp/cloud_auth_data.sql ~/migration-workspace/
docker cp serapod-preprod-db:/tmp/cloud_storage_data.sql ~/migration-workspace/

# 1.6 — Inspect file sizes (sanity check)
ls -lh ~/migration-workspace/cloud_*.sql
```

> **Expected sizes:**
> - `cloud_public_schema.sql`: ~500KB–2MB (DDL for 220 tables, 525 functions, 130 triggers, 633 FKs)
> - `cloud_public_data.sql`: ~200MB–500MB (1.1M QR codes + other data)
> - `cloud_auth_data.sql`: ~1MB (1,742 users)
> - `cloud_storage_data.sql`: small (bucket metadata, not actual file contents)

### Phase 2: Pre-Import Cleanup on Preprod

```bash
# 2.1 — Review the schema dump for PG 17-only syntax
# Look for: JSON_TABLE, MERGE with RETURNING, COPY ... FROM STDIN WITH (new options)
grep -n 'JSON_TABLE\|MERGE.*RETURNING' ~/migration-workspace/cloud_public_schema.sql

# 2.2 — Drop any existing public tables on preprod (it should be empty, but verify)
docker exec -e PGPASSWORD=Turun_2020- serapod-preprod-db \
  psql -U supabase_admin -d supabase -c "
    SELECT count(*) FROM pg_tables WHERE schemaname = 'public';
  "
# Should return 0

# 2.3 — Stop non-essential Supabase services to avoid conflicts during import
cd ~/apps/getouch.co/infra/supabase-preprod
docker compose stop rest realtime storage auth
# Keep only DB and imgproxy running
```

### Phase 3: Import Schema (DDL)

```bash
# 3.1 — Copy schema file into container
docker cp ~/migration-workspace/cloud_public_schema.sql serapod-preprod-db:/tmp/

# 3.2 — Import schema into the supabase database
docker exec -e PGPASSWORD=Turun_2020- serapod-preprod-db \
  psql -U supabase_admin -d supabase \
    -v ON_ERROR_STOP=0 \
    -f /tmp/cloud_public_schema.sql \
    2>&1 | tee ~/migration-workspace/schema_import.log

# 3.3 — Review errors (expect some extension-related noise, but no real failures)
grep -i 'error\|fatal' ~/migration-workspace/schema_import.log

# 3.4 — Verify table count
docker exec -e PGPASSWORD=Turun_2020- serapod-preprod-db \
  psql -U supabase_admin -d supabase -c "
    SELECT count(*) FROM pg_tables WHERE schemaname = 'public';
  "
# Should be ~220 tables
```

### Phase 4: Import Data

```bash
# 4.1 — Copy data file into container
docker cp ~/migration-workspace/cloud_public_data.sql serapod-preprod-db:/tmp/

# 4.2 — Disable triggers during import (prevents cascading side effects)
docker exec -e PGPASSWORD=Turun_2020- serapod-preprod-db \
  psql -U supabase_admin -d supabase -c "
    SET session_replication_role = 'replica';
  "

# 4.3 — Import data
docker exec -e PGPASSWORD=Turun_2020- serapod-preprod-db \
  psql -U supabase_admin -d supabase \
    -v ON_ERROR_STOP=0 \
    -c "SET session_replication_role = 'replica';" \
    -f /tmp/cloud_public_data.sql \
    2>&1 | tee ~/migration-workspace/data_import.log

# 4.4 — Re-enable triggers
docker exec -e PGPASSWORD=Turun_2020- serapod-preprod-db \
  psql -U supabase_admin -d supabase -c "
    SET session_replication_role = 'origin';
  "

# 4.5 — Verify data counts (spot-check key tables)
docker exec -e PGPASSWORD=Turun_2020- serapod-preprod-db \
  psql -U supabase_admin -d supabase -c "
    SELECT 'qr_codes' as tbl, count(*) FROM public.qr_codes
    UNION ALL SELECT 'users', count(*) FROM public.users
    UNION ALL SELECT 'organizations', count(*) FROM public.organizations
    UNION ALL SELECT 'consumer_qr_scans', count(*) FROM public.consumer_qr_scans;
  "
```

**Expected counts:**
| Table | Expected |
|-------|----------|
| qr_codes | 1,092,332 |
| users | 1,738 |
| organizations | 773 |
| consumer_qr_scans | 44,827 |

### Phase 5: Import Auth Users

```bash
# 5.1 — Check which auth tables exist on preprod
docker exec -e PGPASSWORD=Turun_2020- serapod-preprod-db \
  psql -U supabase_admin -d supabase -c "
    SELECT tablename FROM pg_tables WHERE schemaname = 'auth' ORDER BY tablename;
  "

# 5.2 — Inspect the auth dump to see what tables it references
head -50 ~/migration-workspace/cloud_auth_data.sql

# 5.3 — If the dump references tables that don't exist on preprod (unlikely for auth.users),
#        edit the SQL to keep only the common tables:
#        auth.users, auth.identities, auth.refresh_tokens, auth.sessions, auth.mfa_factors,
#        auth.mfa_amr_claims, auth.mfa_challenges

# 5.4 — Copy and import auth data
docker cp ~/migration-workspace/cloud_auth_data.sql serapod-preprod-db:/tmp/

docker exec -e PGPASSWORD=Turun_2020- serapod-preprod-db \
  psql -U supabase_admin -d supabase \
    -v ON_ERROR_STOP=0 \
    -c "SET session_replication_role = 'replica';" \
    -f /tmp/cloud_auth_data.sql \
    2>&1 | tee ~/migration-workspace/auth_import.log

# 5.5 — Verify auth user count
docker exec -e PGPASSWORD=Turun_2020- serapod-preprod-db \
  psql -U supabase_admin -d supabase -c "
    SELECT count(*) FROM auth.users;
  "
# Should be 1,742
```

### Phase 6: Import Storage Metadata

```bash
# 6.1 — Import storage bucket/object metadata
docker cp ~/migration-workspace/cloud_storage_data.sql serapod-preprod-db:/tmp/

docker exec -e PGPASSWORD=Turun_2020- serapod-preprod-db \
  psql -U supabase_admin -d supabase \
    -v ON_ERROR_STOP=0 \
    -f /tmp/cloud_storage_data.sql \
    2>&1 | tee ~/migration-workspace/storage_import.log

# NOTE: This only imports bucket configs and object metadata.
# Actual file blobs need to be copied separately from Supabase Cloud storage
# to the self-hosted storage backend (local disk or S3-compatible).
```

### Phase 7: Post-Migration Tasks

```bash
# 7.1 — Refresh materialized views
docker exec -e PGPASSWORD=Turun_2020- serapod-preprod-db \
  psql -U supabase_admin -d supabase -c "
    REFRESH MATERIALIZED VIEW IF EXISTS public.mv_product_catalog;
    REFRESH MATERIALIZED VIEW IF EXISTS public.mv_shop_available_products;
  "

# 7.2 — Reset sequences to match imported data
docker exec -e PGPASSWORD=Turun_2020- serapod-preprod-db \
  psql -U supabase_admin -d supabase -c "
    SELECT setval('public.hr_employee_no_seq', COALESCE((SELECT max(employee_no) FROM public.hr_employees), 1));
    SELECT setval('public.support_case_number_seq', COALESCE((SELECT max(case_number::bigint) FROM public.support_conversations), 1));
  "

# 7.3 — Re-analyze all tables for query planner
docker exec -e PGPASSWORD=Turun_2020- serapod-preprod-db \
  psql -U supabase_admin -d supabase -c "ANALYZE;"

# 7.4 — Set up realtime publication (if needed)
docker exec -e PGPASSWORD=Turun_2020- serapod-preprod-db \
  psql -U supabase_admin -d supabase -c "
    -- The supabase_realtime publication should already exist
    -- Add specific tables if needed:
    -- ALTER PUBLICATION supabase_realtime ADD TABLE public.orders, public.notifications_outbox;
    SELECT pubname FROM pg_publication;
  "

# 7.5 — Restart all Supabase services
cd ~/apps/getouch.co/infra/supabase-preprod
docker compose up -d

# 7.6 — Wait for healthy status
sleep 30
docker compose ps
```

### Phase 8: Smoke Tests

```bash
# 8.1 — Test PostgREST API via Kong
curl -s -o /dev/null -w '%{http_code}' \
  -H "apikey: <ANON_KEY>" \
  https://sb-preprod-serapod.getouch.co/rest/v1/organizations?limit=1

# 8.2 — Test Auth (sign in with known user)
curl -s -X POST \
  https://sb-preprod-serapod.getouch.co/auth/v1/token?grant_type=password \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"<test-email>","password":"<test-password>"}'

# 8.3 — Test Studio access
curl -s -o /dev/null -w '%{http_code}' https://st-preprod-serapod.getouch.co/

# 8.4 — Verify table count from Studio or REST
curl -s \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  https://sb-preprod-serapod.getouch.co/rest/v1/users?select=count
```

---

## 5. Storage File Migration (Separate Step)

If the Cloud has actual storage objects (files/images), they need a separate migration:

```bash
# Option A: If using Supabase CLI
supabase storage cp --recursive sb://bucket-name ./local-backup/

# Option B: Direct S3 API (if Cloud exposes S3-compatible endpoint)
# Use aws s3 sync or rclone

# Option C: Download via REST API
# For each object in storage.objects, download via:
# GET /storage/v1/object/<bucket>/<path>
```

> **Note**: File migration is data-intensive and should be done after schema/data migration succeeds.

---

## 6. Rollback Plan

If anything goes wrong during Preprod trial:

```bash
# Nuclear option: wipe preprod database and start fresh
cd ~/apps/getouch.co/infra/supabase-preprod
docker compose down -v   # Removes all volumes!
docker compose up -d     # Fresh start
```

This is safe because Preprod has no real data yet.

---

## 7. What NOT to Touch

- ❌ **Supabase Cloud production** — READ ONLY, no writes, no schema changes
- ❌ **Self-hosted Serapod Production** (`serapod-prd-*`) — leave untouched
- ❌ **Self-hosted Serapod Staging** (`serapod-stg-*`) — leave untouched
- ❌ **Cloud-managed schemas** — Don't manually create `auth.*` or `storage.*` DDL; let GoTrue/Storage containers manage their own schema migrations

---

## 8. Post-Trial: Before Going to Production

## 8.1 Execution Result — 2026-04-13

The Cloud to self-hosted Preprod migration was executed on `2026-04-13` against:

- source: Supabase Cloud project `hsvmvmurvpqcdmxckhnz` (read-only)
- destination: self-hosted Serapod Preprod on `100.84.14.93`

### Outcome

- Public schema and public data were imported successfully.
- `auth` and `storage` metadata were imported successfully.
- The preprod stack was restarted and all Supabase services returned healthy.
- Application login for `super@dev.com` was verified after post-import auth repair.

### Post-import auth repair

The initial migrated login path failed with:

```text
Database error granting user
duplicate key value violates unique constraint "refresh_tokens_pkey"
```

Root cause: `auth.refresh_tokens_id_seq` was behind the imported `auth.refresh_tokens.id` values.

Fix applied:

```sql
SELECT setval(
  'auth.refresh_tokens_id_seq',
  COALESCE((SELECT max(id) FROM auth.refresh_tokens), 1),
  true
);
```

After that fix, password login for `super@dev.com` succeeded and returned tokens normally.

### Final destination snapshot

The destination snapshot after migration and smoke tests was:

| Object | Count |
|--------|-------|
| public.qr_codes | 1,088,030 |
| public.users | 1,739 |
| public.organizations | 773 |
| public.consumer_qr_scans | 50,344 |
| auth.users | 1,743 |
| auth.identities (distinct id) | 3,453 |
| auth.sessions | 839 |
| auth.refresh_tokens | 3,012 |
| storage.buckets | 10 |
| storage.objects | 731 |

### Notes on count movement

- `public.consumer_qr_scans` was initially behind the Cloud snapshot during the first validation pass.
- A table-specific staging import was run afterward and the missing rows were inserted.
- `auth.sessions` and `auth.refresh_tokens` increased during validation because successful login smoke tests created fresh destination-side sessions/tokens.
- `auth.identities` on Cloud included duplicate logical rows; validation should use `count(distinct id)` rather than raw row count.

### Smoke tests performed

- `https://preprod.serapod2u.com/login` returned `200`
- `POST https://sb-preprod-serapod.getouch.co/auth/v1/token?grant_type=password` with `super@dev.com` returned `200`
- `https://sb-preprod-serapod.getouch.co/rest/v1/organizations?select=id&limit=1` returned `200`

### Cleanup completed

- Temporary FDW objects used during migration were dropped.
- Temporary staging table for `consumer_qr_scans` was dropped.

After this Preprod trial succeeds, the following must be addressed before migrating to self-hosted production:

1. **Upgrade self-hosted PG to 17.x** (or accept minor incompatibilities with PG 15)
2. **Upgrade GoTrue** (auth container) to match Cloud's auth migration level
3. **Configure storage backend** (S3 or local) to handle ~2GB of potential file storage
4. **Set up backups** (pg_dump cron or WAL archiving)
5. **DNS cutover plan** — point app's Supabase client from Cloud URL to self-hosted URL
6. **Update environment variables** in the Next.js app (SUPABASE_URL, SUPABASE_ANON_KEY)
7. **RLS policies review** — Cloud has RLS policies on many tables; verify they work with self-hosted auth JWT

---

## Appendix A: Cloud Inventory Snapshot

### Schemas
`auth`, `core`, `extensions`, `graphql`, `graphql_public`, `hr`, `payroll`, `pgbouncer`, `public`, `realtime`, `storage`, `vault`

### Extensions
`btree_gist` 1.7, `pg_graphql` 1.5.11, `pg_stat_statements` 1.11, `pg_trgm` 1.6, `pgcrypto` 1.3, `plpgsql` 1.0, `supabase_vault` 0.3.1, `uuid-ossp` 1.1

### Public Functions (525 total)
Key categories:
- **QR Code management**: `generate_qr_code_string`, `generate_master_qr_code_string`, `extract_variant_key_from_code`, `validate_roadtour_qr_token`, `wms_*` (13 functions)
- **Order processing**: `orders_submit`, `orders_approve`, `fulfill_order_inventory`, `allocate_inventory_for_order`, `handle_order_status_change`
- **User/Auth**: `create_new_user`, `handle_social_login`, `sync_user_profile`, `handle_new_user`, `get_auth_user_*`
- **Financial/GL**: `post_document_to_gl`, `reverse_gl_journal`, `generate_journal_number`, `batch_post_documents`
- **HR/Payroll**: `compute_payroll_item`, `hr_post_payroll_run_to_gl`, `apply_hr_coa_template`, `seed_payroll_*`
- **Inventory/Stock**: `record_stock_movement`, `adjust_inventory_quantity`, `apply_inventory_ship_adjustment`
- **Consumer engagement**: `consumer_collect_points`, `consumer_claim_gift`, `play_scratch_card_turn`, `consumer_lucky_draw_enter`
- **Support**: `create_support_conversation`, `send_support_message`, `assign_conversation`
- **Referrals/Incentives**: `accrue_referral_from_scan`, `submit_referral_claim`, `process_reference_change`
- **btree_gist internal**: ~100 `gbt_*` functions (extension-provided, not custom)

### Custom Enum Types (35)
`announcement_status`, `announcement_target_type`, `document_status`, `document_type`, `gl_account_type`, `gl_journal_status`, `incentive_calculation_basis`, `incentive_campaign_logic`, `incentive_campaign_status`, `incentive_campaign_type`, `incentive_eligibility_scope`, `incentive_notif_channel`, `incentive_notif_status`, `incentive_payment_method`, `incentive_payout_status`, `incentive_reward_type`, `incentive_target_metric`, `order_status`, `order_type`, `payroll_component_category`, `referral_adjustment_type`, `referral_change_status`, `referral_claim_status`, `support_conversation_status`, `support_event_type`, `support_message_type`, `support_priority`, `support_sender_type`, `support_thread_status`, `whatsapp_bot_session_status`, `whatsapp_conversation_mode`

### Triggers (130+)
See full inventory in source data.

### Publications
- `supabase_realtime` (not all tables)
- `supabase_realtime_messages_publication`

---

## Appendix B: Preprod Inventory Snapshot

### Database: `supabase` (POSTGRES_DB=supabase)
### PG Version: 15.6
### Extensions
`pg_graphql` 1.5.7, `pg_stat_statements` 1.10, `pgcrypto` 1.3, `pgjwt` 0.2.0, `pgsodium` 3.1.8, `plpgsql` 1.0, `supabase_vault` 0.2.8, `uuid-ossp` 1.1

### Auth Tables (16, GoTrue-managed)
`audit_log_entries`, `flow_state`, `identities`, `instances`, `mfa_amr_claims`, `mfa_challenges`, `mfa_factors`, `one_time_tokens`, `refresh_tokens`, `saml_providers`, `saml_relay_states`, `schema_migrations`, `sessions`, `sso_domains`, `sso_providers`, `users`

### Storage Tables (5)
`buckets`, `migrations`, `objects`, `s3_multipart_uploads`, `s3_multipart_uploads_parts`

### Public Tables: 0 (empty — ready for import)
### Public Functions: 0
### Containers: 10 (all healthy as of 2026-04-12)
