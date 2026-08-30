#!/bin/bash
# Tạo venv native cho tts-studio trên macOS (M4). Chạy lại được, idempotent.
set -euo pipefail

TTS_REPO="${TTS_REPO:-$HOME/TTS-Studio}"
VENV="$TTS_REPO/.venv-native"
DATA="${TTS_STUDIO_DATA:-/Volumes/hubdata/TTSStudio}"

export PATH="$HOME/.local/bin:$PATH"
command -v uv >/dev/null || { echo "cần uv: curl -LsSf https://astral.sh/uv/install.sh | sh"; exit 1; }
[ -d "$TTS_REPO" ] || git clone https://github.com/quyenanh198/TTS-Studio.git "$TTS_REPO"
git -C "$TTS_REPO" pull --ff-only

uv venv --python 3.12 --clear "$VENV"
# torch bản macOS arm64 có sẵn MPS; các dep còn lại theo requirements.txt
uv pip install --python "$VENV/bin/python" torch torchaudio
uv pip install --python "$VENV/bin/python" -r "$TTS_REPO/requirements.txt"
# container lấy ffmpeg qua apt; native không có apt nên dùng binary đóng gói sẵn của imageio-ffmpeg (fallback trong ffmpeg.py)
uv pip install --python "$VENV/bin/python" imageio-ffmpeg

# Build SPA once (native uvicorn serves frontend/dist); host has no node — use docker.
if [ ! -f "$TTS_REPO/frontend/dist/index.html" ]; then
  docker run --rm -v "$TTS_REPO/frontend":/f -w /f node:22-slim sh -c 'npm ci && npm run build'
fi

mkdir -p "$DATA"
echo "OK. Test: TTS_STUDIO_DATA=$DATA $VENV/bin/python -c 'import torch; print(torch.backends.mps.is_available())'"
