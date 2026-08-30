# macmini-hub

Stack tích hợp chạy trên Mac Mini (Apple Silicon + OrbStack).

## Chạy

    cp .env.example .env   # điền token
    docker compose up -d                    # core: dashboard + logs + tunnel
    docker compose --profile apps up -d     # kèm apps

## Cấu trúc

- `docker-compose.yml` — toàn bộ services
- `config/homepage/` — config dashboard
- `scripts/` — startup + cài LaunchAgent
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
