# On-Demand Apps Implementation Plan (Sablier + Caddy)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Chat chạy 24/7; tts-studio/cadence2/stock-site mặc định tắt, tự start khi có request qua subdomain (sablier), idle 15 phút tự stop. User thường chỉ truy cập được app được chỉ định qua Cloudflare Access allowlist.

**Architecture:** cloudflared trỏ mọi subdomain về caddy:80; Caddy (custom build kèm sablier-caddy-plugin) route theo Host — chat đi thẳng, 3 app kia qua sablier middleware (dynamic strategy). Sablier server điều khiển docker qua socket, nhận diện container bằng labels sablier.enable/sablier.group.

**Tech Stack:** Caddy 2.10.2 + sablier-caddy-plugin v1.0.2 (xcaddy build trong CI), sablierapp/sablier.

## Global Constraints

- Mọi service mới: `restart: unless-stopped` + `mem_limit`. Commit tiếng Anh, prefix feat:/docs:/fix:.
- `EXAMPLE-DOMAIN` giữ verbatim (sed khi chốt domain — cả Caddyfile lẫn homepage config).
- Verify không cần Docker daemon: python3 yaml parse + assert, shellcheck.

---

### Task 1: Compose + Caddyfile + caddy image + CI

**Files:**
- Create: `caddy/Dockerfile`, `config/caddy/Caddyfile`
- Modify: `docker-compose.yml`, `.github/workflows/build-images.yml`

**Interfaces:**
- Produces: services `caddy` (port nội bộ 80), `sablier` (10000); sablier groups `tts`, `cadence`, `stock`; image `ghcr.io/quyenanh198/caddy-sablier:latest`. Task 2 runbook trỏ cloudflared vào `http://caddy:80`.

- [ ] **Step 1: `caddy/Dockerfile`**

```dockerfile
FROM caddy:2.10.2-builder AS builder

RUN xcaddy build \
    --with github.com/sablierapp/sablier-caddy-plugin@v1.0.2

FROM caddy:2.10.2

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

- [ ] **Step 2: `config/caddy/Caddyfile`**

```
{
	admin off
}

:80 {
	@chat host chat.EXAMPLE-DOMAIN
	handle @chat {
		reverse_proxy chat:8082
	}

	@tts host tts.EXAMPLE-DOMAIN
	route @tts {
		sablier http://sablier:10000 {
			group tts
			session_duration 15m
			dynamic
		}
		reverse_proxy tts-studio:8000
	}

	@cadence host cadence.EXAMPLE-DOMAIN
	route @cadence {
		sablier http://sablier:10000 {
			group cadence
			session_duration 15m
			dynamic
		}
		reverse_proxy cadence2:3000
	}

	@stock host stock.EXAMPLE-DOMAIN
	route @stock {
		sablier http://sablier:10000 {
			group stock
			session_duration 15m
			dynamic
		}
		reverse_proxy stock-site:8080
	}

	handle {
		respond "macmini-hub proxy" 200
	}
}
```

- [ ] **Step 3: Sửa `docker-compose.yml`**

3a. Service `chat`: xóa dòng `profiles: [apps]` (chat thành core, chạy 24/7). Giữ nguyên phần còn lại.

3b. Thêm labels cho 3 app on-demand (thêm key `labels:` vào từng service):

```yaml
  # tts-studio:
    labels:
      - sablier.enable=true
      - sablier.group=tts
  # cadence2:
    labels:
      - sablier.enable=true
      - sablier.group=cadence
  # stock-site:
    labels:
      - sablier.enable=true
      - sablier.group=stock
```

3c. Thêm 2 service core sau `cloudflared`:

```yaml
  caddy:
    image: ghcr.io/quyenanh198/caddy-sablier:latest
    restart: unless-stopped
    mem_limit: 256m
    environment:
      TZ: ${TZ}
    volumes:
      - ./config/caddy/Caddyfile:/etc/caddy/Caddyfile:ro

  sablier:
    image: sablierapp/sablier:latest  # pin version khi deploy thật chạy ổn
    restart: unless-stopped
    mem_limit: 256m
    command: start --provider.name=docker
    environment:
      TZ: ${TZ}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

- [ ] **Step 4: Thêm job `build-caddy` vào `.github/workflows/build-images.yml`** (job mới song song job `build`, không guard — Dockerfile nằm sẵn trong repo):

```yaml
  build-caddy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-qemu-action@v3

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        with:
          context: caddy
          platforms: linux/arm64
          push: true
          tags: ghcr.io/quyenanh198/caddy-sablier:latest
          cache-from: type=gha,scope=caddy
          cache-to: type=gha,mode=max,scope=caddy
```

- [ ] **Step 5: Verify**

Run:
```bash
python3 -c "
import yaml
d=yaml.safe_load(open('docker-compose.yml'))
s=d['services']
core=sorted(n for n,v in s.items() if 'profiles' not in v)
apps=sorted(n for n,v in s.items() if v.get('profiles')==['apps'])
assert core==['caddy','chat','cloudflared','dozzle','homepage','sablier'],core
assert apps==['cadence2','stock-site','tts-studio'],apps
for n in apps:
    assert 'sablier.enable=true' in s[n]['labels'], n
w=yaml.safe_load(open('.github/workflows/build-images.yml'))
assert 'build-caddy' in w['jobs']
print('OK')"
```
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add caddy/ config/caddy/ docker-compose.yml .github/workflows/build-images.yml
git commit -m "feat: on-demand app start via sablier behind caddy, chat always-on"
```

---

### Task 2: startup.sh + runbook + design amendment

**Files:**
- Modify: `scripts/startup.sh`, `docs/runbook-host-setup.md`, `docs/superpowers/specs/2026-08-28-macmini-hub-design.md`

**Interfaces:**
- Consumes: services/groups từ Task 1.

- [ ] **Step 1: `scripts/startup.sh`** — thay 2 dòng compose cuối:

Từ:
```bash
docker compose up -d
docker compose --profile apps up -d || echo "apps profile failed (images may not exist yet), core is up"
```
Thành:
```bash
docker compose up -d
docker compose --profile apps create || echo "apps create failed (images may not exist yet), core is up"
```
(App on-demand chỉ được TẠO sẵn ở trạng thái stopped; sablier start khi có request.)

- [ ] **Step 2: `docs/runbook-host-setup.md`** — sửa mục 6 (Cloudflare Tunnel):
  - Public hostname: TẤT CẢ subdomain app (tts, cadence, stock, chat) trỏ cùng một service `http://caddy:80` (Caddy route theo Host). Dashboard homepage trỏ `http://homepage:3000` như cũ.
  - Cloudflare Access: chat = bypass; các subdomain khác = policy **email allowlist** — muốn cho user nào dùng app nào, thêm email họ vào policy subdomain đó (mặc định chỉ email của Ken).
  - Lệnh sed thay domain: thêm file `config/caddy/Caddyfile`:

        sed -i '' 's/EXAMPLE-DOMAIN/ten-domain-that/g' config/caddy/Caddyfile config/homepage/services.yaml

  - Thêm ghi chú: 3 app on-demand lần đầu mở sẽ hiện trang chờ vài giây (tts có thể lâu hơn), idle 15 phút tự tắt tiết kiệm RAM; chat luôn chạy.
  - Giữ văn phong tiếng Việt hiện có.

- [ ] **Step 3: `docs/superpowers/specs/2026-08-28-macmini-hub-design.md`** — thêm cuối file:

```markdown
## Bổ sung 2026-08-28: on-demand apps

- Chat chạy 24/7 (core). tts-studio/cadence2/stock-site mặc định tắt, sablier + Caddy tự start khi có request, idle 15 phút tự stop.
- cloudflared trỏ mọi subdomain app về caddy:80; Caddy custom build (sablier-caddy-plugin) route theo Host.
- Phân quyền user: Cloudflare Access email allowlist per subdomain; chat bypass (app tự auth).
```

- [ ] **Step 4: Verify**

Run: `shellcheck scripts/startup.sh && grep -q "caddy:80" docs/runbook-host-setup.md && grep -q "profile apps create" scripts/startup.sh && grep -q "on-demand" docs/superpowers/specs/2026-08-28-macmini-hub-design.md && echo OK`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add scripts/startup.sh docs/runbook-host-setup.md docs/superpowers/specs/2026-08-28-macmini-hub-design.md
git commit -m "docs: on-demand routing, per-user access, boot creates stopped apps"
```
