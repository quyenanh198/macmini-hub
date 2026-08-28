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
docker compose --profile apps pull
docker compose --profile apps up -d
echo "=== $(date) done ==="
