#!/bin/bash
# Cài LaunchAgent: thay path thật vào template, copy, load. Chạy trên Mac Mini.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_DST="$HOME/Library/LaunchAgents/com.macmini-hub.startup.plist"

mkdir -p "$HOME/Library/LaunchAgents"
sed -e "s|__REPO_DIR__|$REPO_DIR|g" -e "s|__HOME__|$HOME|g" \
  "$REPO_DIR/scripts/com.macmini-hub.startup.plist.template" > "$PLIST_DST"

plutil -lint "$PLIST_DST"
launchctl bootout "gui/$(id -u)" "$PLIST_DST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
echo "Installed. Test: launchctl kickstart gui/$(id -u)/com.macmini-hub.startup"
