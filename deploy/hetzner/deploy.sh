#!/usr/bin/env bash
# Build and (re)start the full LumiGap stack on the Hetzner server.
# Run from anywhere inside the repository checkout:  bash deploy/hetzner/deploy.sh
# Set SKIP_PULL=1 to deploy the current checkout without git pull.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  echo "Missing $ROOT/.env. Follow docs/DEPLOY_HETZNER.md (step 4) first." >&2
  exit 1
fi

if [ "${SKIP_PULL:-0}" != "1" ]; then
  git pull --ff-only
fi

COMPOSE=(docker compose -f docker-compose.yml -f deploy/hetzner/docker-compose.hetzner.yml)

"${COMPOSE[@]}" config --quiet
"${COMPOSE[@]}" up -d --build --remove-orphans
docker image prune -f >/dev/null

"${COMPOSE[@]}" ps
echo
echo "Deployed commit $(git rev-parse --short HEAD)."
