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
