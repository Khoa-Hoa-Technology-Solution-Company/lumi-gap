#!/usr/bin/env bash
# Dump the PostgreSQL database to ~/backups and keep the last 7 dumps.
# Schedule daily with cron, for example:
#   15 1 * * * bash /home/<deploy-user>/lumi-gap/deploy/hetzner/backup-db.sh >> /home/<deploy-user>/backups/backup.log 2>&1
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP="${KEEP:-7}"
mkdir -p "$BACKUP_DIR"
cd "$ROOT"

FILE="$BACKUP_DIR/lumigap-$(date +%Y%m%d-%H%M%S).dump"
docker compose -f docker-compose.yml -f deploy/hetzner/docker-compose.hetzner.yml exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$FILE"
chmod 600 "$FILE"

ls -1t "$BACKUP_DIR"/lumigap-*.dump | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "$(date -Is) backup written: $FILE ($(du -h "$FILE" | cut -f1))"
