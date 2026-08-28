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
- Cài: `brew install orbstack` (hoặc tải https://orbstack.dev).
- Mở OrbStack lần đầu → Settings → **Start at login** ON.
- Verify: `docker version` và `docker compose version` chạy được.

## 5. Clone hub repo
    cd ~ && git clone --recurse-submodules https://github.com/quyenanh198/macmini-hub.git
    cd macmini-hub && cp .env.example .env
- Điền `.env`: `CLOUDFLARE_TUNNEL_TOKEN` (bước 6), `DATA_ROOT=/Volumes/hubdata`.
- Submodule thêm dần khi từng app sẵn sàng: `git submodule add https://github.com/quyenanh198/<app>.git apps/<app>`
- Verify: `docker compose config -q` không lỗi.

## 6. Cloudflare Tunnel
- Zero Trust dashboard → Networks → Tunnels → Create tunnel → copy **token** vào `.env`.
- Khi chốt domain: thêm public hostname per subdomain, service trỏ `http://homepage:3000`, `http://tts-studio:8000`, `http://cadence2:3000`, `http://stock-site:8080`, `http://chat:8082`.
- Cloudflare Access: policy login cho mọi subdomain TRỪ chat (chat tự quản auth).
- Chốt domain xong, thay giá trị chờ:

      sed -i '' 's/EXAMPLE-DOMAIN/ten-domain-that/g; s/SET-LAN-IP/ip-lan-mac-mini/g' config/homepage/services.yaml

- Verify: `docker compose up -d` → tunnel status **HEALTHY** trên dashboard.

## 7. Auto-start
    ./scripts/install-launchagent.sh
    launchctl kickstart gui/$(id -u)/com.macmini-hub.startup
- Verify: `docker compose ps` mọi service Up; log tại `~/Library/Logs/macmini-hub-startup.log`.

## 8. Nghiệm thu cuối — cold reboot test
- Rút điện Mac Mini 10 giây, cắm lại. KHÔNG đụng bàn phím.
- Chờ 3 phút. Từ máy khác:
  - `ssh` vào được
  - `docker compose ps` → mọi service Up
  - Mở subdomain qua 4G (ngoài LAN) → load được
- Đạt cả 3 = xong setup host.
