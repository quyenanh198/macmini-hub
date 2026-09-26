#!/bin/bash
# Deploy một service của hub cho an toàn:
#   1. Luôn có đường lùi. Docker trên máy này dùng kho image kiểu containerd: build đè
#      :latest là bản cũ MẤT HẲN — container vẫn chạy nó nhưng không gọi tên hay tag lại
#      được nữa. Nên script giữ tag :live trỏ vào bản đang chạy; build đè :latest bao
#      nhiêu lần thì bản đang chạy vẫn còn tên, lúc thay thì nó thành :previous.
#      Mỗi app chỉ giữ đúng HAI bản: :live (đang chạy) và :previous (dự phòng). Bản cũ
#      hơn nữa bị xoá ngay khi có bản mới đè lên.
#   2. Thay container theo cách không làm sablier báo lỗi (xem swap_container).
#   3. Kiểm tra thật qua Caddy: đúng mã và đúng kiểu nội dung — sablier trả lỗi kèm mã
#      200, chỉ nhìn mã là bị lừa.
#   4. Kiểm tra hỏng thì tự quay về bản đang chạy trước đó.
#
# Cách dùng:
#   scripts/deploy.sh <service> --build      build từ apps/<app> (commit hub đang trỏ tới) rồi đưa lên
#   scripts/deploy.sh <service>              đưa image :latest đã build sẵn lên
#   scripts/deploy.sh <service> --rollback   quay về bản chạy trước đó (chạy lần nữa để tiến lại)
#   scripts/deploy.sh <service> --list       xem các bản đang giữ
#
# Lưu ý khi lùi: dữ liệu KHÔNG lùi theo. Các migration ở đây chỉ thêm cột/bảng nên bản cũ
# vẫn chạy được trên dữ liệu mới; còn dữ liệu có backup hằng đêm riêng (backup-hubdata.sh).
set -euo pipefail
cd "$(dirname "$0")/.."

HEALTH_TIMEOUT=120    # giây chờ container healthy
ROUTE_TIMEOUT=90      # giây chờ Caddy trả đúng trang (app đang ngủ cần thời gian thức)

compose() { docker compose --profile apps --profile fallback "$@"; }
say() { printf '%s\n' "$*"; }
die() { printf '✗ %s\n' "$*" >&2; exit 1; }

svc=${1:-}
action=${2:---deploy}
[ -n "$svc" ] || die "cách dùng: scripts/deploy.sh <service> [--build|--rollback|--list]"

# Image, có qua sablier không, và thư mục build — lấy thẳng từ compose, khỏi ghi tay hai nơi.
read -r image sablier context < <(compose config --format json | python3 -c '
import json, sys
svc = sys.argv[1]
s = json.load(sys.stdin)["services"].get(svc)
if not s:
    sys.exit(1)
labels = s.get("labels") or {}
on = labels.get("sablier.enable") == "true" if isinstance(labels, dict) else "sablier.enable=true" in labels
build = s.get("build")
ctx = build.get("context") if isinstance(build, dict) else (build or "")
print(s.get("image", ""), "yes" if on else "no", ctx or "-")' "$svc") || die "không có service '$svc' trong docker-compose.yml"
[ -n "$image" ] || die "service '$svc' không khai báo image"
repo=${image%:*}
# Ảnh ghcr.io/quyenanh198/<app> build từ apps/<app> (CI cũng theo đúng quy ước này).
[ "$context" != "-" ] || context="apps/${repo##*/}"

# Trang dùng để kiểm tra từng app qua Caddy: host, đường dẫn, kiểu nội dung phải thấy.
route_for() {
  case "$1" in
    hub-ui)       echo "lazybutts.com / text/html" ;;
    chat)         echo "chat.lazybutts.com / text/html" ;;
    farm)         echo "chat.lazybutts.com /farm/ text/html" ;;
    mahjong)      echo "chat.lazybutts.com /mahjong/ text/html" ;;
    blockpuzzle)  echo "chat.lazybutts.com /blockpuzzle/ text/html" ;;
    garden)       echo "chat.lazybutts.com /garden/ text/html" ;;
    worms)        echo "chat.lazybutts.com /worms/ text/html" ;;
    musik)        echo "musik.lazybutts.com /api/health application/json" ;;
    audioextract) echo "audioextract.lazybutts.com / text/html" ;;
    gunny)        echo "gunny.lazybutts.com /readyz application/json" ;;
    noto)         echo "noto.lazybutts.com / text/html" ;;
    cadence2)     echo "cadence.lazybutts.com / text/html" ;;
    stock-site)   echo "stock.lazybutts.com / text/html" ;;
    *)            echo "" ;;
  esac
}

id_of() { docker image inspect -f '{{.Id}}' "$1" 2>/dev/null || true; }
revision_of() { docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$1" 2>/dev/null || true; }

running_image_id() {  # image của container đang có (chạy hay đang ngủ), rỗng nếu chưa có
  local cid; cid=$(compose ps -a -q "$svc" 2>/dev/null | head -1)
  [ -n "$cid" ] && docker inspect -f '{{.Image}}' "$cid" || true
}

list_backups() {
  local tag
  docker images "$repo" --format '{{.Tag}}' | { grep -E '^(live|latest|previous)$' || true; } | sort |
    while read -r tag; do
      printf '%-24s %.19s  commit %-9s %s\n' "$tag" "$(id_of "$repo:$tag")" "$(revision_of "$repo:$tag" | cut -c1-9)" \
        "$(docker image inspect -f '{{.Created}}' "$repo:$tag" | cut -c1-16)"
    done
}

# Chỉ giữ :live và :previous. Bản bị đẩy ra khỏi :previous (và bản hỏng vừa thử) mất hết
# tag, thành image vô danh — xoá chúng. `image prune` chỉ đụng image vô danh và không bao
# giờ xoá image mà một container (kể cả đang ngủ) còn dùng. Nó dọn cho cả máy, đúng với
# chính sách: mỗi app chỉ giữ hai bản có tên.
prune_old() {
  local freed
  freed=$(docker image prune -f 2>/dev/null | awk '/reclaimed/ {print $NF}')
  [ -z "$freed" ] || [ "$freed" = "0B" ] || say "  xoá bản cũ, giải phóng $freed"
}

# Sablier theo dõi container theo TÊN. `up -d` thường đổi tên container cũ thành
# <id>_<tên>, tạo cái mới, rồi xoá cái cũ — sablier kịp nhớ cái tên tạm đó và báo
# "No such container" tới 15-25 giây, tới khi tự dò lại. Xoá hẳn cái cũ trước thì cái
# mới mang đúng tên cũ; trong lúc chờ nó lên, sablier giữ request lại chứ không báo lỗi.
# Đo thật: cách cũ 11-22 lần lỗi mỗi lần deploy, cách này 0.
swap_container() {
  local out
  if [ "$sablier" = yes ]; then
    compose rm -sf "$svc" >/dev/null 2>&1 || true
  fi
  # compose in tiến độ ra stderr; chỉ hiện khi thật sự hỏng.
  if ! out=$(compose up -d "$svc" 2>&1); then
    printf '%s\n' "$out" >&2
    return 1
  fi
}

# Container phải thật sự chạy đúng image vừa đưa lên. Trang cũ vẫn trả 200 bình thường,
# nên chỉ kiểm tra qua Caddy thì một lần deploy "không thay gì cả" trông y như thành công
# (đã xảy ra với hub-ui: compose dùng tag :local chứ không phải :latest).
running_is() {
  local want have
  want=$(id_of "$1")
  have=$(running_image_id)
  [ -n "$want" ] && [ "$have" = "$want" ] && return 0
  say "  container vẫn chạy image khác (${have:7:12}), không phải bản vừa đưa lên (${want:7:12})"
  return 1
}

wait_healthy() {
  local cid status i
  cid=$(compose ps -q "$svc" | head -1)
  [ -n "$cid" ] || { say "  container không chạy"; return 1; }
  for ((i = 0; i < HEALTH_TIMEOUT; i++)); do
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo gone)
    case "$status" in
      healthy|running) return 0 ;;
      unhealthy|exited|dead|gone) say "  container: $status"; return 1 ;;
    esac
    sleep 1
  done
  say "  hết ${HEALTH_TIMEOUT}s mà chưa healthy (đang: $status)"
  return 1
}

check_route() {
  local route host path want out code ct i
  route=$(route_for "$svc")
  [ -n "$route" ] || { say "  (không có trang để kiểm tra qua Caddy — chỉ dựa vào healthcheck)"; return 0; }
  read -r host path want <<<"$route"
  for ((i = 0; i < ROUTE_TIMEOUT; i += 3)); do
    out=$(docker compose exec -T caddy wget -qS -O /dev/null --timeout=70 --header="Host: $host" "http://localhost$path" 2>&1 || true)
    code=$(printf '%s\n' "$out" | grep -m1 'HTTP/' | awk '{print $2}')
    ct=$(printf '%s\n' "$out" | grep -im1 '^ *content-type' | awk '{print $2}' | tr -d ';\r')
    if [[ "$code" =~ ^2 ]] && [ "$ct" = "$want" ]; then
      say "  $host$path → $code $ct"
      return 0
    fi
    sleep 3
  done
  say "  $host$path → ${code:-không trả lời} ${ct:-} (cần $want)"
  return 1
}

# Đưa image $1 lên. $2 = image để tự lùi về nếu hỏng (rỗng = không có đường lùi).
switch_to() {
  local target=$1 fallback=${2:-}
  docker tag "$target" "$image"
  say "→ thay container $svc$([ "$sablier" = yes ] && echo ' (xoá cái cũ trước — service qua sablier)')"
  if swap_container && wait_healthy && running_is "$target" && check_route; then
    docker tag "$target" "$repo:live"
    return 0
  fi
  [ -n "$fallback" ] || die "$svc hỏng và không có bản trước để lùi — xem: docker compose logs $svc"
  say "✗ bản mới hỏng — log cuối của nó (không giữ image hỏng lại, chỉ giữ :live và :previous):"
  compose logs --no-color --tail 20 "$svc" 2>&1 | sed 's/^/    /' || true
  say "  tự lùi về bản đang chạy trước đó"
  docker tag "$fallback" "$image"
  # Lần deploy hỏng không được làm mất đường lùi cũ: trả :previous về như trước lúc thử.
  if [ -n "${PREV_BEFORE:-}" ]; then docker tag "$PREV_BEFORE" "$repo:previous"; fi
  if swap_container && wait_healthy && running_is "$fallback" && check_route; then
    docker tag "$fallback" "$repo:live"
    prune_old
    die "đã lùi về bản trước và nó chạy bình thường"
  fi
  die "lùi rồi mà bản trước cũng không lên — xem: docker compose logs $svc"
}

# Bản đang chạy có còn tên để lùi về không. Lần đầu dùng script thì chưa có :live;
# nếu container đang chạy đúng image compose khai báo (chưa build đè) thì đặt :live cho nó luôn.
ensure_live() {
  local running latest
  [ -z "$(id_of "$repo:live")" ] || return 0
  running=$(running_image_id)
  latest=$(id_of "$image")
  if [ -n "$running" ] && [ "$running" = "$latest" ]; then
    docker tag "$image" "$repo:live"
  fi
}

case "$action" in
  --list)
    say "Các bản đang giữ của $repo:"
    list_backups
    ;;

  --build|--deploy)
    ensure_live
    if [ "$action" = --build ]; then
      [ -d "$context" ] || die "không thấy thư mục build $context"
      rev=$(git -C "$context" rev-parse --short HEAD 2>/dev/null || echo unknown)
      [ -z "$(git -C "$context" status --porcelain -- . 2>/dev/null)" ] || rev="$rev-dirty"
      say "• build $repo từ $context (commit $rev)"
      docker build -q --label "org.opencontainers.image.revision=$rev" -t "$image" "$context" >/dev/null
    fi
    new=$(id_of "$image")
    [ -n "$new" ] || die "chưa có image $image — build trước, hoặc dùng --build"
    live=$(id_of "$repo:live")
    if [ -n "$live" ] && [ "$live" = "$new" ] && [ "$(running_image_id)" = "$new" ]; then
      say "= $svc đang chạy đúng bản này rồi, không có gì để đổi"
      exit 0
    fi
    PREV_BEFORE=$(id_of "$repo:previous")
    if [ -n "$live" ]; then
      docker tag "$repo:live" "$repo:previous"
      say "• giữ bản đang chạy làm dự phòng: $repo:previous"
    elif [ -z "$(running_image_id)" ]; then
      say "• service mới, chưa có bản nào chạy trước đó — lần này không có gì để lùi về"
    else
      say "! bản đang chạy không còn tên (đã bị build đè trước khi có script này) — lần này không có đường lùi"
    fi
    switch_to "$new" "$live"
    prune_old
    say "✓ $svc đã lên bản mới. Hỏng gì thì: scripts/deploy.sh $svc --rollback"
    ;;

  --rollback)
    prev=$(id_of "$repo:previous")
    [ -n "$prev" ] || die "chưa có bản :previous cho $repo"
    live=$(id_of "$repo:live")
    [ "$prev" != "$live" ] || die "đang chạy đúng bản :previous rồi"
    # Bản đang chạy đổi chỗ thành :previous — lùi nhầm thì chạy --rollback lần nữa là tiến lại.
    docker tag "$repo:previous" "$repo:rollback-target"
    if [ -n "$live" ]; then
      docker tag "$repo:live" "$repo:previous"
    fi
    say "↩ lùi $svc về bản trước"
    switch_to "$repo:rollback-target" "$live"
    docker rmi "$repo:rollback-target" >/dev/null 2>&1 || true
    prune_old
    say "✓ $svc đã chạy bản trước. Bản vừa gỡ xuống ở :previous (chạy lại --rollback để tiến lại)."
    ;;

  *)
    die "không hiểu '$action' — dùng --build, --rollback, --list, hoặc bỏ trống"
    ;;
esac
