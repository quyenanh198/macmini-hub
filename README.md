# macmini-hub

Stack tích hợp chạy trên Mac Mini (Apple Silicon + OrbStack).

## Chạy

    cp .env.example .env   # điền token
    docker compose up -d                    # core: dashboard + logs + tunnel
    docker compose --profile apps up -d     # kèm apps

## Deploy / cập nhật một app

    git -C apps/<app> fetch && git -C apps/<app> checkout <commit>   # rồi commit bump submodule
    scripts/deploy.sh <service> --build      # build từ apps/<app> rồi đưa lên
    scripts/deploy.sh <service> --rollback   # quay về bản trước (chạy lần nữa để tiến lại)
    scripts/deploy.sh <service> --list       # xem các bản đang giữ

Đừng deploy tay bằng `docker build -t ...:latest && docker compose up -d`, vì hai lẽ:

- **Mất đường lùi.** Docker ở đây dùng kho image kiểu containerd: build đè `:latest` là
  bản cũ mất hẳn (container vẫn chạy nó nhưng không tag lại được). Script giữ tag `:live`
  cho bản đang chạy; lúc thay thì bản đó thành `:previous` + `:backup-<giờ>` (giữ 3 bản).
- **App qua sablier báo lỗi 15-25 giây.** `up -d` đổi tên container cũ thành
  `<id>_<tên>` trước khi xoá; sablier nhớ cái tên tạm đó và trả `No such container` (kèm
  mã 200!) tới khi tự dò lại. Script xoá hẳn container cũ rồi mới tạo cái mới cùng tên:
  đo thật còn khoảng 1 request lỗi mỗi lần thay, thay vì 11-22.

Script kiểm tra app qua Caddy (đúng mã *và* đúng kiểu nội dung); hỏng thì tự lùi về bản
đang chạy trước đó và giữ bản hỏng ở tag `failed-<giờ>`. Dữ liệu không lùi theo — có
backup hằng đêm riêng (`scripts/backup-hubdata.sh`).

## Cấu trúc

- `docker-compose.yml` — toàn bộ services
- `config/homepage/` — config dashboard
- `scripts/` — deploy an toàn (`deploy.sh`), startup, backup dữ liệu, cài LaunchAgent
- `docs/` — runbook setup Mac Mini, design, plans

## Thêm app mới (mặc định tắt, tự bật khi có request, tự tắt sau 15 phút idle)

Chỉ Chat chạy 24/7. App mới theo pattern:

1. `docker-compose.yml`: thêm service với `profiles: [apps]`, labels
   `sablier.enable=true` + `sablier.group=<tên>`, `restart: unless-stopped`.
2. `config/caddy/Caddyfile`: thêm block — PHẢI bọc trong `handle`
   (route trần bị fallback nuốt, xem comment đầu file):

       @ten host ten.lazybutts.com
       handle @ten {
           route {
               sablier http://sablier:10000 {
                   group ten
                   session_duration 15m
                   dynamic
               }
               reverse_proxy ten-service:PORT
           }
       }

3. Cloudflare: thêm published application route `ten.lazybutts.com → http://caddy:80`,
   thêm hostname vào Access app `macmini-apps` (trừ khi muốn public).
4. Submodule + CI: `git submodule add <repo> apps/<ten>`, thêm vào matrix
   trong `.github/workflows/build-images.yml`.
5. Boot: `scripts/startup.sh` chỉ `create` (không start) profile apps —
   giữ nguyên, app mới tự offline sau reboot.
