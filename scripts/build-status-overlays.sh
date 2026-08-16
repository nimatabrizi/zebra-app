#!/usr/bin/env bash
# Ham .mov animasyonlarını (alpha koruyarak) web overlay’lere dönüştürür.
# Overlay 6. kareden (t=0.2s @ 30fps) başlar; süre ~5.2 sn.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/studio/status"
FFMPEG="${FFMPEG:-ffmpeg}"

SRC_DIR="${1:-$HOME/Desktop/zebra örnek/Satuıldı kiralandı kaporası alındı}"

if ! command -v "$FFMPEG" >/dev/null 2>&1; then
  echo "ffmpeg bulunamadı" >&2
  exit 1
fi

mkdir -p "$OUT"

START="${STATUS_OVERLAY_START_SEC:-0.2}"
DUR="${STATUS_OVERLAY_DUR:-5.2}"
OW=1080
OH=582

encode_one() {
  local src="$1"
  local slug="$2"
  if [[ ! -f "$src" ]]; then
    echo "Kaynak yok: $src" >&2
    return 1
  fi
  echo "==> $slug"
  "$FFMPEG" -y -ss "$START" -i "$src" -t "$DUR" \
    -vf "scale=${OW}:${OH}:force_original_aspect_ratio=decrease,pad=${OW}:${OH}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=yuva420p" \
    -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -deadline good -cpu-used 2 -b:v 0 -crf 32 \
    -an "$OUT/${slug}.webm"
}

AUDIO_SRC=$(find "$SRC_DIR" -maxdepth 1 -iname '*.mp3' | head -n1 || true)
if [[ -n "${AUDIO_SRC:-}" ]]; then
  echo "==> status-audio.mp3"
  "$FFMPEG" -y -i "$AUDIO_SRC" -t 5.1 -c:a libmp3lame -q:a 4 "$OUT/status-audio.mp3"
fi

encode_one "$SRC_DIR/Satıldı.mov" satildi
encode_one "$SRC_DIR/Kiralandı.mov" kiralandi

KAPORA=$(find "$SRC_DIR" -maxdepth 1 \( -iname '*kapora*' -o -iname '*kapos*' \) -name '*.mov' | head -n1 || true)
if [[ -n "${KAPORA:-}" ]]; then
  encode_one "$KAPORA" kapora
else
  echo "Kapora MOV bulunamadı" >&2
  exit 1
fi

ls -lh "$OUT"
echo "Tamam."
