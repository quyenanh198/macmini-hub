#!/bin/bash
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TTS_REPO="${TTS_REPO:-$HOME/TTS-Studio}"
PLIST_DST="$HOME/Library/LaunchAgents/com.lazybutts.tts-native.plist"
sed -e "s|__VENV__|$TTS_REPO/.venv-native|g" -e "s|__REPO__|$TTS_REPO|g" -e "s|__HOME__|$HOME|g" \
  "$REPO_DIR/scripts/com.lazybutts.tts-native.plist.template" > "$PLIST_DST"
plutil -lint "$PLIST_DST"
launchctl bootout "gui/$(id -u)" "$PLIST_DST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
echo "Installed. curl http://localhost:8600/ để kiểm tra."
