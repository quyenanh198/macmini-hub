#!/bin/bash
# Backup hằng đêm cho /Volumes/hubdata → iCloud Drive (offsite thật khi iCloud sync).
# Snapshot theo ngày với hardlink (--link-dest) nên mỗi bản chỉ tốn dung lượng phần thay đổi.
# Loại trừ: model AI tải lại được (6GB+), cache, binary. Chat DB copy bằng sqlite .backup
# để nhất quán khi app đang ghi. Giữ 14 bản gần nhất.
set -euo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

SRC="/Volumes/hubdata"
HUB_REPO="${HUB_REPO:-$HOME/macmini-hub}"
ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
DEST_ROOT="${BACKUP_DEST:-$ICLOUD/Backups/hubdata}"
[ -d "$ICLOUD" ] || DEST_ROOT="${BACKUP_DEST:-$HOME/Backups/hubdata}"
STAMP=$(date '+%Y-%m-%d_%H%M')
DEST="$DEST_ROOT/$STAMP"
LOG="$HOME/Library/Logs/hubdata-backup.log"

echo "=== $(date) backup start -> $DEST ===" >> "$LOG"
mkdir -p "$DEST"

# 1. Chat DB: bản sao nhất quán (WAL đang mở) + media qua rsync bên dưới.
mkdir -p "$DEST/chat-db"
sqlite3 "$SRC/chat/db/lazybutts.sqlite3" ".backup '$DEST/chat-db/lazybutts.sqlite3'" >> "$LOG" 2>&1

# 2. Toàn bộ hubdata trừ thứ tải lại được.
LINKOPT=()
[ -e "$DEST_ROOT/latest" ] && LINKOPT=(--link-dest="$DEST_ROOT/latest")
rsync -a --exclude 'TTSStudio/models' --exclude 'TTSStudio/cache' --exclude 'TTSStudio/bin' \
      --exclude 'chat/db' "${LINKOPT[@]}" "$SRC/" "$DEST/hubdata/" >> "$LOG" 2>&1

# 3. Secrets + máy chủ config không nằm trong git.
cp "$HUB_REPO/.env" "$DEST/env" 2>>"$LOG" || true

ln -sfn "$DEST" "$DEST_ROOT/latest"

# 4. Prune: giữ 14 snapshot mới nhất (BSD tail: bỏ 14 dòng đầu của danh sách mới→cũ).
ls -1d "$DEST_ROOT"/20* 2>/dev/null | sort -r | tail -n +15 | while read -r old; do
  rm -rf "$old"; echo "pruned $old" >> "$LOG"
done

echo "=== $(date) backup done ($(du -sh "$DEST" | cut -f1)) ===" >> "$LOG"
