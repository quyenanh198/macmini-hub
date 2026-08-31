#!/bin/bash
# Giữ stock-site thức qua cửa sổ cron trong container (weekly Sat 07:30, monthly ngày 1 08:00).
# Sablier ngủ app sau 15 phút idle nên cron trong container không bao giờ chạy nếu không ai ghé;
# script này ping qua caddy (Cloudflare Access chặn curl công khai trước khi tới tunnel) mỗi 5
# phút trong ~45 phút để app thức trọn cửa sổ cron + rebuild.
set -uo pipefail

LOG="$HOME/Library/Logs/stock-wake.log"
echo "=== $(date) wake window start ===" >> "$LOG"
for i in $(seq 1 9); do
  code=$(docker run --rm --network macmini-hub_default curlimages/curl -s -o /dev/null -w '%{http_code}' \
    --max-time 60 -H 'Host: stock.lazybutts.com' http://caddy:80/ 2>>"$LOG" || echo fail)
  echo "$(date '+%H:%M:%S') ping $i -> $code" >> "$LOG"
  [ "$i" -lt 9 ] && sleep 300
done
echo "=== $(date) wake window end ===" >> "$LOG"
