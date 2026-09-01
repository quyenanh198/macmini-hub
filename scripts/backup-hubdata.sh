#!/bin/bash
# Backup hằng đêm /Volumes/hubdata → iCloud Drive, MÃ HOÁ (aes-256, khoá nằm ngoài iCloud).
# Khoá: ~/.config/lazybutts/backup.key — tự sinh lần đầu; LƯU BẢN SAO vào password manager,
# mất khoá = mất backup. Giữ 14 bản .tar.gz.enc mới nhất.
#
# Khôi phục:
#   openssl enc -d -aes-256-cbc -pbkdf2 -pass file:$HOME/.config/lazybutts/backup.key \
#     -in hubdata-<stamp>.tar.gz.enc | tar xzf - -C <đích>
set -euo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

SRC="/Volumes/hubdata"
HUB_REPO="${HUB_REPO:-$HOME/macmini-hub}"
ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
DEST_ROOT="${BACKUP_DEST:-$ICLOUD/Backups/hubdata}"
[ -d "$ICLOUD" ] || DEST_ROOT="${BACKUP_DEST:-$HOME/Backups/hubdata}"
KEYFILE="$HOME/.config/lazybutts/backup.key"
STAMP=$(date '+%Y-%m-%d_%H%M')
LOG="$HOME/Library/Logs/hubdata-backup.log"

echo "=== $(date) backup start ===" >> "$LOG"
mkdir -p "$DEST_ROOT"

if [ ! -f "$KEYFILE" ]; then
  mkdir -p "$(dirname "$KEYFILE")"
  openssl rand -hex 32 > "$KEYFILE"
  chmod 600 "$KEYFILE"
  echo "GENERATED NEW BACKUP KEY at $KEYFILE — save a copy in your password manager!" >> "$LOG"
fi

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

# 1. Chat DB: bản sao nhất quán. TUYỆT ĐỐI không chạy sqlite3 của host vào DB
# đang mở trong container — khoá file macOS và VM không thấy nhau qua bind
# mount, sẽ phá WAL đang chạy (SQLITE_IOERR_SHORT_READ, đã dính 1 lần).
# Backup từ TRONG container (cùng locking domain); host sqlite3 chỉ khi app tắt.
mkdir -p "$STAGE/chat-db"
if docker ps --format '{{.Names}}' | grep -q '^macmini-hub-chat-1$'; then
  docker exec macmini-hub-chat-1 node -e '
    const db = require("better-sqlite3")("/data/db/lazybutts.sqlite3", { readonly: true });
    db.backup("/data/db/.nightly-backup.sqlite3").then(() => process.exit(0))
      .catch((e) => { console.error(e); process.exit(1); });
  ' >> "$LOG" 2>&1
  mv "$SRC/chat/db/.nightly-backup.sqlite3" "$STAGE/chat-db/lazybutts.sqlite3"
else
  sqlite3 "$SRC/chat/db/lazybutts.sqlite3" ".backup '$STAGE/chat-db/lazybutts.sqlite3'" >> "$LOG" 2>&1
fi

# 1b. Farm DB (Nông trại vui vẻ): cùng luật với chat — container đang chạy
# thì backup từ TRONG container; đang ngủ (thường là vậy lúc 3h sáng) thì
# copy thẳng file là an toàn.
mkdir -p "$STAGE/farm-db"
if docker ps --format '{{.Names}}' | grep -q '^macmini-hub-farm-1$'; then
  docker exec macmini-hub-farm-1 node -e '
    const db = require("better-sqlite3")("/data/farm2.sqlite3", { readonly: true });
    db.backup("/data/.nightly-backup.sqlite3").then(() => process.exit(0))
      .catch((e) => { console.error(e); process.exit(1); });
  ' >> "$LOG" 2>&1
  mv "$SRC/farm/.nightly-backup.sqlite3" "$STAGE/farm-db/farm2.sqlite3"
elif [ -f "$SRC/farm/farm2.sqlite3" ]; then
  cp "$SRC/farm/farm2.sqlite3" "$STAGE/farm-db/farm2.sqlite3"
fi

# 2. Toàn bộ hubdata trừ thứ tải lại được.
rsync -a --exclude 'TTSStudio/models' --exclude 'TTSStudio/cache' --exclude 'TTSStudio/bin' \
      --exclude 'chat/db' --exclude 'farm' "$SRC/" "$STAGE/hubdata/" >> "$LOG" 2>&1

# 3. Secrets + config ngoài git.
cp "$HUB_REPO/.env" "$STAGE/env" 2>>"$LOG" || true

# 4. Đóng gói + mã hoá.
OUT="$DEST_ROOT/hubdata-$STAMP.tar.gz.enc"
tar czf - -C "$STAGE" . | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "file:$KEYFILE" -out "$OUT"

# 5. Prune: giữ 14 bản mới nhất.
ls -1 "$DEST_ROOT"/hubdata-*.tar.gz.enc 2>/dev/null | sort -r | tail -n +15 | while read -r old; do
  rm -f "$old"; echo "pruned $old" >> "$LOG"
done
# Dọn snapshot dạng thư mục cũ (phiên bản script trước, không mã hoá).
rm -rf "$DEST_ROOT"/20* "$DEST_ROOT/latest" 2>/dev/null || true

echo "=== $(date) backup done ($(du -h "$OUT" | cut -f1 | tr -d ' ')) ===" >> "$LOG"
