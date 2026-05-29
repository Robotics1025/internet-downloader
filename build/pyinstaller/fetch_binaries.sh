#!/usr/bin/env bash
# Download and verify vendored binaries (yt-dlp, ffmpeg) for the PyInstaller
# bundle. Reads URLs and expected SHA256s from binaries.lock.
#
# Usage:
#   ./build/pyinstaller/fetch_binaries.sh            (verify only)
#   ./build/pyinstaller/fetch_binaries.sh --update   (re-download + update lock)
#
# Output: build/pyinstaller/binaries/<platform>/{yt-dlp,ffmpeg}

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCK="$HERE/binaries.lock"
PLATFORM="linux-x86_64"
OUT_DIR="$HERE/binaries/$PLATFORM"
mkdir -p "$OUT_DIR"

UPDATE_MODE=0
if [[ "${1:-}" == "--update" ]]; then
  UPDATE_MODE=1
fi

read_lock_value() {
  local section="$1" key="$2"
  awk -v section="[$section]" -v key="$key" '
    $0 == section { in_section = 1; next }
    /^\[/ { in_section = 0 }
    in_section && $1 == key { for (i=3; i<=NF; i++) printf "%s%s", $i, (i<NF?" ":""); print ""; exit }
  ' "$LOCK"
}

compute_sha256() {
  sha256sum "$1" | awk '{print $1}'
}

fetch_yt_dlp() {
  local url="$(read_lock_value "yt-dlp.$PLATFORM" url)"
  local expected_sha="$(read_lock_value "yt-dlp.$PLATFORM" sha256)"
  local dest="$OUT_DIR/yt-dlp"
  echo "Fetching yt-dlp from $url"
  curl -fsSL "$url" -o "$dest"
  chmod +x "$dest"
  local actual_sha="$(compute_sha256 "$dest")"
  if [[ "$expected_sha" == "REPLACE_ME_AFTER_DOWNLOAD" || "$UPDATE_MODE" == "1" ]]; then
    echo "yt-dlp sha256: $actual_sha (writing to binaries.lock)"
    sed -i "/^\[yt-dlp.$PLATFORM\]/,/^\[/ s|^sha256 = .*|sha256 = $actual_sha|" "$LOCK"
  elif [[ "$expected_sha" != "$actual_sha" ]]; then
    echo "ERROR: yt-dlp checksum mismatch" >&2
    echo "  expected: $expected_sha" >&2
    echo "  actual:   $actual_sha" >&2
    exit 1
  fi
  "$dest" --version
}

fetch_ffmpeg() {
  local url="$(read_lock_value "ffmpeg.$PLATFORM" url)"
  local expected_sha="$(read_lock_value "ffmpeg.$PLATFORM" sha256)"
  local member="$(read_lock_value "ffmpeg.$PLATFORM" archive_member)"
  local archive="$OUT_DIR/ffmpeg.tar.xz"
  local dest="$OUT_DIR/ffmpeg"
  echo "Fetching ffmpeg from $url"
  curl -fsSL "$url" -o "$archive"
  local actual_sha="$(compute_sha256 "$archive")"
  if [[ "$expected_sha" == "REPLACE_ME_AFTER_DOWNLOAD" || "$UPDATE_MODE" == "1" ]]; then
    echo "ffmpeg archive sha256: $actual_sha (writing to binaries.lock)"
    sed -i "/^\[ffmpeg.$PLATFORM\]/,/^\[/ s|^sha256 = .*|sha256 = $actual_sha|" "$LOCK"
  elif [[ "$expected_sha" != "$actual_sha" ]]; then
    echo "ERROR: ffmpeg archive checksum mismatch" >&2
    exit 1
  fi
  tar -C "$OUT_DIR" -xJf "$archive" "$member"
  mv "$OUT_DIR/$member" "$dest"
  rm -rf "$OUT_DIR/$(dirname "$member")" "$archive"
  chmod +x "$dest"
  "$dest" -version | head -1
}

fetch_yt_dlp
fetch_ffmpeg
echo "Done. Binaries in $OUT_DIR"
ls -la "$OUT_DIR"
