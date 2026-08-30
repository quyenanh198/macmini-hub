# TTS Native GPU Node (Mac mini M4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chạy phần nặng của tts-studio (F5-TTS, Seed-VC, Whisper) trực tiếp trên macOS để dùng GPU M4 qua Metal/MPS — Docker VM không thấy GPU.

**Architecture:** tts-studio backend chạy native bằng launchd trên port 8600 (uv venv, PyTorch MPS). Caddy trong docker route `tts.lazybutts.com` → `host.docker.internal:8600` thay cho container. Container tts-studio bị gỡ khỏi profile apps (giữ image làm fallback). Sablier không quản native process — model lazy-load nên idle chỉ tốn RAM nhỏ.

**Tech Stack:** Python 3.12 (uv), PyTorch MPS (arm64), faster-whisper CPU int8, launchd, Caddy, OrbStack `host.docker.internal`.

## Global Constraints

- Phần cứng: Mac mini M4, 10 core, 32GB RAM (VM OrbStack chỉ thấy ~23GB — native thấy đủ 32GB).
- Data root native: `TTS_STUDIO_DATA=/Volumes/hubdata/TTSStudio` (model + output nằm trên hubdata, cùng ổ với stack).
- Port native: `8600`, bind `0.0.0.0` (caddy trong VM gọi qua gateway; LAN tin cậy), `TTS_STUDIO_ALLOWED_HOSTS=*`.
- Không đổi hành vi desktop/Windows: mọi nhánh MPS phải giữ nguyên default cũ khi không có MPS.
- Repo TTS-Studio: default branch `main`. Repo macmini-hub: `master`.

---

### Task 1: MPS device cho Seed-VC (clone.py)

**Files:**
- Modify: `backend/app/services/clone.py:51-56` (resolve_device), `torch_info` (thêm cờ mps)
- Test: `backend/tests/test_clone_device.py` (tạo mới)

**Interfaces:**
- Produces: `clone.resolve_device(pref) -> str` trả thêm `"mps"`; `clone.torch_info()["mps"] -> bool`. Task 2 và code F5 dùng đúng chuỗi `"mps"`.

- [ ] **Step 1: Viết test fail**

```python
# backend/tests/test_clone_device.py
from unittest.mock import patch
from app.services import clone


def _ti(cuda=False, mps=False):
    return {"installed": True, "cuda": cuda, "mps": mps, "version": "x"}


def test_auto_prefers_cuda_then_mps_then_cpu():
    with patch.object(clone, "torch_info", return_value=_ti(cuda=True, mps=True)):
        assert clone.resolve_device("auto") == "cuda"
    with patch.object(clone, "torch_info", return_value=_ti(mps=True)):
        assert clone.resolve_device("auto") == "mps"
    with patch.object(clone, "torch_info", return_value=_ti()):
        assert clone.resolve_device("auto") == "cpu"


def test_cpu_pref_wins_even_with_mps():
    with patch.object(clone, "torch_info", return_value=_ti(mps=True)):
        assert clone.resolve_device("cpu") == "cpu"
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `cd /Users/quyen/TTS-Studio && python -m pytest backend/tests/test_clone_device.py -v`
Expected: FAIL (`KeyError: 'mps'` hoặc assert `"mps" == "cpu"`)

- [ ] **Step 3: Implement**

Trong `torch_info()` thêm key `mps` (cạnh chỗ đang set `cuda`):

```python
info["mps"] = bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available())
```

Sửa `resolve_device`:

```python
def resolve_device(pref: str | None = None) -> str:
    pref = (pref or settings.get("vc_device", "auto") or "auto").lower()
    ti = torch_info()
    if pref == "cpu":
        return "cpu"
    if pref == "mps":
        return "mps" if ti.get("mps") else "cpu"
    if ti["cuda"]:
        return "cuda"
    if ti.get("mps"):
        return "mps"
    return "cpu"
```

- [ ] **Step 4: Test pass**

Run: `python -m pytest backend/tests/test_clone_device.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/quyen/TTS-Studio
git add backend/app/services/clone.py backend/tests/test_clone_device.py
git commit -m "feat(clone): mps device support in resolve_device"
```

---

### Task 2: MPS cho F5-TTS (f5.py)

**Files:**
- Modify: `backend/app/services/f5.py:144-166` (`_pin_dtype`)
- Test: `backend/tests/test_f5_device.py` (tạo mới)

**Interfaces:**
- Consumes: `clone.resolve_device()` (Task 1) — f5 đã gọi sẵn, tự nhận `"mps"`.
- Produces: F5 load được trên `"mps"` với dtype float32 (MPS fp16 không ổn định với F5).

- [ ] **Step 1: Test fail**

```python
# backend/tests/test_f5_device.py
from app.services import f5


def test_mps_pins_float32(monkeypatch):
    calls = {}

    class FakeTorch:
        class cuda:  # noqa: N801
            @staticmethod
            def get_device_properties(_d):
                raise AssertionError("must not query cuda props on mps")
        float16 = "fp16"
        float32 = "fp32"

    monkeypatch.setattr(f5, "_dtype_for", lambda device: f5._resolve_dtype(FakeTorch, device), raising=False)
    assert f5._resolve_dtype(FakeTorch, "mps") == "fp32"
    assert f5._resolve_dtype(FakeTorch, "cpu") == "fp32"
```

- [ ] **Step 2: Fail**

Run: `python -m pytest backend/tests/test_f5_device.py -v`
Expected: FAIL (`AttributeError: _resolve_dtype`)

- [ ] **Step 3: Implement**

Tách logic dtype trong `_pin_dtype` ra hàm thuần để test được, và nhánh mps:

```python
def _resolve_dtype(torch_mod, device: str):
    # cuda đời Ampere+ mới đáng fp16; mps/cpu luôn float32 (fp16 trên MPS
    # cho ra nhiễu với F5 checkpoint hiện tại).
    if "cuda" in device and torch_mod.cuda.get_device_properties(device).major >= 8:
        return torch_mod.float16
    return torch_mod.float32
```

`_pin_dtype` gọi `_resolve_dtype(torch, device)` thay cho if cũ.

- [ ] **Step 4: Pass**

Run: `python -m pytest backend/tests/test_f5_device.py backend/tests/test_clone_device.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/f5.py backend/tests/test_f5_device.py
git commit -m "feat(f5): float32 dtype path for mps device"
git push origin main
```

---

### Task 3: Script setup native runtime (macmini-hub)

**Files:**
- Create: `scripts/setup-tts-native.sh` (macmini-hub repo)

**Interfaces:**
- Produces: venv tại `/Users/quyen/TTS-Studio/.venv-native`, chạy được `uvicorn app.main:app` với MPS. Task 4 trỏ launchd vào venv này.

- [ ] **Step 1: Viết script**

```bash
#!/bin/bash
# Tạo venv native cho tts-studio trên macOS (M4). Chạy lại được, idempotent.
set -euo pipefail

TTS_REPO="${TTS_REPO:-$HOME/TTS-Studio}"
VENV="$TTS_REPO/.venv-native"
DATA="${TTS_STUDIO_DATA:-/Volumes/hubdata/TTSStudio}"

command -v uv >/dev/null || { echo "cần uv: brew install uv"; exit 1; }
[ -d "$TTS_REPO" ] || git clone https://github.com/quyenanh198/TTS-Studio.git "$TTS_REPO"
git -C "$TTS_REPO" pull --ff-only

uv venv --python 3.12 "$VENV"
# torch bản macOS arm64 có sẵn MPS; các dep còn lại theo requirements.txt
uv pip install --python "$VENV/bin/python" torch torchaudio
uv pip install --python "$VENV/bin/python" -r "$TTS_REPO/requirements.txt"

mkdir -p "$DATA"
echo "OK. Test: TTS_STUDIO_DATA=$DATA $VENV/bin/python -c 'import torch; print(torch.backends.mps.is_available())'"
```

- [ ] **Step 2: Chạy + verify MPS**

Run: `bash scripts/setup-tts-native.sh` rồi lệnh test in ra ở cuối.
Expected: `True`

- [ ] **Step 3: Smoke run server**

Run:
```bash
TTS_STUDIO_DATA=/Volumes/hubdata/TTSStudio TTS_STUDIO_ALLOWED_HOSTS='*' \
  /Users/quyen/TTS-Studio/.venv-native/bin/uvicorn app.main:app \
  --app-dir /Users/quyen/TTS-Studio/backend --host 0.0.0.0 --port 8600 &
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8600/   # expect 200
kill %1
```

- [ ] **Step 4: Commit**

```bash
cd /Users/quyen/macmini-hub
git add scripts/setup-tts-native.sh && chmod +x scripts/setup-tts-native.sh
git commit -m "feat(scripts): native tts-studio venv setup for M4"
```

---

### Task 4: launchd service cho native tts

**Files:**
- Create: `scripts/com.lazybutts.tts-native.plist.template`, `scripts/install-tts-native.sh` (macmini-hub)

**Interfaces:**
- Consumes: venv Task 3.
- Produces: service `com.lazybutts.tts-native` chạy port 8600, tự khởi động sau login, log tại `~/Library/Logs/tts-native.log`. Task 5 route caddy tới đây.

- [ ] **Step 1: Template plist**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.lazybutts.tts-native</string>
  <key>ProgramArguments</key><array>
    <string>__VENV__/bin/uvicorn</string>
    <string>app.main:app</string>
    <string>--app-dir</string><string>__REPO__/backend</string>
    <string>--host</string><string>0.0.0.0</string>
    <string>--port</string><string>8600</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>TTS_STUDIO_DATA</key><string>/Volumes/hubdata/TTSStudio</string>
    <key>TTS_STUDIO_ALLOWED_HOSTS</key><string>*</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>__HOME__/Library/Logs/tts-native.log</string>
  <key>StandardErrorPath</key><string>__HOME__/Library/Logs/tts-native.log</string>
</dict></plist>
```

- [ ] **Step 2: Install script** (same pattern `install-launchagent.sh`: sed `__VENV__`/`__REPO__`/`__HOME__`, `plutil -lint`, `launchctl bootstrap gui/$(id -u)`)

```bash
#!/bin/bash
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TTS_REPO="${TTS_REPO:-$HOME/TTS-Studio}"
PLIST_DST="$HOME/Library/LaunchAgents/com.lazybutts.tts-native.plist"
sed -e "s|__VENV__|$TTS_REPO/.venv-native|g" -e "s|__REPO__|$TTS_REPO|g" -e "s|__HOME__|$HOME|g" \
  "$REPO_DIR/scripts/com.lazybutts.tts-native.plist.template" > "$PLIST_DST"
plutil -lint "$PLIST_DST"
launchctl bootout "gui/$(id -u)" "$PLIST_DST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
echo "Installed. curl http://localhost:8600/ để kiểm tra."
```

- [ ] **Step 3: Install + verify**

Run: `bash scripts/install-tts-native.sh && sleep 3 && curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8600/`
Expected: `200`

- [ ] **Step 4: Commit**

```bash
git add scripts/com.lazybutts.tts-native.plist.template scripts/install-tts-native.sh
git commit -m "feat(scripts): launchd service for native tts on :8600"
```

---

### Task 5: Route caddy sang native, gỡ container tts khỏi apps

**Files:**
- Modify: `config/caddy/Caddyfile` (block `@tts`), `docker-compose.yml` (service tts-studio), `hub-ui/config.json` (entry TTS Studio)

**Interfaces:**
- Consumes: native service :8600 (Task 4).
- Produces: `https://tts.lazybutts.com` chạy native. hub-ui hiển thị TTS qua URL health thay vì container.

- [ ] **Step 1: Caddyfile** — thay block `@tts` (bỏ sablier, native không sleep):

```caddyfile
	@tts host tts.lazybutts.com
	handle @tts {
		reverse_proxy host.docker.internal:8600
	}
```

- [ ] **Step 2: docker-compose.yml** — chuyển `tts-studio` sang profile riêng để không lên theo `--profile apps`:

```yaml
    profiles: [fallback]   # native M4 là chính; container chỉ dùng khi cần fallback CPU
```

- [ ] **Step 3: hub-ui/config.json** — entry TTS Studio: xoá key `container`, thêm `"health": "http://host.docker.internal:8600/"` (hub-ui Task 6 đọc key này).

- [ ] **Step 4: Apply + verify**

```bash
cd ~/macmini-hub && docker compose restart caddy
docker run --rm --network macmini-hub_default curlimages/curl -s -H 'Host: tts.lazybutts.com' -o /dev/null -w '%{http_code}\n' http://caddy:80/   # expect 200
```

- [ ] **Step 5: Commit**

```bash
git add config/caddy/Caddyfile docker-compose.yml hub-ui/config.json
git commit -m "feat: route tts host to native M4 service"
```

---

### Task 6: hub-ui health-URL cho service không phải container

**Files:**
- Modify: `hub-ui/server.js` (containerInfo), `hub-ui/public/app.js` (serviceCard)

**Interfaces:**
- Consumes: config entry dạng `{ "health": "http://..." }` (Task 5).
- Produces: `/api/containers` trả thêm key theo `svc.name` với `{state: "running"|"exited"}` từ HTTP check; card không có `container` thì không hiện nút Restart.

- [ ] **Step 1: server.js** — trong `containerInfo()`, sau vòng container, thêm:

```javascript
  await Promise.all(
    [...CONFIG.apps, ...CONFIG.ops]
      .filter((s) => !s.container && s.health)
      .map(async (s) => {
        try {
          const ctl = new AbortController();
          const t = setTimeout(() => ctl.abort(), 3000);
          const r = await fetch(s.health, { signal: ctl.signal });
          clearTimeout(t);
          out[s.name] = { state: r.ok ? 'running' : 'exited' };
        } catch {
          out[s.name] = { state: 'exited' };
        }
      }),
  );
```

- [ ] **Step 2: app.js** — `renderServices` lookup đổi `containers[s.container]` thành `containers[s.container || s.name]` (3 chỗ: filter, serviceCard call, coreOk/hero). `serviceCard` đã tự ẩn nút khi thiếu `svc.container`.

- [ ] **Step 3: Rebuild + verify**

```bash
docker compose up -d --build hub-ui
curl -s http://localhost:3000/api/containers | grep -o '"TTS Studio":{"state":"running"}'
```

- [ ] **Step 4: Commit**

```bash
git add hub-ui && git commit -m "feat(hub-ui): url health checks for non-container services"
git push origin master
```

---

### Task 7: Benchmark + nghiệm thu

**Files:** không đổi code — ghi kết quả vào cuối file plan này.

- [ ] **Step 1: Whisper CPU int8 trên M4** — transcribe 1 file 5 phút, model `small` và `medium`, ghi RTF (kỳ vọng small ≥ 5x realtime, medium ≥ 2x).
- [ ] **Step 2: F5-TTS MPS vs CPU** — synth 1 câu ~15s audio, so thời gian (kỳ vọng MPS nhanh ≥ 2x CPU).
- [ ] **Step 3: Kiểm tra RAM native khi idle** (`ps aux | grep uvicorn`) — kỳ vọng < 500MB khi model chưa load.
- [ ] **Step 4: Reboot nguội** — sau reboot: launchd kéo tts-native, LaunchAgent kéo stack, `https://tts.lazybutts.com` sống không thao tác tay.
- [ ] **Step 5: Rollback drill** — đổi lại Caddyfile block cũ + `docker compose --profile fallback up -d tts-studio` → container phục vụ lại. Ghi chú thời gian thao tác.

## Kết quả nghiệm thu (Task 7)

Chạy 2026-08-30 trên Mac mini M4 (10-core 4P+6E), venv `.venv-native` (Python 3.12.14, torch 2.13.0, ctranslate2 4.8.1). Danh sách benchmark do controller AMEND lại (khác 5 step gốc ở trên) — chi tiết đầy đủ: `.superpowers/sdd/2026-08-30-tts-native-gpu-node/task-7-report.md`.

| # | Benchmark | Đo được | Target | Đạt? |
|---|---|---|---|---|
| 1 | Whisper CPU int8 RTF — `small` (beam=5 mặc định) | 1.91x (43.4s audio / 22.7s) | ≥5x | ❌ |
| 1 | Whisper CPU int8 RTF — `small` (beam=1, phụ) | 3.54x | ≥5x | ❌ (gần hơn) |
| 1 | Whisper CPU int8 RTF — `medium` (beam=5 mặc định) | 1.05x | ≥2x | ❌ |
| 1 | Whisper CPU int8 RTF — `medium` (beam=1, phụ) | 1.60x | ≥2x | ❌ (gần hơn) |
| 2 | MPS vs CPU — matmul 2048×2048 ×50 | CPU 0.618s / MPS 0.267s → **2.31x** | ≥2x | ✅ |
| 2 | MPS vs CPU — conv2d batch32 ×30 | CPU 5.795s / MPS 0.525s → **11.04x** | ≥2x | ✅ |
| 3 | Idle RAM (uvicorn :8600, RSS) | 57.2 MB | <500MB | ✅ |
| 4 | Service health | curl `/` → 200 (3.6ms); `launchctl` state=running | 200 / running | ✅ |
| 5 | Rollback drill (thực hiện + revert) | **59s tổng** (25s lên fallback, 34s revert); Caddyfile byte-identical sau khi xong (sha256 khớp), `git diff` sạch | thao tác đúng + khôi phục sạch | ✅ |
| 6 | Reboot readiness (không reboot thật) | `tts-native` RunAtLoad=1; `com.macmini-hub.startup` RunAtLoad=1; OrbStack `start_at_login=true` | cả 3 phải bật | ⚠️ chờ user test reboot thật |

**Concerns:**
- Whisper RTF không đạt target ở cả hai model, kể cả beam_size=1 (greedy). Nhiều khả năng do ctranslate2 CPU backend trên Apple Silicon (NEON) chưa tối ưu bằng x86 (AVX2/oneDNN) — target ≥5x/≥2x có lẽ dựa trên benchmark x86. Không phải lỗi cấu hình. Đề xuất: chấp nhận RTF hiện tại, hoặc thử lại `cpu_threads=4` (chỉ P-core), hoặc khảo sát runtime whisper chạy được trên MPS (vd. mlx-whisper) nếu cần real-time captioning thật.
- Container fallback chạy với `ENABLE_HEAVY_TTS=false` trong `.env` — rollback drill xác nhận routing/orchestration đúng và nhanh, nhưng chưa gửi request synthesis thật nên chưa xác nhận fallback CPU phục vụ được TTS nặng thực sự khi cần.
- Reboot nguội chưa test thật (theo đúng chỉ thị không reboot) — cấu hình tĩnh đều đúng, cần user tự reboot một lần để xác nhận end-to-end.
