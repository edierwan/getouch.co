#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: supabase-backup.sh [options]

Creates a self-hosted Supabase backup bundle for a stack.

Options:
  --stack-name NAME         Backup namespace. Default: serapod-preprod
  --compose-dir PATH        Stack compose directory. Default: /home/deploy/apps/getouch.co/infra/supabase-preprod
  --db-container NAME       PostgreSQL container name. Default: serapod-preprod-db
  --db-user NAME            PostgreSQL admin user. Default: supabase_admin
  --primary-db NAME         Main application database. Default: supabase
  --analytics-db NAME       Analytics database. Default: _supabase
  --storage-volume NAME     Storage Docker volume. Default: serapod-preprod-storage-data
  --backup-root PATH        Backup root. Default: $HOME/supabase-backups
  --retention-days DAYS     Retention window for old backup directories. Default: 14
  --skip-storage            Skip storage object file backup.
  --help                    Show this help.

Environment variable overrides use the same names in uppercase.
EOF
}

STACK_NAME="${STACK_NAME:-serapod-preprod}"
COMPOSE_DIR="${COMPOSE_DIR:-/home/deploy/apps/getouch.co/infra/supabase-preprod}"
DB_CONTAINER="${DB_CONTAINER:-serapod-preprod-db}"
DB_USER="${DB_USER:-supabase_admin}"
PRIMARY_DB="${PRIMARY_DB:-supabase}"
ANALYTICS_DB="${ANALYTICS_DB:-_supabase}"
STORAGE_VOLUME="${STORAGE_VOLUME:-serapod-preprod-storage-data}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/supabase-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
INCLUDE_STORAGE=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stack-name)
      STACK_NAME="$2"
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
    --backup-root)
      BACKUP_ROOT="$2"
      shift 2
      ;;
    --retention-days)
      RETENTION_DAYS="$2"
      shift 2
      ;;
    --skip-storage)
      INCLUDE_STORAGE=0
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

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="$BACKUP_ROOT/$STACK_NAME/$timestamp"
mkdir -p "$backup_dir"

primary_dump_name="${STACK_NAME}-primary-${timestamp}.dump"
analytics_dump_name="${STACK_NAME}-analytics-${timestamp}.dump"

echo "Creating backup at $backup_dir"

cp "$COMPOSE_DIR/docker-compose.yml" "$backup_dir/docker-compose.yml"
cp "$ENV_FILE" "$backup_dir/.env"
docker inspect "$DB_CONTAINER" > "$backup_dir/${DB_CONTAINER}.inspect.json"
docker volume inspect "$STORAGE_VOLUME" > "$backup_dir/${STORAGE_VOLUME}.volume.json" 2>/dev/null || true

docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
  pg_dumpall --globals-only -U "$DB_USER" > "$backup_dir/globals.sql"

docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
  pg_dump -Fc -U "$DB_USER" -d "$PRIMARY_DB" -f "/tmp/$primary_dump_name"
docker cp "$DB_CONTAINER:/tmp/$primary_dump_name" "$backup_dir/$primary_dump_name"

analytics_exists="$({ docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
  psql -U "$DB_USER" -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$ANALYTICS_DB'"; } || true)"

if [[ "$analytics_exists" == "1" ]]; then
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
    pg_dump -Fc -U "$DB_USER" -d "$ANALYTICS_DB" -f "/tmp/$analytics_dump_name"
  docker cp "$DB_CONTAINER:/tmp/$analytics_dump_name" "$backup_dir/$analytics_dump_name"
fi

if [[ "$INCLUDE_STORAGE" -eq 1 ]]; then
  docker volume inspect "$STORAGE_VOLUME" >/dev/null 2>&1 && \
    docker run --rm \
      -v "$STORAGE_VOLUME:/source:ro" \
      -v "$backup_dir:/backup" \
      alpine:3.20 \
      sh -lc 'cd /source && tar -czf /backup/storage-files.tar.gz .'
fi

cat > "$backup_dir/manifest.txt" <<EOF
stack_name=$STACK_NAME
created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
compose_dir=$COMPOSE_DIR
db_container=$DB_CONTAINER
db_user=$DB_USER
primary_db=$PRIMARY_DB
analytics_db=$ANALYTICS_DB
storage_volume=$STORAGE_VOLUME
include_storage=$INCLUDE_STORAGE
retention_days=$RETENTION_DAYS
EOF

(
  cd "$backup_dir"
  shasum -a 256 ./* > SHA256SUMS
)

ln -sfn "$backup_dir" "$BACKUP_ROOT/$STACK_NAME/latest"

find "$BACKUP_ROOT/$STACK_NAME" \
  -mindepth 1 \
  -maxdepth 1 \
  -type d \
  -name '20*' \
  -mtime "+$RETENTION_DAYS" \
  -exec rm -rf {} +

echo "Backup complete: $backup_dir"