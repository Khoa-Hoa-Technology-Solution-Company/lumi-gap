#!/usr/bin/env bash
# Move the stack to a new public domain without breaking the current one.
#
# Usage (on the server, from anywhere inside the checkout):
#   bash deploy/vps/switch-domain.sh <web-domain> [api-domain]
#   bash deploy/vps/switch-domain.sh lumigap.io.vn                 # api defaults to api.<web-domain>
#   CHECK_ONLY=1 bash deploy/vps/switch-domain.sh lumigap.io.vn    # only report DNS, change nothing
#
# It refuses to change anything until <web-domain> and <api-domain> resolve to
# this server, because Caddy can only obtain Let's Encrypt certificates for
# names that already point here. When they do, it updates LUMIGAP_DOMAIN and
# API_DOMAIN in .env, redeploys (Caddy requests the certificates, CORS and
# e-mail links follow), and waits for HTTPS to answer. The old .env is kept in
# ~/env-backups/ (outside the checkout, so it can never be committed).
#
# SERVER_IP overrides the detected public IP (detected via api.ipify.org).
set -euo pipefail

WEB="${1:?Usage: switch-domain.sh <web-domain> [api-domain]}"
API="${2:-api.$WEB}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

valid='^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$'
for name in "$WEB" "$API"; do
  if ! [[ "$name" =~ $valid ]]; then
    echo "Invalid domain name: $name (use lowercase, no scheme or path)" >&2
    exit 1
  fi
done

SERVER_IP="${SERVER_IP:-$(curl -fsS --max-time 10 https://api.ipify.org || true)}"
if [ -z "$SERVER_IP" ]; then
  echo "Could not detect this server's public IP; set SERVER_IP=<ip>." >&2
  exit 1
fi

resolve() { getent ahostsv4 "$1" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' '; }

ok=1
echo "Server public IP: $SERVER_IP"
for name in "$WEB" "$API" "www.$WEB"; do
  ips="$(resolve "$name")"
  if [[ " $ips " == *" $SERVER_IP "* ]]; then
    echo "  OK    $name -> $ips"
  elif [ "$name" = "www.$WEB" ]; then
    echo "  WARN  $name -> ${ips:-not resolving} (optional: www redirect gets no certificate until it points here)"
  else
    echo "  WAIT  $name -> ${ips:-not resolving} (needs an A record to $SERVER_IP)"
    ok=0
  fi
done

if [ "$ok" != 1 ]; then
  echo
  echo "DNS is not ready; nothing was changed. The current domain keeps working."
  echo "Re-run this script once the domain is active and the A records point here."
  exit 2
fi

if [ "${CHECK_ONLY:-0}" = "1" ]; then
  echo
  echo "DNS is ready. Run again without CHECK_ONLY=1 to switch."
  exit 0
fi

OLD_WEB="$(grep -E '^LUMIGAP_DOMAIN=' .env | cut -d= -f2- || true)"
BACKUP_DIR="$HOME/env-backups"
install -d -m 700 "$BACKUP_DIR"
cp .env "$BACKUP_DIR/.env.bak-$(date +%Y%m%d-%H%M%S)"
setkv() {
  if grep -qE "^$1=" .env; then
    sed -i "s|^$1=.*|$1=$2|" .env
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}
setkv LUMIGAP_DOMAIN "$WEB"
setkv API_DOMAIN "$API"
echo
echo "Updated .env: LUMIGAP_DOMAIN=$WEB API_DOMAIN=$API (was ${OLD_WEB:-unset})"

SKIP_PULL=1 bash deploy/vps/deploy.sh

echo
echo "Waiting for HTTPS (Caddy is requesting certificates)..."
for i in $(seq 1 30); do
  if curl -fsS --max-time 10 -o /dev/null "https://$API/ready" && curl -fsS --max-time 10 -o /dev/null "https://$WEB/"; then
    echo "  https://$WEB and https://$API/ready are up."
    echo
    echo "Next (on your computer):"
    echo "  gh variable set AZURE_WEB_URL --body \"https://$WEB\""
    echo "  gh variable set AZURE_API_URL --body \"https://$API\""
    echo "  Google OAuth redirect URI: https://$API/api/v1/auth/google/callback"
    exit 0
  fi
  sleep 10
done

echo "HTTPS did not come up within 5 minutes. Check: docker compose -f docker-compose.yml -f deploy/vps/docker-compose.vps.yml logs caddy" >&2
echo "To roll back: copy the newest ~/env-backups/.env.bak-* over .env and run deploy/vps/deploy.sh." >&2
exit 1
