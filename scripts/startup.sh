#!/bin/bash
# Chờ Docker (OrbStack) sẵn sàng rồi kéo stack lên. Chạy bởi LaunchAgent sau auto-login.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$HOME/Library/Logs/macmini-hub-startup.log"
exec >>"$LOG" 2>&1
echo "=== $(date) startup ==="

for i in $(seq 1 60); do
  if docker info >/dev/null 2>&1; then
    break
  fi
  echo "waiting for docker ($i/60)..."
  sleep 5
done
docker info >/dev/null 2>&1 || { echo "docker not ready after 300s, abort"; exit 1; }

cd "$REPO_DIR"

[ -f .env ] || { echo ".env not found in $REPO_DIR, abort"; exit 1; }
DATA_ROOT="$(grep '^DATA_ROOT=' .env | cut -d= -f2-)"
[ -n "$DATA_ROOT" ] || { echo "DATA_ROOT not set in .env, abort"; exit 1; }
[ -d "$DATA_ROOT" ] || { echo "DATA_ROOT ($DATA_ROOT) is not a directory — external drive not mounted? abort"; exit 1; }

docker compose up -d
docker compose --profile apps up -d || echo "apps profile failed (images may not exist yet), core is up"
echo "=== $(date) done ==="
