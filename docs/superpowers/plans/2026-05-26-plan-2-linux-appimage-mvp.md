# Plan 2 — Linux AppImage MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a single `DownloadMgr-x86_64.AppImage` file that, when double-clicked on any modern Linux desktop, opens a window running the existing React UI backed by a bundled Python API. No Python, Node, yt-dlp, ffmpeg, or other dependencies required on the user's machine.

**Architecture:** Three deliverables sequenced.
1. The React UI learns to read the API port from a Tauri-injected global instead of hard-coding `6543` (Phase B).
2. `apps/api` plus pinned `yt-dlp` and `ffmpeg` binaries get bundled into a single executable via PyInstaller (Phase C). A small bootstrap module sets `DM_YTDLP_BIN` / `DM_FFMPEG_BIN` to the extraction paths so the wiring from Plan 1 takes effect.
3. A new Tauri 2.x shell at `apps/shell/` spawns the PyInstaller binary as a sidecar, reads its `DM_PORT N` stdout, injects `window.__DM_API_PORT__`, and serves the React UI inside a system webview (Phase D). The `tauri build` target produces the `.AppImage`.

**Tech Stack:** Rust + Cargo + Tauri 2.x for the shell, PyInstaller for the Python bundle, Vite for the React build. Continues to use FastAPI / uvicorn / yt-dlp under the hood — none of that changes.

**Spec:** `docs/superpowers/specs/2026-05-26-desktop-app-packaging-design.md` — covers Phase B (minimum), C, and D.

**Out of scope (deferred to Plan 3 — UI polish):** tray icon, native notifications, single-instance lock, deep-link handler, settings UI screen, settings REST API, command palette, drag-resize panels.

---

## File Structure

**New top-level directories (2):**

- `apps/shell/` — Tauri shell project.
- `build/` — packaging scripts and PyInstaller config.

**New files (15):**

- `build/pyinstaller/binaries.lock` — pinned versions + SHA256 of yt-dlp and ffmpeg.
- `build/pyinstaller/fetch_binaries.sh` — downloads + verifies vendored binaries into `build/pyinstaller/binaries/<arch>/`.
- `build/pyinstaller/bootstrap.py` — entry-point shim that sets `DM_YTDLP_BIN` / `DM_FFMPEG_BIN` and calls `dm_api.presentation.main.main()`.
- `build/pyinstaller/dm-api.spec` — PyInstaller spec.
- `build/README.md` — short build instructions (`./build/pyinstaller/fetch_binaries.sh && uv run pyinstaller build/pyinstaller/dm-api.spec`).
- `apps/shell/Cargo.toml`
- `apps/shell/tauri.conf.json`
- `apps/shell/build.rs`
- `apps/shell/src/main.rs`
- `apps/shell/src/sidecar.rs` — spawn, read `DM_PORT N`, supervise, kill on quit.
- `apps/shell/src/error.rs` — typed shell errors.
- `apps/shell/icons/icon.png` (256x256, placeholder for v1; real branding later).
- `apps/shell/icons/icon.ico`, `icon.icns` — empty placeholders (Linux build doesn't need them but tauri.conf.json declares them).
- `apps/desktop/src/api-port.ts` — single helper exposing `getApiBase()`.
- `apps/api/tests/integration/test_bundled_binary.py` — integration test that runs the PyInstaller output and hits `/api/health`.

**Modified files (4):**

- `apps/desktop/src/api.ts` — call `getApiBase()` instead of using a hard-coded literal.
- `apps/desktop/src/hooks/useDownloads.ts` — same: use `getApiBase()` for both REST and WebSocket URLs.
- `apps/api/pyproject.toml` — add `pyinstaller` as a dev dependency.
- `.gitignore` — ignore `build/pyinstaller/binaries/`, `build/pyinstaller/build/`, `build/pyinstaller/dist/`, `apps/shell/target/`, `apps/shell/src-tauri-binaries/` (sidecar staging).

---

## Task 0: Prerequisites — install Rust, Tauri CLI, PyInstaller

One-time setup on the dev machine. Skip if already installed (the task verifies idempotently).

- [ ] **Step 0.1: Install Rust toolchain**

Check first:
```bash
rustc --version 2>/dev/null
```
If it prints a version, skip the rest of this step. Otherwise:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal
source "$HOME/.cargo/env"
rustc --version
```
Expected: prints `rustc 1.x.y (...)`.

- [ ] **Step 0.2: Install Tauri CLI v2**

```bash
cargo install tauri-cli --version "^2" --locked
cargo tauri --version
```
Expected: prints `tauri-cli 2.x.x`. (This takes ~3–5 minutes the first time.)

- [ ] **Step 0.3: Add `pyinstaller` to API dev dependencies**

Edit `apps/api/pyproject.toml`. Find the `[dependency-groups]` or `[project.optional-dependencies]` block containing `pytest`. Add `pyinstaller>=6.10` to the existing dev/test group. Example diff (your file may have a slightly different group name — keep the existing structure):

```toml
[dependency-groups]
dev = [
    "pytest>=8.3",
    "pytest-cov>=5.0",
    "pytest-asyncio>=0.24",
    "httpx>=0.27",
    "respx>=0.21",
    "pyinstaller>=6.10",
]
```

Then install:
```bash
cd /home/robotics1025/Documents/project/apps/api
uv sync
uv run pyinstaller --version
```
Expected: prints `6.x.x` or higher.

- [ ] **Step 0.4: Verify Tauri Linux prerequisites**

Confirm the GTK + WebKit + indicator libs are installed (the dev machine already had them per the survey, but new contributors will need this):
```bash
dpkg -l | grep -E "libwebkit2gtk-4.1-0|libgtk-3-dev|libayatana-appindicator3-1" | wc -l
```
Expected: `3` (one line per package). If less, install with:
```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev
```

- [ ] **Step 0.5: Commit the `pyproject.toml` change**

```bash
cd /home/robotics1025/Documents/project
git add apps/api/pyproject.toml apps/api/uv.lock
git commit -m "build(api): add pyinstaller to dev dependencies"
```

---

## Task 1: Desktop UI reads the API port from a Tauri-injected global

The React app currently hard-codes `http://127.0.0.1:6543` in `src/api.ts` and `src/hooks/useDownloads.ts`. The packaged app sets `window.__DM_API_PORT__` before the JS runs. In dev (Vite), no global is set, so the helper falls back to `6543`.

**Files:**
- Create: `apps/desktop/src/api-port.ts`
- Modify: `apps/desktop/src/api.ts`
- Modify: `apps/desktop/src/hooks/useDownloads.ts`

- [ ] **Step 1.1: Create the helper**

`apps/desktop/src/api-port.ts`:

```typescript
// Single source of truth for "where does the API live?".
//
// In the packaged Tauri app, the Rust shell parses `DM_PORT <N>` from the
// PyInstaller'd sidecar's stdout and injects the port via an init script before
// React boots. In Vite dev mode no global is set and we fall back to the API's
// default port (6543, see apps/api/src/dm_api/presentation/main.py).

declare global {
  interface Window {
    __DM_API_PORT__?: number;
  }
}

const DEV_FALLBACK_PORT = 6543;

function apiPort(): number {
  return typeof window !== "undefined" && typeof window.__DM_API_PORT__ === "number"
    ? window.__DM_API_PORT__
    : DEV_FALLBACK_PORT;
}

export function getApiBase(): string {
  return `http://127.0.0.1:${apiPort()}`;
}

export function getWsBase(): string {
  return `ws://127.0.0.1:${apiPort()}`;
}
```

- [ ] **Step 1.2: Find every hard-coded `127.0.0.1:6543` reference**

```bash
cd /home/robotics1025/Documents/project/apps/desktop
grep -rn "127.0.0.1:6543\|localhost:6543" src/
```
Note every match. The expected matches per the spec are `src/api.ts` and `src/hooks/useDownloads.ts`. If any other file matches, update it too.

- [ ] **Step 1.3: Update `apps/desktop/src/api.ts`**

Replace every literal `"http://127.0.0.1:6543"` with `getApiBase()`, and every literal `"ws://127.0.0.1:6543"` with `getWsBase()`. Add the import at the top:

```typescript
import { getApiBase, getWsBase } from "./api-port";
```

If the file constructs URL strings via template literals (e.g. `` `http://127.0.0.1:6543/api/downloads/${id}` ``), rewrite as `` `${getApiBase()}/api/downloads/${id}` ``. Make sure to remove any const declaring the hard-coded base.

- [ ] **Step 1.4: Update `apps/desktop/src/hooks/useDownloads.ts`**

Same treatment. WebSocket URLs use `getWsBase()`.

- [ ] **Step 1.5: Update any other files that grep surfaced in Step 1.2**

Same pattern.

- [ ] **Step 1.6: Manual smoke test in dev mode**

The API should already be running from Plan 1 work. If not:
```bash
cd /home/robotics1025/Documents/project/apps/api
uv run python -m dm_api.presentation.main &
```
(Note: this binds 6543 by default, which is what the fallback expects.)

Then the desktop dev server:
```bash
cd /home/robotics1025/Documents/project/apps/desktop
npm run dev
```
Open http://localhost:5173 in a browser. Confirm:
- The downloads list loads (proves `getApiBase()` returned a working URL).
- The progress WebSocket connects (browser devtools Network → WS — there is an open frame).

If both work, the fallback is wired correctly. Kill the dev server with Ctrl+C.

- [ ] **Step 1.7: Commit**

```bash
cd /home/robotics1025/Documents/project
git add apps/desktop/src/api-port.ts \
        apps/desktop/src/api.ts \
        apps/desktop/src/hooks/useDownloads.ts
# Add any extra files Step 1.5 modified.
git commit -m "feat(desktop): read API port from Tauri-injected window.__DM_API_PORT__"
```

---

## Task 2: Vendor yt-dlp and ffmpeg binaries with a checksummed fetch script

The PyInstaller bundle embeds platform-specific `yt-dlp` and `ffmpeg` binaries. Production CI will download them fresh each build; for now we vendor them locally into `build/pyinstaller/binaries/linux-x86_64/`. Pinned versions + SHA256 hashes live in `binaries.lock` so checksums verify before bundling.

**Files:**
- Create: `build/pyinstaller/binaries.lock`
- Create: `build/pyinstaller/fetch_binaries.sh`
- Modify: `.gitignore`

- [ ] **Step 2.1: Create `build/pyinstaller/binaries.lock`**

This is a simple key=value file. Versions chosen are the current stable releases as of 2026-05.

```
# Pinned versions for the PyInstaller bundle. CI fetches these by URL and
# verifies the SHA256 before packaging.

[yt-dlp.linux-x86_64]
version = 2026.05.24.234402
url = https://github.com/yt-dlp/yt-dlp/releases/download/2026.05.24.234402/yt-dlp_linux
sha256 = REPLACE_ME_AFTER_DOWNLOAD

[ffmpeg.linux-x86_64]
version = 7.1
url = https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
sha256 = REPLACE_ME_AFTER_DOWNLOAD
archive_member = ffmpeg-7.1-amd64-static/ffmpeg
```

The `REPLACE_ME_AFTER_DOWNLOAD` sentinels get filled in by Step 2.3.

- [ ] **Step 2.2: Create `build/pyinstaller/fetch_binaries.sh`**

```bash
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
```

- [ ] **Step 2.3: Make it executable and run it to populate the binaries + lock**

```bash
cd /home/robotics1025/Documents/project
chmod +x build/pyinstaller/fetch_binaries.sh
./build/pyinstaller/fetch_binaries.sh
```
Expected: prints the yt-dlp version (e.g. `2026.05.24.234402`), ffmpeg version (e.g. `ffmpeg version 7.1...`), and `binaries.lock` now has real SHA256 values instead of `REPLACE_ME_AFTER_DOWNLOAD`. Final `ls` shows two executables: `yt-dlp` and `ffmpeg`.

- [ ] **Step 2.4: Verify idempotence**

Run the script a second time. It should re-download and verify the (now-pinned) checksums match:
```bash
./build/pyinstaller/fetch_binaries.sh
```
Expected: no errors, no SHA256 update, prints both versions again.

- [ ] **Step 2.5: Update `.gitignore`**

Append to `.gitignore`:
```
# PyInstaller bundle artifacts and vendored binaries (re-fetched in CI).
build/pyinstaller/binaries/
build/pyinstaller/build/
build/pyinstaller/dist/

# Tauri shell artifacts.
apps/shell/target/
apps/shell/src-tauri-binaries/
```

- [ ] **Step 2.6: Commit**

```bash
cd /home/robotics1025/Documents/project
git add build/pyinstaller/binaries.lock \
        build/pyinstaller/fetch_binaries.sh \
        .gitignore
git commit -m "build(pyinstaller): vendor yt-dlp + ffmpeg with checksummed fetcher"
```

---

## Task 3: PyInstaller bootstrap module — set DM_YTDLP_BIN before importing dm_api

PyInstaller's one-file mode extracts the bundle to a temp dir (`sys._MEIPASS`) on each launch. We need to point the Plan-1 binary-discovery code at the embedded binaries before `dm_api` ever calls `yt_dlp_bin()`.

**Files:**
- Create: `build/pyinstaller/bootstrap.py`

- [ ] **Step 3.1: Write the bootstrap**

`build/pyinstaller/bootstrap.py`:

```python
"""PyInstaller bootstrap entry-point.

PyInstaller's one-file mode extracts the bundle's data files to a temp
directory on each launch; the path is in ``sys._MEIPASS``. We use it to
locate the bundled ``yt-dlp`` and ``ffmpeg`` binaries and export
``DM_YTDLP_BIN`` / ``DM_FFMPEG_BIN`` before importing ``dm_api`` — that way
the binary-discovery helpers in ``infrastructure/media/binaries.py`` resolve
the bundled copies instead of falling back to PATH.

This file is referenced as the entry script in ``dm-api.spec``.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def _resource_dir() -> Path:
    """Where PyInstaller extracted our data files.

    Falls back to the directory containing this script when running outside
    a PyInstaller bundle (e.g. ``python build/pyinstaller/bootstrap.py``)
    so a contributor can sanity-check the bootstrap without building first.
    """
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        return Path(meipass)
    return Path(__file__).resolve().parent


def _set_bundled_binary(env_var: str, name: str) -> None:
    if os.environ.get(env_var):
        # Honour explicit override (e.g. a developer pointing at a local build).
        return
    candidate = _resource_dir() / name
    if candidate.is_file():
        os.environ[env_var] = str(candidate)


def main() -> None:
    _set_bundled_binary("DM_YTDLP_BIN", "yt-dlp")
    _set_bundled_binary("DM_FFMPEG_BIN", "ffmpeg")

    # Import lazily so the env vars are set first.
    from dm_api.presentation.main import main as dm_main

    dm_main()


if __name__ == "__main__":
    main()
```

- [ ] **Step 3.2: Smoke-test the bootstrap outside PyInstaller**

```bash
cd /home/robotics1025/Documents/project
# Copy the vendored binaries next to bootstrap.py so the fallback finds them.
cp build/pyinstaller/binaries/linux-x86_64/yt-dlp build/pyinstaller/
cp build/pyinstaller/binaries/linux-x86_64/ffmpeg build/pyinstaller/
cd apps/api
uv run python /home/robotics1025/Documents/project/build/pyinstaller/bootstrap.py --port 0 &
BPID=$!
sleep 4
ls /tmp 2>/dev/null
kill $BPID
# Cleanup the copies (not committed; just for the test).
rm /home/robotics1025/Documents/project/build/pyinstaller/yt-dlp \
   /home/robotics1025/Documents/project/build/pyinstaller/ffmpeg
```
Expected: the foreground output includes a `DM_PORT <N>` line. The server started (so the bootstrap successfully imported `dm_api` after setting env vars). No commit needed for the temp binary copies.

- [ ] **Step 3.3: Commit**

```bash
cd /home/robotics1025/Documents/project
git add build/pyinstaller/bootstrap.py
git commit -m "build(pyinstaller): bootstrap that sets DM_YTDLP_BIN before dm_api import"
```

---

## Task 4: PyInstaller spec and build

**Files:**
- Create: `build/pyinstaller/dm-api.spec`
- Create: `build/README.md`

- [ ] **Step 4.1: Write the PyInstaller spec**

`build/pyinstaller/dm-api.spec`:

```python
# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the dm-api sidecar binary.

Produces a single-file executable named `dm-api` (or `dm-api.exe` on Windows)
in ``build/pyinstaller/dist/``. The bundle embeds:

  * the entire ``dm_api`` Python package + dependencies,
  * the platform's vendored ``yt-dlp`` and ``ffmpeg`` binaries from
    ``build/pyinstaller/binaries/<platform>/``.

The entry script is ``bootstrap.py``, which sets the env vars the binary-
discovery helpers expect, then calls ``dm_api.presentation.main.main()``.
"""
from __future__ import annotations

import platform
import sys
from pathlib import Path

# PyInstaller invokes this spec from the project root via
# ``uv run pyinstaller build/pyinstaller/dm-api.spec``. ``__file__`` is the
# spec path itself, so we anchor relative paths from its directory.
SPEC_DIR = Path(SPECPATH).resolve()
PROJECT_ROOT = SPEC_DIR.parent.parent

# Map runtime platform to the vendored-binary subdir produced by
# ``fetch_binaries.sh``.
_PLATFORM = {
    ("Linux", "x86_64"): "linux-x86_64",
    ("Darwin", "x86_64"): "macos-x86_64",
    ("Darwin", "arm64"): "macos-arm64",
    ("Windows", "AMD64"): "windows-x86_64",
}.get((platform.system(), platform.machine()))

if _PLATFORM is None:
    raise SystemExit(
        f"Unsupported platform: {platform.system()} {platform.machine()}. "
        "Add it to build/pyinstaller/dm-api.spec."
    )

BINARIES_DIR = SPEC_DIR / "binaries" / _PLATFORM
YT_DLP = BINARIES_DIR / "yt-dlp"
FFMPEG = BINARIES_DIR / "ffmpeg"

if not YT_DLP.is_file() or not FFMPEG.is_file():
    raise SystemExit(
        f"Vendored binaries missing in {BINARIES_DIR}. "
        "Run ./build/pyinstaller/fetch_binaries.sh first."
    )

block_cipher = None

a = Analysis(
    [str(SPEC_DIR / "bootstrap.py")],
    pathex=[str(PROJECT_ROOT / "apps" / "api" / "src")],
    binaries=[
        (str(YT_DLP), "."),
        (str(FFMPEG), "."),
    ],
    datas=[
        # alembic ships SQL templates / migrations as package data; PyInstaller
        # would otherwise miss them.
        (str(PROJECT_ROOT / "apps" / "api" / "src" / "dm_api" / "infrastructure" / "persistence" / "migrations"),
         "dm_api/infrastructure/persistence/migrations"),
        (str(PROJECT_ROOT / "apps" / "api" / "alembic.ini"), "."),
    ],
    hiddenimports=[
        # uvicorn pulls these dynamically.
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.protocols.websockets.websockets_impl",
        # alembic detects migration scripts via importlib at runtime.
        "alembic.runtime.environment",
        "alembic.runtime.migration",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Trim obvious dead weight.
        "tkinter",
        "test",
        "unittest",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="dm-api",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,            # UPX can break webview cert bundles; leave off.
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,         # We rely on stdout for the DM_PORT line.
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
```

- [ ] **Step 4.2: Build the bundle**

```bash
cd /home/robotics1025/Documents/project/apps/api
uv run pyinstaller --noconfirm \
  --distpath /home/robotics1025/Documents/project/build/pyinstaller/dist \
  --workpath /home/robotics1025/Documents/project/build/pyinstaller/build \
  /home/robotics1025/Documents/project/build/pyinstaller/dm-api.spec
```
Expected: ~30–60 seconds of output ending in `Building EXE from EXE-00.toc completed successfully.` Produces `build/pyinstaller/dist/dm-api` (a single executable, ~80–150 MB).

If you see `WARNING: Hidden import "X" not found`, that's usually fine for `__pycache__` / type stubs; only bail if pyinstaller exits non-zero.

- [ ] **Step 4.3: Run the bundled binary standalone — verify DM_PORT and /api/health**

```bash
cd /home/robotics1025/Documents/project
rm -rf /tmp/dm_bundle_test && mkdir -p /tmp/dm_bundle_test
DM_DATA_DIR=/tmp/dm_bundle_test ./build/pyinstaller/dist/dm-api --port 0 > /tmp/dm_bundle_stdout.txt 2>&1 &
APIPID=$!
sleep 8
grep "^DM_PORT " /tmp/dm_bundle_stdout.txt | head -1
PORT=$(grep "^DM_PORT " /tmp/dm_bundle_stdout.txt | head -1 | awk '{print $2}')
echo "Port: $PORT"
curl -s "http://127.0.0.1:$PORT/api/health"
echo
kill $APIPID
```
Expected: `DM_PORT <N>` printed, `/api/health` returns `{"status":"ok","version":"0.2.0",...}`. The bundle works standalone.

- [ ] **Step 4.4: Verify the bundle uses the EMBEDDED yt-dlp, not PATH**

```bash
# Move the PATH yt-dlp aside temporarily so we can prove the bundle doesn't need it.
ORIG_YTDLP=$(which yt-dlp)
sudo mv "$ORIG_YTDLP" "${ORIG_YTDLP}.hidden"

DM_DATA_DIR=/tmp/dm_bundle_test ./build/pyinstaller/dist/dm-api --port 0 > /tmp/dm_bundle_stdout2.txt 2>&1 &
APIPID=$!
sleep 8
PORT=$(grep "^DM_PORT " /tmp/dm_bundle_stdout2.txt | head -1 | awk '{print $2}')
curl -s -X POST "http://127.0.0.1:$PORT/api/media/probe" -H "Content-Type: application/json" -d '{"url":"https://example.com/x"}'
echo
kill $APIPID

# Restore.
sudo mv "${ORIG_YTDLP}.hidden" "$ORIG_YTDLP"
```
Expected: probe returns `{"is_media":false,...}` (the embedded yt-dlp ran but found no media at example.com). The fact that it returned anything at all proves the embedded binary is in use — if it had failed to find yt-dlp, the probe would have raised a `RuntimeError("yt-dlp not found...")`.

If you don't want to sudo-rename a system binary, skip this verification — Task 5 (Tauri sidecar) covers the same path end-to-end.

- [ ] **Step 4.5: Write a short build README**

`build/README.md`:

```markdown
# Build artifacts

## PyInstaller (dm-api sidecar binary)

One-time setup (per platform):

```bash
./build/pyinstaller/fetch_binaries.sh
```

Build the bundle:

```bash
cd apps/api
uv run pyinstaller --noconfirm \
  --distpath ../../build/pyinstaller/dist \
  --workpath ../../build/pyinstaller/build \
  ../../build/pyinstaller/dm-api.spec
```

Output: `build/pyinstaller/dist/dm-api` (single-file executable).

Run standalone:

```bash
./build/pyinstaller/dist/dm-api --port 0
```

It prints `DM_PORT <N>` to stdout and serves the API on `127.0.0.1:<N>`.

## Tauri shell (.AppImage)

See `apps/shell/README.md` (created in Task 7).
```

- [ ] **Step 4.6: Commit**

```bash
cd /home/robotics1025/Documents/project
git add build/pyinstaller/dm-api.spec build/README.md
git commit -m "build(pyinstaller): dm-api one-file bundle with embedded yt-dlp + ffmpeg"
```

---

## Task 5: Tauri shell scaffold

Create the Tauri project structure. No real functionality yet — just enough that `cargo tauri dev` opens a window pointing at the Vite dev server.

**Files:**
- Create: `apps/shell/Cargo.toml`
- Create: `apps/shell/tauri.conf.json`
- Create: `apps/shell/build.rs`
- Create: `apps/shell/src/main.rs`
- Create: `apps/shell/src/error.rs`
- Create: `apps/shell/icons/icon.png` (256x256 placeholder)
- Create: `apps/shell/package.json` (Tauri CLI entry point)

- [ ] **Step 5.1: `apps/shell/Cargo.toml`**

```toml
[package]
name = "downloadmgr-shell"
version = "0.1.0"
description = "DownloadMgr desktop shell"
authors = ["Keith Paul Kato"]
edition = "2021"
rust-version = "1.75"

[lib]
name = "downloadmgr_shell_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
tokio = { version = "1", features = ["process", "io-util", "macros", "rt-multi-thread", "time"] }

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

- [ ] **Step 5.2: `apps/shell/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "DownloadMgr",
  "version": "0.1.0",
  "identifier": "com.downloadmgr.app",
  "build": {
    "beforeDevCommand": "cd ../desktop && npm run dev",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "cd ../desktop && npm install && npm run build",
    "frontendDist": "../desktop/dist"
  },
  "app": {
    "windows": [
      {
        "title": "DownloadMgr",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["appimage"],
    "icon": ["icons/icon.png"],
    "category": "Utility",
    "shortDescription": "Download manager for video, audio, and files.",
    "longDescription": "A local-only download manager that wraps yt-dlp with a desktop UI.",
    "resources": [],
    "externalBin": ["binaries/dm-api"],
    "linux": {
      "appimage": {
        "bundleMediaFramework": false
      }
    }
  }
}
```

Note: `externalBin: ["binaries/dm-api"]` tells Tauri to look for `apps/shell/binaries/dm-api-<rust-target-triple>` and ship it next to the binary in the bundle. Task 6 places the PyInstaller output there.

- [ ] **Step 5.3: `apps/shell/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 5.4: `apps/shell/src/error.rs`**

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ShellError {
    #[error("failed to spawn sidecar: {0}")]
    SpawnSidecar(String),

    #[error("sidecar did not announce its port within {0:?}")]
    SidecarStartupTimeout(std::time::Duration),

    #[error("sidecar emitted invalid DM_PORT line: {0:?}")]
    InvalidDmPortLine(String),
}

impl serde::Serialize for ShellError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
```

- [ ] **Step 5.5: `apps/shell/src/main.rs`** (minimal scaffold; real sidecar logic arrives in Task 6)

```rust
// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod error;
mod sidecar;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match sidecar::start(&handle).await {
                    Ok(port) => {
                        eprintln!("sidecar listening on port {port}");
                    }
                    Err(err) => {
                        eprintln!("sidecar failed to start: {err}");
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DownloadMgr");
}
```

- [ ] **Step 5.6: `apps/shell/src/sidecar.rs`** (stub for now — real logic in Task 6)

```rust
use tauri::AppHandle;

use crate::error::ShellError;

/// Spawn the bundled `dm-api` sidecar and return the port it bound to.
/// Stub implementation: real implementation lives in Task 6.
pub async fn start(_app: &AppHandle) -> Result<u16, ShellError> {
    Ok(0)
}
```

- [ ] **Step 5.7: Placeholder icon**

The bundler needs an icon. A 256x256 solid-colour PNG suffices for v1. Generate one:

```bash
mkdir -p /home/robotics1025/Documents/project/apps/shell/icons
python3 -c "
import struct, zlib, sys
# 256x256 indigo PNG (#6366f1)
w, h = 256, 256
r, g, b = 0x63, 0x66, 0xf1
raw = b''
for _ in range(h):
    raw += b'\x00' + (bytes((r, g, b)) * w)
def chunk(t, d):
    return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
png = (
    b'\x89PNG\r\n\x1a\n'
    + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    + chunk(b'IDAT', zlib.compress(raw))
    + chunk(b'IEND', b'')
)
sys.stdout.buffer.write(png)
" > /home/robotics1025/Documents/project/apps/shell/icons/icon.png

ls -la /home/robotics1025/Documents/project/apps/shell/icons/icon.png
```
Expected: a `~5 KB` icon.png exists.

- [ ] **Step 5.8: `apps/shell/package.json`**

```json
{
  "name": "downloadmgr-shell",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "cargo tauri dev",
    "build": "cargo tauri build"
  }
}
```

- [ ] **Step 5.9: First build — verify the project compiles**

```bash
cd /home/robotics1025/Documents/project/apps/shell
# Tauri 2 generates files under src-tauri/ by convention, but our config
# uses the root of apps/shell/. The Cargo.toml + tauri.conf.json must be
# next to each other; both are at apps/shell/. Run cargo directly:
cargo build
```
Expected: ~5–8 minutes the first time (Cargo downloads and compiles ~200 crates). Ends with `Finished dev [unoptimized + debuginfo] target(s) in ...`.

If you hit errors, the most likely culprits are missing system libs — re-run the apt install from Step 0.4.

- [ ] **Step 5.10: Commit**

```bash
cd /home/robotics1025/Documents/project
git add apps/shell/Cargo.toml \
        apps/shell/Cargo.lock \
        apps/shell/tauri.conf.json \
        apps/shell/build.rs \
        apps/shell/src/main.rs \
        apps/shell/src/error.rs \
        apps/shell/src/sidecar.rs \
        apps/shell/icons/icon.png \
        apps/shell/package.json
git commit -m "feat(shell): tauri 2.x scaffold for DownloadMgr desktop shell"
```

---

## Task 6: Sidecar bridge — spawn dm-api, parse DM_PORT, inject into webview

This is the load-bearing task. The Rust shell spawns the PyInstaller binary, reads its stdout line-by-line until `DM_PORT <N>` arrives, and injects `window.__DM_API_PORT__ = N` into the webview before page load.

**Files:**
- Modify: `apps/shell/src/sidecar.rs`
- Modify: `apps/shell/src/main.rs`

- [ ] **Step 6.1: Stage the PyInstaller binary so Tauri finds it**

Tauri's `externalBin` expects `binaries/dm-api-<target-triple>` next to the spec. The triple on this dev machine is `x86_64-unknown-linux-gnu`:

```bash
TRIPLE=$(rustc -vV | grep "host:" | awk '{print $2}')
echo "rust target triple: $TRIPLE"

mkdir -p /home/robotics1025/Documents/project/apps/shell/binaries
cp /home/robotics1025/Documents/project/build/pyinstaller/dist/dm-api \
   /home/robotics1025/Documents/project/apps/shell/binaries/dm-api-$TRIPLE
chmod +x /home/robotics1025/Documents/project/apps/shell/binaries/dm-api-$TRIPLE
ls -la /home/robotics1025/Documents/project/apps/shell/binaries/
```
Expected: the `dm-api-x86_64-unknown-linux-gnu` file is ~80–150 MB. Already gitignored from Task 2.5.

- [ ] **Step 6.2: Implement `sidecar.rs` for real**

Replace the stub from Task 5.6 with:

```rust
use std::time::Duration;

use tauri::AppHandle;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tokio::sync::oneshot;

use crate::error::ShellError;

const DM_PORT_PREFIX: &str = "DM_PORT ";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);

/// Spawn the bundled `dm-api` sidecar. Blocks until the sidecar prints its
/// ``DM_PORT <N>`` line on stdout, then returns the port. The sidecar
/// continues running in the background; its further stdout is logged.
pub async fn start(app: &AppHandle) -> Result<u16, ShellError> {
    let sidecar = app
        .shell()
        .sidecar("dm-api")
        .map_err(|e| ShellError::SpawnSidecar(e.to_string()))?
        .args(["--port", "0"]);

    let (mut rx, _child) = sidecar
        .spawn()
        .map_err(|e| ShellError::SpawnSidecar(e.to_string()))?;

    let (port_tx, port_rx) = oneshot::channel::<Result<u16, ShellError>>();
    let mut port_tx = Some(port_tx);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    if let Some(rest) = line.strip_prefix(DM_PORT_PREFIX) {
                        if let Some(tx) = port_tx.take() {
                            let parsed = rest
                                .trim()
                                .parse::<u16>()
                                .map_err(|_| ShellError::InvalidDmPortLine(line.to_string()));
                            let _ = tx.send(parsed);
                        }
                    }
                    eprintln!("[dm-api stdout] {}", line.trim_end());
                }
                CommandEvent::Stderr(bytes) => {
                    eprintln!("[dm-api stderr] {}", String::from_utf8_lossy(&bytes).trim_end());
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[dm-api] terminated: code={:?}", payload.code);
                    if let Some(tx) = port_tx.take() {
                        let _ = tx.send(Err(ShellError::SpawnSidecar(
                            "sidecar exited before announcing DM_PORT".into(),
                        )));
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    match tokio::time::timeout(STARTUP_TIMEOUT, port_rx).await {
        Ok(Ok(Ok(port))) => Ok(port),
        Ok(Ok(Err(err))) => Err(err),
        Ok(Err(_canceled)) => Err(ShellError::SpawnSidecar(
            "sidecar oneshot canceled before DM_PORT".into(),
        )),
        Err(_elapsed) => Err(ShellError::SidecarStartupTimeout(STARTUP_TIMEOUT)),
    }
}
```

- [ ] **Step 6.3: Update `main.rs` to inject the port into the webview**

Replace `apps/shell/src/main.rs` with:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod error;
mod sidecar;

use tauri::{Manager, WebviewWindowBuilder, WebviewUrl};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match sidecar::start(&handle).await {
                    Ok(port) => {
                        let init = format!("window.__DM_API_PORT__ = {port};");
                        if let Err(err) = WebviewWindowBuilder::new(
                            &handle,
                            "main",
                            WebviewUrl::App("index.html".into()),
                        )
                        .title("DownloadMgr")
                        .inner_size(1280.0, 800.0)
                        .min_inner_size(900.0, 600.0)
                        .initialization_script(&init)
                        .build()
                        {
                            eprintln!("failed to open main window: {err}");
                        }
                    }
                    Err(err) => {
                        eprintln!("sidecar failed to start: {err}");
                        // Open a minimal error window so the user isn't staring at
                        // an empty screen.
                        let _ = WebviewWindowBuilder::new(
                            &handle,
                            "error",
                            WebviewUrl::External("about:blank".parse().unwrap()),
                        )
                        .title("DownloadMgr — error")
                        .inner_size(600.0, 200.0)
                        .initialization_script(&format!(
                            "document.body.innerHTML = '<pre style=\"padding:24px;font:14px monospace\">DownloadMgr failed to start the backend.<br><br>{err}</pre>';"
                        ))
                        .build();
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DownloadMgr");
}
```

Remove the default window from `tauri.conf.json` since we're building windows programmatically (so we can inject the script BEFORE load). In `apps/shell/tauri.conf.json`, change the `"app"` block to:

```json
  "app": {
    "windows": [],
    "security": {
      "csp": null
    }
  },
```

(Note `"windows": []` is an empty array — no auto-created window. The window is created in `setup()` after the sidecar reports its port.)

- [ ] **Step 6.4: Manual dev-mode smoke test**

```bash
cd /home/robotics1025/Documents/project/apps/shell
cargo tauri dev
```
Expected: spends a few seconds compiling, then starts the Vite dev server (output in the terminal), then opens a window titled "DownloadMgr". The downloads list loads — proving the React UI is talking to the API on the port the sidecar bound to.

Devtools (F12 in the window, or right-click → Inspect) should show `window.__DM_API_PORT__` is a number > 0.

Stop with Ctrl+C in the terminal.

- [ ] **Step 6.5: Commit**

```bash
cd /home/robotics1025/Documents/project
git add apps/shell/src/sidecar.rs apps/shell/src/main.rs apps/shell/tauri.conf.json
git commit -m "feat(shell): spawn dm-api sidecar, parse DM_PORT, inject into webview"
```

---

## Task 7: Build the .AppImage and verify it runs

**Files:**
- Create: `apps/shell/README.md`

- [ ] **Step 7.1: Build the AppImage**

```bash
cd /home/robotics1025/Documents/project/apps/shell
cargo tauri build
```
Expected: 5–10 minutes (release optimizations + AppImage assembly). Final output ends with the path to the produced AppImage, typically:
```
Finished 1 bundle at:
  apps/shell/target/release/bundle/appimage/DownloadMgr_0.1.0_amd64.AppImage
```

- [ ] **Step 7.2: Run the AppImage**

```bash
cd /home/robotics1025/Documents/project
chmod +x apps/shell/target/release/bundle/appimage/DownloadMgr_*.AppImage
./apps/shell/target/release/bundle/appimage/DownloadMgr_*.AppImage
```
Expected: a window opens. The downloads list loads. You can paste a YouTube URL and queue a download.

If the window opens but the downloads list is empty / errors out, open the AppImage with `--verbose` or check stderr — the most likely cause is the sidecar failing to find the embedded yt-dlp because it wasn't staged correctly in Step 6.1.

- [ ] **Step 7.3: Verify the AppImage is portable**

```bash
mkdir -p /tmp/dm_portable_test
cp apps/shell/target/release/bundle/appimage/DownloadMgr_*.AppImage /tmp/dm_portable_test/
cd /tmp/dm_portable_test
./DownloadMgr_*.AppImage
```
Expected: same behavior. The AppImage is a single self-contained file — you can copy it to another machine or USB stick and double-click.

- [ ] **Step 7.4: Write a brief README**

`apps/shell/README.md`:

```markdown
# DownloadMgr desktop shell

Tauri 2.x shell that wraps `apps/desktop` (React UI) and `apps/api`
(PyInstaller-bundled FastAPI sidecar) into a single OS-native binary.

## Development

```bash
# Prerequisite: PyInstaller bundle (one-time per platform):
./build/pyinstaller/fetch_binaries.sh
cd apps/api && uv run pyinstaller \
  --distpath ../../build/pyinstaller/dist \
  ../../build/pyinstaller/dm-api.spec
# Stage the binary for Tauri:
mkdir -p apps/shell/binaries
cp build/pyinstaller/dist/dm-api \
   apps/shell/binaries/dm-api-$(rustc -vV | grep host: | awk '{print $2}')

# Dev mode (live-reloaded React + Rust shell):
cd apps/shell
cargo tauri dev

# Production AppImage:
cd apps/shell
cargo tauri build
# Output: apps/shell/target/release/bundle/appimage/DownloadMgr_*.AppImage
```

## What the shell does on launch

1. Spawns `dm-api --port 0` as a sidecar via `tauri-plugin-shell`.
2. Reads stdout until a `DM_PORT <N>` line arrives (30-second timeout).
3. Creates the main webview window with an initialization script:
   `window.__DM_API_PORT__ = <N>;`
4. The React UI's `getApiBase()` helper reads that global to construct API URLs.
```

- [ ] **Step 7.5: Commit**

```bash
cd /home/robotics1025/Documents/project
git add apps/shell/README.md
git commit -m "docs(shell): how to build and run the desktop shell"
```

---

## Done

After Task 7, Plan 2 is complete. You have:

- `build/pyinstaller/dist/dm-api` — a portable, single-file binary that runs the FastAPI app with embedded yt-dlp and ffmpeg.
- `apps/shell/target/release/bundle/appimage/DownloadMgr_*.AppImage` — a portable Linux desktop app you can hand to anyone running Ubuntu / Fedora / Arch / openSUSE without them needing to install anything.

To verify Plan 2 is complete:

- Double-clicking the `.AppImage` on a clean Ubuntu VM (without Python, Node, yt-dlp, or ffmpeg installed) opens a working DownloadMgr window.
- Queuing a YouTube URL completes a download to `~/Downloads/Videos/`.
- Closing the window cleanly shuts down the bundled API (no lingering Python processes).

The next plan (Plan 3 — UI polish) applies the `frontend-design` skill to the React UI to push it to a polished pro-tool look, and adds tray icon, native notifications, settings UI, and single-instance lock to the Tauri shell. Plan 4 then takes Plan 2's pipeline cross-platform (Windows + macOS in CI) and wires up the auto-updater and opt-in Sentry crash reporting.
