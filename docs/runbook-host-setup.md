# Runbook: Setup Mac Mini làm server hub

Mỗi bước có lệnh verify. Làm tuần tự.

## 1. macOS căn bản
- System Settings → Users & Groups → bật **auto-login** cho user chính.
- System Settings → Energy → **Prevent automatic sleeping** ON; **Start up automatically after a power failure** ON.
- System Settings → General → Sharing → **Remote Login (SSH)** ON.
- Verify: từ máy khác `ssh <user>@<mac-mini-ip>` vào được; `pmset -g | grep sleep` thấy sleep 0.

## 2. Tailscale (khuyến nghị)
- Cài: https://tailscale.com/download/mac → đăng nhập.
- SSH qua IP tailscale, không mở port ra internet.
- Verify: `tailscale ip` có IP 100.x; ssh qua IP đó được.

## 3. Ổ ngoài
- Gắn ổ, Disk Utility → Erase → **APFS**, tên `hubdata`.
- Spotlight: System Settings → Siri & Spotlight → Privacy → thêm ổ (đỡ IO thừa).
- Tạo thư mục dữ liệu:

      mkdir -p /Volumes/hubdata/tts-models /Volumes/hubdata/tts-output /Volumes/hubdata/stock-reports /Volumes/hubdata/chat/db /Volumes/hubdata/chat/media

- Verify: `ls /Volumes/hubdata` thấy 4 mục.

## 4. OrbStack
- Cài: `brew install --cask orbstack` (hoặc tải https://orbstack.dev).
- Mở OrbStack lần đầu → Settings → **Start at login** ON.
- Verify: `docker version` và `docker compose version` chạy được.

## 5. Clone hub repo
    cd ~ && git clone --recurse-submodules https://github.com/quyenanh198/macmini-hub.git
    cd macmini-hub && cp .env.example .env
- Điền `.env`: `CLOUDFLARE_TUNNEL_TOKEN` (bước 6), `DATA_ROOT=/Volumes/hubdata`, `TZ` (timezone của operator, ví dụ `Asia/Ho_Chi_Minh` nếu ở VN).
- TTS Studio chạy chính trên node native (launchd, Mac mini M4, port 8600) — container `tts-studio` (`profiles: [fallback]`) chỉ là dự phòng, chỉ phục vụ edge-tts nhẹ vì image không đóng gói sẵn Whisper/Seed-VC (deps nặng). Không có biến bật/tắt nào cho tầng nặng ở container fallback.
- Submodule thêm dần khi từng app sẵn sàng: `git submodule add https://github.com/quyenanh198/<app>.git apps/<app>`
- Verify: `docker compose config -q` không lỗi.

## 6. Cloudflare Tunnel
- Zero Trust dashboard → Networks → Tunnels → Create tunnel → copy **token** vào `.env`.
- Khi chốt domain: thêm public hostname per subdomain. Dashboard `homepage` trỏ `http://homepage:3000` như cũ. Bốn subdomain app (`tts`, `cadence`, `stock`, `chat`) đều trỏ **cùng một service** `http://caddy:80` — Caddy tự route tiếp theo Host header vào đúng app (xem `config/caddy/Caddyfile`), không khai riêng port từng app nữa.
- Cloudflare Access: subdomain `chat` = **Bypass** (app tự quản auth + invite code). Ba subdomain còn lại (`tts`, `cadence`, `stock`) mỗi cái một policy riêng kiểu **email allowlist** — mặc định chỉ có email của Ken; muốn cho ai dùng app nào thì thêm email người đó vào policy của đúng subdomain đó.
- Chốt domain xong, thay giá trị chờ (lệnh sed giờ chạy trên cả Caddyfile lẫn homepage config):

      sed -i '' 's/EXAMPLE-DOMAIN/ten-domain-that/g' config/caddy/Caddyfile config/homepage/services.yaml
      sed -i '' 's/SET-LAN-IP/ip-lan-mac-mini/g' config/homepage/services.yaml

- Ghi chú on-demand: `tts`, `cadence`, `stock` mặc định ở trạng thái stopped, Sablier tự start container khi có request đầu tiên — lần đầu mở subdomain sẽ thấy **trang chờ** vài giây (`tts` có thể lâu hơn vì container nặng), rồi tự chuyển vào app. Idle 15 phút không có request thì container tự dừng lại để tiết kiệm RAM. `chat` không qua Sablier, luôn chạy 24/7.
- Verify: `docker compose up -d` → tunnel status **HEALTHY** trên dashboard.

## 7. Auto-start
    ./scripts/install-launchagent.sh
    launchctl kickstart gui/$(id -u)/com.macmini-hub.startup
- Verify: `docker compose ps` mọi service Up; log tại `~/Library/Logs/macmini-hub-startup.log`.
- Lưu ý: script khởi động không tự `pull` image apps (tránh boot fail khi image chưa tồn tại). Khi cần cập nhật image apps, chạy tay lúc bảo trì: `docker compose --profile apps pull && docker compose --profile apps up -d`.

## 8. Nghiệm thu cuối — cold reboot test
- Rút điện Mac Mini 10 giây, cắm lại. KHÔNG đụng bàn phím.
- Chờ 3 phút. Từ máy khác:
  - `ssh` vào được
  - `docker compose ps` → mọi service Up
  - Mở subdomain qua 4G (ngoài LAN) → load được
- Kiểm tra arch chạy đúng native, không qua emulation: `docker image inspect ghcr.io/gethomepage/homepage:latest --format '{{.Architecture}}'` phải ra `arm64`.
- Đạt cả 4 = xong setup host.

> Lưu ý native: sau khi bấm "Cài đặt" engine (Seed-VC/F5/GPU wheels) trong app, restart service để nạp module mới:
> `launchctl kickstart -k gui/$(id -u)/com.lazybutts.tts-native`
