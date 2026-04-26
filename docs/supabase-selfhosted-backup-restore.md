# Self-Hosted Supabase Backup & Restore

This stack can support the same core workflow as Supabase Cloud backups:

- scheduled daily backups
- a known retention window
- explicit restore confirmation before destructive restore
- full stack downtime during restore

What it does not provide out of the box is the Supabase Cloud UI inside Studio. On self-hosted, the backup and restore control plane is your own automation.

## Preprod Design

For `serapod-preprod`, the backup flow uses:

- `globals.sql`: roles and global objects
- `*-primary-*.dump`: custom-format dump of database `supabase`
- `*-analytics-*.dump`: custom-format dump of database `_supabase` when present
- `storage-files.tar.gz`: storage object files from `serapod-preprod-storage-data`
- copied `docker-compose.yml` and `.env`

Backups are stored under:

```bash
~/supabase-backups/serapod-preprod/<timestamp>
```

Latest backup symlink:

```bash
~/supabase-backups/serapod-preprod/latest
```

## Daily Backup

Host-side command:

```bash
/home/deploy/apps/getouch.co/infra/scripts/supabase-backup.sh
```

Suggested cron entry for daily backup at `02:15`:

```cron
15 2 * * * /home/deploy/apps/getouch.co/infra/scripts/supabase-backup.sh >> /home/deploy/supabase-backups/serapod-preprod/backup.log 2>&1
```

Default retention is `14` days. Override example:

```bash
RETENTION_DAYS=30 /home/deploy/apps/getouch.co/infra/scripts/supabase-backup.sh
```

## Production Self-Hosted Variant

The same scripts are now also suitable for the VPS-hosted production self-hosted target.

Production host:

```bash
deploy@72.62.253.182
```

Installed script location on that host:

```bash
/home/deploy/supabase-ops/supabase-backup.sh
/home/deploy/supabase-ops/supabase-restore.sh
```

Production backup root:

```bash
/home/deploy/supabase-backups/serapod-production
```

Installed daily cron on production self-hosted target:

```cron
20 2 * * * STACK_NAME=serapod-production COMPOSE_DIR=/srv/apps/supabase-production DB_CONTAINER=serapod-prd-db STORAGE_VOLUME=serapod-prd-storage-data BACKUP_ROOT=/home/deploy/supabase-backups /home/deploy/supabase-ops/supabase-backup.sh >> /home/deploy/supabase-backups/serapod-production/backup.log 2>&1
```

This backup automation applies to the self-hosted production target only, not to Supabase Cloud production.

## Restore Flow

Restore command:

```bash
/home/deploy/apps/getouch.co/infra/scripts/supabase-restore.sh \
  --backup-dir /home/deploy/supabase-backups/serapod-preprod/20260413-223000
```

Interactive warning matches the Cloud behavior conceptually:

- your project will be offline during restoration
- any new data since this backup will be lost
- storage files can also be replaced if the archive exists

To skip the interactive confirmation:

```bash
/home/deploy/apps/getouch.co/infra/scripts/supabase-restore.sh \
  --backup-dir /home/deploy/supabase-backups/serapod-preprod/20260413-223000 \
  --yes
```

To restore database only and leave current storage files untouched:

```bash
/home/deploy/apps/getouch.co/infra/scripts/supabase-restore.sh \
  --backup-dir /home/deploy/supabase-backups/serapod-preprod/20260413-223000 \
  --no-storage
```

## Operational Difference From Supabase Cloud

Supabase Cloud gives you a managed UI with restore buttons and managed backup orchestration.

Self-hosted can match the backup and restore capability, but the control surface is one of these:

- shell scripts plus cron
- a small internal admin page that triggers these scripts
- external backup tooling such as Restic, pgBackRest, WAL-G, or snapshots

For Preprod, daily script-based backups are enough and simpler to operate.

## Recommended Next Step If You Want UI Buttons

If you want the exact experience of image 1 and image 2, the practical self-hosted version is:

1. keep these scripts as the backend implementation
2. add a small admin page in `getouch.co` that lists backup folders
3. add a restore action that requires a typed confirmation before invoking `supabase-restore.sh`

That gives you the same operator workflow, but with your own UI.