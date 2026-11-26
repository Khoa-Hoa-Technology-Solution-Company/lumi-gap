#!/usr/bin/env bash
# One-time data setup after the first successful deploy:
#   1. creates the OpenAlex provider row the sync worker needs (never overwrites it),
#   2. loads the OpenAlex taxonomy (domains, fields, subfields, topics) so admins
#      can pick catalogue entries to "Follow daily".
# Both steps are idempotent; re-running is safe.
# Usage (from the repository checkout on the server):  bash deploy/vps/first-run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f docker-compose.yml -f deploy/vps/docker-compose.vps.yml)

echo "==> Seeding the OpenAlex API provider"
"${COMPOSE[@]}" exec -T backend pnpm --filter backend seed:providers

echo "==> Loading the OpenAlex taxonomy (a few minutes)"
"${COMPOSE[@]}" exec -T backend pnpm --filter backend taxonomy:sync

echo
echo "Done. Next: register an account on the website, then run"
echo "  bash deploy/vps/make-admin.sh <your-email>"
