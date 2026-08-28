# Mac Mini Hub — Design (chuyển host từ QNAP sang Mac Mini)

Ngày: 2026-08-28
Trạng thái: Đã duyệt

## Bối cảnh

Dự án "app tích hợp" gom các repo của Ken (quyenanh198) thành một stack docker-compose có dashboard, trước đây thiết kế cho QNAP Container Station. Quyết định mới: Mac Mini thay thế hoàn toàn QNAP cho dự án này.

Kiến trúc app đã duyệt trước đó giữ nguyên, chỉ đổi host layer.

## Phần cứng & hệ điều hành

- Mac Mini Apple Silicon (M-series), RAM 8–16 GB, chạy macOS.
- Chạy headless: không màn hình, quản trị qua SSH (Remote Login bật).
- Auto-login bật (OrbStack là app menu-bar, cần GUI session để chạy nền).
- Tắt sleep hoàn toàn; bật "Start up automatically after a power failure".
- Khuyến nghị: Tailscale để SSH qua VPN riêng, không mở port SSH ra internet.

## Docker runtime

- OrbStack (đã chọn): nhẹ, native Apple Silicon, CLI `docker` / `docker compose` tương thích 100% Docker chuẩn. Compose file không cần sửa cho runtime.
- Lưu ý kiến trúc: images phải có bản **arm64** (QNAP cũ là x86_64). GitHub Actions build multi-arch (`linux/amd64,linux/arm64`) hoặc tối thiểu arm64, đẩy lên ghcr.io.

## Lưu trữ

- Ổ cứng ngoài gắn cố định, format APFS, mount tại `/Volumes/<tên>`.
- Toàn bộ dữ liệu bền (DB, model Whisper/Seed-VC, media chat app, volume Docker) đặt trên ổ ngoài qua bind mount.
- Ổ trong Mac chỉ chứa OS + cache image.

## App stack (giữ nguyên plan đã duyệt)

- Hub repo + git submodules; GitHub Actions build image → ghcr.io; Mac Mini chỉ `docker compose pull && docker compose up -d`.
- Services: TTS-Studio (kèm router AudioExtract, ffmpeg), Cadence2, site github.io (cron sinh report nội bộ, không push), Homepage + Dozzle dashboard, cloudflared.
- Chat app (PWA kiểu Snapchat): Node Fastify + WebSocket + SQLite backend, React + Vite PWA frontend; media trên đĩa, tự xóa sau khi xem/hết hạn.
- Monee giữ Supabase cloud, không self-host.
- Truy cập: Cloudflare Tunnel + Cloudflare Access per-subdomain; subdomain chat bypass Access (app tự quản auth + invite code). Domain chưa chốt.
- Whisper/Seed-VC (CPU) gate bằng env var, bật theo RAM thực tế.
- Mem limit cho từng service trong compose.

## Tự khởi động & độ bền

- OrbStack: bật start-at-login.
- launchd LaunchAgent (chạy sau auto-login) chờ Docker sẵn sàng rồi `docker compose up -d`.
- Mỗi service `restart: unless-stopped`.
- Chuỗi phục hồi mất điện: máy tự bật → auto-login → OrbStack start → LaunchAgent kéo stack lên. Không cần thao tác tay.

## Kiểm chứng thành công

- `docker compose ps` mọi service Up (healthy với service có healthcheck) sau reboot nguội (rút điện cắm lại).
- Truy cập được các subdomain qua Cloudflare Tunnel từ ngoài mạng.
- Dữ liệu volume nằm trên ổ ngoài (kiểm tra path), ổ trong không phình.
- Image chạy đúng arm64 (không qua emulation).

## Ngoài phạm vi

- Viết code từng app (đã/sẽ có plan riêng theo workflow multi-agent).
- Chọn domain.
- Migration dữ liệu từ QNAP (stack chưa từng deploy thật trên QNAP — không có gì để migrate; nếu có dữ liệu thử nghiệm, copy tay một lần).
