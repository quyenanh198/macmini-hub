# Mac Mini Hub Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hub repo hoàn chỉnh để Mac Mini (Apple Silicon, OrbStack) pull image từ ghcr.io và chạy toàn bộ stack tự động sau reboot.

**Architecture:** Một repo `macmini-hub` chứa docker-compose (core: Homepage/Dozzle/cloudflared; apps: profile riêng), GitHub Actions build multi-arch image lên ghcr.io, launchd LaunchAgent khởi động stack sau auto-login, dữ liệu bền bind-mount ra ổ ngoài.

**Tech Stack:** Docker Compose v2 (OrbStack), gethomepage.dev, Dozzle, cloudflared (Cloudflare Tunnel token mode), GitHub Actions (buildx + QEMU), launchd, bash.

## Global Constraints

- Images build cho `linux/arm64` (thêm `linux/amd64` nếu tiện) — Mac Mini là Apple Silicon.
- Mọi dữ liệu bền nằm dưới `${DATA_ROOT}` (mặc định `/Volumes/hubdata`) — ổ ngoài.
- Mọi service: `restart: unless-stopped` + `mem_limit`.
- Whisper/Seed-VC gate bằng env `ENABLE_HEAVY_TTS` (mặc định `false`).
- Secrets chỉ trong `.env` (gitignored); repo chỉ chứa `.env.example`.
- Registry: `ghcr.io/quyenanh198/<app>`.
- Commit message tiếng Anh, prefix `feat:`/`docs:`/`chore:`.

---

### Task 1: Repo skeleton + .env.example

**Files:**
- Create: `.gitignore`, `.env.example`, `README.md`

**Interfaces:**
- Produces: biến env `DATA_ROOT`, `CLOUDFLARE_TUNNEL_TOKEN`, `ENABLE_HEAVY_TTS`, `TZ` — mọi task sau dùng đúng tên này.

- [ ] **Step 1: Tạo `.gitignore`**

```gitignore
.env
*.log
.DS_Store
```

- [ ] **Step 2: Tạo `.env.example`**

```bash
# Copy thành .env rồi điền giá trị thật. KHÔNG commit .env.
DATA_ROOT=/Volumes/hubdata
CLOUDFLARE_TUNNEL_TOKEN=paste-token-from-cloudflare-dashboard
ENABLE_HEAVY_TTS=false
TZ=America/Los_Angeles
```

- [ ] **Step 3: Tạo `README.md`**

```markdown
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
```

- [ ] **Step 4: Verify — 3 file tồn tại, `.env` được ignore**

Run: `git check-ignore .env && ls .gitignore .env.example README.md`
Expected: in ra `.env` + 3 tên file, exit 0

- [ ] **Step 5: Commit**

```bash
git add .gitignore .env.example README.md
git commit -m "feat: repo skeleton with env template"
```

---

### Task 2: Core docker-compose (Homepage + Dozzle + cloudflared)

**Files:**
- Create: `docker-compose.yml`

**Interfaces:**
- Consumes: env từ Task 1.
- Produces: network mặc định của compose project; service names `homepage`, `dozzle`, `cloudflared` — cloudflared ingress (config trên Cloudflare dashboard) trỏ tới `http://<service>:<port>` theo đúng tên này. Task 4 append services vào file này.

- [ ] **Step 1: Viết `docker-compose.yml`**

```yaml
name: macmini-hub

services:
  homepage:
    image: ghcr.io/gethomepage/homepage:latest  # pin version khi deploy thật chạy ổn
    restart: unless-stopped
    mem_limit: 512m
    environment:
      TZ: ${TZ}
      HOMEPAGE_ALLOWED_HOSTS: "*"
    volumes:
      - ./config/homepage:/app/config
      - /var/run/docker.sock:/var/run/docker.sock:ro
    ports:
      - "3000:3000"

  dozzle:
    image: amir20/dozzle:latest
    restart: unless-stopped
    mem_limit: 256m
    environment:
      TZ: ${TZ}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    ports:
      - "8081:8080"

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    mem_limit: 256m
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    environment:
      TZ: ${TZ}
```

- [ ] **Step 2: Verify cú pháp**

Run: `cp .env.example .env && docker compose config -q && echo OK`
Nếu máy chạy plan không có Docker: `python3 -c "import yaml;yaml.safe_load(open('docker-compose.yml'));print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
rm -f .env
git add docker-compose.yml
git commit -m "feat: core compose stack (homepage, dozzle, cloudflared)"
```

---

### Task 3: Homepage config

**Files:**
- Create: `config/homepage/settings.yaml`, `config/homepage/services.yaml`, `config/homepage/widgets.yaml`, `config/homepage/docker.yaml`, `config/homepage/bookmarks.yaml`

**Interfaces:**
- Consumes: service names từ Task 2 và Task 4 (`tts-studio`, `cadence2`, `stock-site`, `chat`).
- Produces: dashboard đọc trạng thái container qua docker socket.

- [ ] **Step 1: `settings.yaml`**

```yaml
title: Mac Mini Hub
theme: dark
headerStyle: clean
```

- [ ] **Step 2: `docker.yaml`**

```yaml
local:
  socket: /var/run/docker.sock
```

- [ ] **Step 3: `services.yaml`**

```yaml
- Apps:
    - TTS Studio:
        href: https://tts.EXAMPLE-DOMAIN/
        description: TTS / ASR / voice clone (+ AudioExtract)
        server: local
        container: macmini-hub-tts-studio-1
    - Cadence2:
        href: https://cadence.EXAMPLE-DOMAIN/
        description: Markdown TTS reader
        server: local
        container: macmini-hub-cadence2-1
    - Stock Site:
        href: https://stock.EXAMPLE-DOMAIN/
        description: Stock analysis reports
        server: local
        container: macmini-hub-stock-site-1
    - Chat:
        href: https://chat.EXAMPLE-DOMAIN/
        description: Family chat PWA
        server: local
        container: macmini-hub-chat-1

- Ops:
    - Dozzle:
        href: http://SET-LAN-IP:8081/
        description: Container logs
        server: local
        container: macmini-hub-dozzle-1
```

`EXAMPLE-DOMAIN` / `SET-LAN-IP`: domain chưa chốt (spec ghi rõ ngoài phạm vi) — runbook Task 7 bước 6 có lệnh sed thay khi chốt. Giá trị chờ có chủ đích, không phải placeholder bị quên.

- [ ] **Step 4: `widgets.yaml`**

```yaml
- resources:
    cpu: true
    memory: true
    disk: /
- datetime:
    format:
      timeStyle: short
      dateStyle: medium
```

- [ ] **Step 5: `bookmarks.yaml`**

```yaml
- Dev:
    - GitHub:
        - href: https://github.com/quyenanh198
```

- [ ] **Step 6: Verify — YAML parse cả 5 file**

Run: `python3 -c "import yaml,glob;[yaml.safe_load(open(f)) for f in glob.glob('config/homepage/*.yaml')];print('OK')"`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add config/homepage/
git commit -m "feat: homepage dashboard config"
```

---

### Task 4: App services (profile `apps`)

**Files:**
- Modify: `docker-compose.yml` (append sau service `cloudflared`)

**Interfaces:**
- Consumes: `DATA_ROOT`, `ENABLE_HEAVY_TTS` từ Task 1.
- Produces: services `tts-studio` (port nội bộ 8000), `cadence2` (3000), `stock-site` (8080), `chat` (8082) — cloudflared ingress + homepage services.yaml dùng các tên/port này. Bind mounts: `${DATA_ROOT}/tts-models`, `${DATA_ROOT}/tts-output`, `${DATA_ROOT}/stock-reports`, `${DATA_ROOT}/chat/db`, `${DATA_ROOT}/chat/media`.

- [ ] **Step 1: Append vào `docker-compose.yml`**

```yaml
  tts-studio:
    image: ghcr.io/quyenanh198/tts-studio:latest
    profiles: [apps]
    restart: unless-stopped
    mem_limit: 3g
    environment:
      TZ: ${TZ}
      ENABLE_HEAVY_TTS: ${ENABLE_HEAVY_TTS}
    volumes:
      - ${DATA_ROOT}/tts-models:/models
      - ${DATA_ROOT}/tts-output:/output

  cadence2:
    image: ghcr.io/quyenanh198/cadence2:latest
    profiles: [apps]
    restart: unless-stopped
    mem_limit: 512m
    environment:
      TZ: ${TZ}

  stock-site:
    image: ghcr.io/quyenanh198/stock-site:latest
    profiles: [apps]
    restart: unless-stopped
    mem_limit: 512m
    environment:
      TZ: ${TZ}
    volumes:
      - ${DATA_ROOT}/stock-reports:/site/reports

  chat:
    image: ghcr.io/quyenanh198/chat:latest
    profiles: [apps]
    restart: unless-stopped
    mem_limit: 768m
    environment:
      TZ: ${TZ}
    volumes:
      - ${DATA_ROOT}/chat/db:/data/db
      - ${DATA_ROOT}/chat/media:/data/media
```

Port container nội bộ do Dockerfile từng app quyết định (plan app riêng); cloudflared gọi qua network nội bộ nên không cần `ports:` publish.

- [ ] **Step 2: Verify — core không kéo apps, profile kéo đủ**

Run:
```bash
cp .env.example .env
docker compose config --services | sort
docker compose --profile apps config --services | sort
rm -f .env
```
Nếu không có Docker: `python3 -c "import yaml;d=yaml.safe_load(open('docker-compose.yml'));names=sorted(d['services']);assert names==['cadence2','chat','cloudflared','dozzle','homepage','stock-site','tts-studio'],names;print('OK')"`
Expected: lần 1 chỉ 3 service core; lần 2 đủ 7; hoặc `OK`

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: app services under apps profile with data mounts"
```

---

### Task 5: GitHub Actions — build multi-arch lên ghcr.io

**Files:**
- Create: `.github/workflows/build-images.yml`

**Interfaces:**
- Consumes: submodules `apps/tts-studio`, `apps/cadence2`, `apps/stock-site`, `apps/chat` (thêm bằng `git submodule add` khi từng app repo sẵn sàng — bước trong runbook Task 7).
- Produces: images `ghcr.io/quyenanh198/{tts-studio,cadence2,stock-site,chat}:latest` mà Task 4 pull.

- [ ] **Step 1: Viết workflow**

```yaml
name: build-images

on:
  push:
    branches: [main]
  workflow_dispatch: {}

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    strategy:
      fail-fast: false
      matrix:
        app: [tts-studio, cadence2, stock-site, chat]
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: Skip if app submodule absent
        id: guard
        run: |
          if [ -f "apps/${{ matrix.app }}/Dockerfile" ]; then
            echo "present=true" >> "$GITHUB_OUTPUT"
          else
            echo "present=false" >> "$GITHUB_OUTPUT"
          fi

      - uses: docker/setup-qemu-action@v3
        if: steps.guard.outputs.present == 'true'

      - uses: docker/setup-buildx-action@v3
        if: steps.guard.outputs.present == 'true'

      - uses: docker/login-action@v3
        if: steps.guard.outputs.present == 'true'
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        if: steps.guard.outputs.present == 'true'
        with:
          context: apps/${{ matrix.app }}
          platforms: linux/arm64,linux/amd64
          push: true
          tags: ghcr.io/quyenanh198/${{ matrix.app }}:latest
          cache-from: type=gha,scope=${{ matrix.app }}
          cache-to: type=gha,mode=max,scope=${{ matrix.app }}
```

Guard step cho phép merge workflow trước khi đủ 4 submodule — app chưa có thì job skip êm, không đỏ CI.

- [ ] **Step 2: Verify YAML**

Run: `python3 -c "import yaml;yaml.safe_load(open('.github/workflows/build-images.yml'));print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-images.yml
git commit -m "feat: multi-arch image build workflow to ghcr"
```

---

### Task 6: launchd auto-start + scripts

**Files:**
- Create: `scripts/startup.sh`, `scripts/com.macmini-hub.startup.plist.template`, `scripts/install-launchagent.sh`

**Interfaces:**
- Consumes: repo checkout tại `~/macmini-hub` trên Mac Mini (chuẩn hoá trong runbook Task 7).
- Produces: LaunchAgent `com.macmini-hub.startup` chạy `startup.sh` sau login.

- [ ] **Step 1: `scripts/startup.sh`**

```bash
#!/bin/bash
# Chờ Docker (OrbStack) sẵn sàng rồi kéo stack lên. Chạy bởi LaunchAgent sau auto-login.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$HOME/Library/Logs/macmini-hub-startup.log"
exec >>"$LOG" 2>&1
echo "=== $(date) startup ==="

for i in $(seq 1 60); do
  if docker info >/dev/null 2>&1; then
    break
  fi
  echo "waiting for docker ($i/60)..."
  sleep 5
done
docker info >/dev/null 2>&1 || { echo "docker not ready after 300s, abort"; exit 1; }

cd "$REPO_DIR"
docker compose --profile apps pull
docker compose --profile apps up -d
echo "=== $(date) done ==="
```

- [ ] **Step 2: `scripts/com.macmini-hub.startup.plist.template`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.macmini-hub.startup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>__REPO_DIR__/scripts/startup.sh</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:__HOME__/.orbstack/bin</string>
  </dict>
</dict>
</plist>
```

- [ ] **Step 3: `scripts/install-launchagent.sh`**

```bash
#!/bin/bash
# Cài LaunchAgent: thay path thật vào template, copy, load. Chạy trên Mac Mini.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_DST="$HOME/Library/LaunchAgents/com.macmini-hub.startup.plist"

mkdir -p "$HOME/Library/LaunchAgents"
sed -e "s|__REPO_DIR__|$REPO_DIR|g" -e "s|__HOME__|$HOME|g" \
  "$REPO_DIR/scripts/com.macmini-hub.startup.plist.template" > "$PLIST_DST"

plutil -lint "$PLIST_DST"
launchctl bootout "gui/$(id -u)" "$PLIST_DST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
echo "Installed. Test: launchctl kickstart gui/$(id -u)/com.macmini-hub.startup"
```

- [ ] **Step 4: Verify — shellcheck + plist parse**

Run:
```bash
shellcheck scripts/startup.sh scripts/install-launchagent.sh
python3 - <<'EOF'
import plistlib
raw = open('scripts/com.macmini-hub.startup.plist.template','rb').read()
raw = raw.replace(b'__REPO_DIR__', b'/tmp/x').replace(b'__HOME__', b'/tmp/h')
plistlib.loads(raw)
print('OK')
EOF
chmod +x scripts/*.sh
```
Expected: shellcheck im lặng, `OK`

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "feat: launchd auto-start scripts"
```

---

### Task 7: Runbook setup Mac Mini (thao tác tay)

**Files:**
- Create: `docs/runbook-host-setup.md`

**Interfaces:**
- Consumes: mọi thứ Task 1–6.
- Produces: checklist Ken tự làm trên máy thật; nghiệm thu cuối = cold reboot test.

- [ ] **Step 1: Viết `docs/runbook-host-setup.md`**

```markdown
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
```

- [ ] **Step 2: Verify — không placeholder sót**

Run: `grep -n "TBD" docs/runbook-host-setup.md || echo CLEAN`
Expected: `CLEAN`

- [ ] **Step 3: Commit**

```bash
git add docs/runbook-host-setup.md
git commit -m "docs: mac mini host setup runbook"
```
