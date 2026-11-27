#!/usr/bin/env bash
# Promote an already registered account to ADMIN (system roles are USER and ADMIN
# since migration 20260929000100).
# Further admins can then be managed from the audited admin interface.
# Usage:  bash deploy/vps/make-admin.sh <email>
set -euo pipefail

EMAIL="${1:?Usage: make-admin.sh <email>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# The e-mail is passed as a psql variable and quoted by psql (:'email'), never
# spliced into the SQL text.
docker compose -f docker-compose.yml -f deploy/vps/docker-compose.vps.yml exec -T postgres \
  sh -c 'psql -v ON_ERROR_STOP=1 -v email="$1" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' _ "$EMAIL" <<'SQL'
UPDATE "users"
SET "system_role" = 'ADMIN', "role" = 'admin'
WHERE lower("email") = lower(:'email')
RETURNING "email", "system_role", "role";
SQL
echo "If no row is listed above, register that e-mail on the website first."
