#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: supabase-restore.sh --backup-dir PATH [options]

Restores a self-hosted Supabase stack from a backup created by supabase-backup.sh.

Options:
  --backup-dir PATH         Required. Backup directory to restore from.
  --compose-dir PATH        Stack compose directory. Default: /home/deploy/apps/getouch.co/infra/supabase-preprod
  --db-container NAME       PostgreSQL container name. Default: serapod-preprod-db
  --db-user NAME            PostgreSQL admin user. Default: supabase_admin
  --primary-db NAME         Main application database. Default: supabase
  --analytics-db NAME       Analytics database. Default: _supabase
  --storage-volume NAME     Storage Docker volume. Default: serapod-preprod-storage-data
  --no-storage              Skip restoring storage object files.
  --yes                     Non-interactive confirmation.
  --help                    Show this help.
EOF
}

BACKUP_DIR=""
COMPOSE_DIR="${COMPOSE_DIR:-/home/deploy/apps/getouch.co/infra/supabase-preprod}"
DB_CONTAINER="${DB_CONTAINER:-serapod-preprod-db}"
DB_USER="${DB_USER:-supabase_admin}"
PRIMARY_DB="${PRIMARY_DB:-supabase}"
ANALYTICS_DB="${ANALYTICS_DB:-_supabase}"
STORAGE_VOLUME="${STORAGE_VOLUME:-serapod-preprod-storage-data}"
RESTORE_STORAGE=1
ASSUME_YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup-dir)
      BACKUP_DIR="$2"
      shift 2
      ;;
    --compose-dir)
      COMPOSE_DIR="$2"
      shift 2
      ;;
    --db-container)
      DB_CONTAINER="$2"
      shift 2
      ;;
    --db-user)
      DB_USER="$2"
      shift 2
      ;;
    --primary-db)
      PRIMARY_DB="$2"
      shift 2
      ;;
    --analytics-db)
      ANALYTICS_DB="$2"
      shift 2
      ;;
    --storage-volume)
      STORAGE_VOLUME="$2"
      shift 2
      ;;
    --no-storage)
      RESTORE_STORAGE=0
      shift
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$BACKUP_DIR" || ! -d "$BACKUP_DIR" ]]; then
  echo "Valid --backup-dir is required" >&2
  exit 1
fi

ENV_FILE="$COMPOSE_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

POSTGRES_PASSWORD="$(sed -n 's/^POSTGRES_PASSWORD=//p' "$ENV_FILE")"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "POSTGRES_PASSWORD is missing in $ENV_FILE" >&2
  exit 1
fi

primary_dump="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*-primary-*.dump' | head -1)"
analytics_dump="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*-analytics-*.dump' | head -1)"
globals_sql="$BACKUP_DIR/globals.sql"
storage_archive="$BACKUP_DIR/storage-files.tar.gz"

if [[ -z "$primary_dump" ]]; then
  echo "Primary database dump not found in $BACKUP_DIR" >&2
  exit 1
fi

echo "Restore from backup"
echo
echo "This will restore your self-hosted database from: $BACKUP_DIR"
echo
echo "This action cannot be undone"
echo "- Your project will be offline during restoration"
echo "- Any new data since this backup will be lost"
if [[ "$RESTORE_STORAGE" -eq 1 && -f "$storage_archive" ]]; then
  echo "- Storage files in the archive will replace the current storage volume"
fi

if [[ "$ASSUME_YES" -ne 1 ]]; then
  read -r -p "Type RESTORE to continue: " confirmation
  if [[ "$confirmation" != "RESTORE" ]]; then
    echo "Restore cancelled"
    exit 1
  fi
fi

cd "$COMPOSE_DIR"

docker compose stop auth rest realtime storage analytics meta kong studio imgproxy || true
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
  psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('$PRIMARY_DB', '$ANALYTICS_DB') AND pid <> pg_backend_pid();"

if [[ -f "$globals_sql" ]]; then
  docker cp "$globals_sql" "$DB_CONTAINER:/tmp/globals.sql"
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
    psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=0 -f /tmp/globals.sql >/dev/null
fi

docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
  dropdb -U "$DB_USER" --if-exists "$PRIMARY_DB"
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
  createdb -U "$DB_USER" "$PRIMARY_DB"
docker cp "$primary_dump" "$DB_CONTAINER:/tmp/primary.dump"
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
  pg_restore -U "$DB_USER" -d "$PRIMARY_DB" --clean --if-exists --no-owner --no-privileges /tmp/primary.dump

if [[ -n "$analytics_dump" ]]; then
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
    dropdb -U "$DB_USER" --if-exists "$ANALYTICS_DB"
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
    createdb -U "$DB_USER" "$ANALYTICS_DB"
  docker cp "$analytics_dump" "$DB_CONTAINER:/tmp/analytics.dump"
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
    pg_restore -U "$DB_USER" -d "$ANALYTICS_DB" --clean --if-exists --no-owner --no-privileges /tmp/analytics.dump
fi

if [[ "$RESTORE_STORAGE" -eq 1 && -f "$storage_archive" ]]; then
  docker run --rm \
    -v "$STORAGE_VOLUME:/target" \
    -v "$BACKUP_DIR:/backup:ro" \
    alpine:3.20 \
    sh -lc 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -xzf /backup/storage-files.tar.gz -C /target'
fi

docker compose up -d >/dev/null
docker compose ps

echo "Restore complete from $BACKUP_DIR"