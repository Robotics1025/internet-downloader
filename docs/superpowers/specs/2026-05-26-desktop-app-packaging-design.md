# Desktop App Packaging — Design

**Date:** 2026-05-26
**Status:** Approved for implementation
**Scope:** Wrap the existing `apps/api` (FastAPI + Python) and `apps/desktop` (React + Vite) into a single distributable desktop application that runs on Windows, macOS, and Linux without the user needing to install Python, Node, yt-dlp, or ffmpeg.

## Goals

1. One-click installer per OS. The user double-clicks the installer, then double-clicks the app — no terminal, no Python install, no PATH setup.
2. The desktop app is its own window (system webview). No browser tab, no `localhost:5173` URL the user has to remember.
3. yt-dlp and ffmpeg are bundled inside the installer so downloads work the moment the app launches.
4. The existing React UI is reused unchanged in structure; a polish pass elevates the visual quality to "professional pro-tool" (Illustrator-grade), not a hobby web dashboard.

## Non-Goals (v1)

- Auto-update. Adding this requires hosting a signed update manifest; deferred until after v1 ships.
- Code signing / notarization. Unsigned installers will show a SmartScreen / Gatekeeper warning on first launch; bypass instructions in the README.
- System tray icon, hotkey-to-toggle-window, native notifications. Nice-to-have, not in v1.
- Bundling the browser extension into the installer. The extension stays a separate Chrome Web Store submission; the desktop UI's Settings page will link to the store listing.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Tauri 2.x shell (Rust) — one .exe / .dmg / .AppImage        │
│                                                              │
│  ┌────────────────────┐    ┌─────────────────────────────┐   │
│  │  WebView           │    │  Sidecar process            │   │
│  │  (React UI built   │◄──►│  dm-api (PyInstaller bundle)│   │
│  │   to apps/desktop/ │    │  ├─ FastAPI / uvicorn       │   │
│  │   dist, served by  │    │  ├─ yt-dlp (binary)         │   │
│  │   Tauri)           │    │  └─ ffmpeg (binary)         │   │
│  └────────────────────┘    └─────────────────────────────┘   │
│         ▲                            ▲                       │
│         │ http://127.0.0.1:<random>  │                       │
│         └────────────────────────────┘                       │
└──────────────────────────────────────────────────────────────┘
```

- **Shell** — Tauri 2.x in Rust. Owns the OS window, embeds the system webview (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux). Spawns and supervises the sidecar.
- **Sidecar** — `dm-api`, a single binary produced by PyInstaller that contains the FastAPI app, uvicorn, all Python deps, plus `yt-dlp` and `ffmpeg` as embedded resources. Listens on `127.0.0.1:<random>`.
- **Frontend** — the existing `apps/desktop` React app, built to `dist/` and consumed by Tauri as static assets. No dev server in the shipped product.
- **Browser extension** — unchanged. Continues to call `http://127.0.0.1:6543` because the user reinstalls/upgrades it independently and pinning a port for the extension is simpler than a discovery handshake. **In packaged mode the API still listens on `127.0.0.1:6543` so the extension keeps working unchanged.** The dynamic-port logic is only used when 6543 is already taken (single-user assumption).

## Components and Responsibilities

### 1. `apps/api` (small changes)

Responsibilities unchanged: HTTP API, probe orchestration, download worker, WebSocket progress. New responsibilities:

- **Port selection.** `main.py` accepts a `--port` CLI flag. Default behavior in packaged mode: try `6543`; if taken, bind to `127.0.0.1:0` (OS-assigned). Print the actual port as a single line `DM_PORT <N>` to stdout immediately after the server is listening, so the Tauri shell can parse it.
- **Bundled-binary discovery.** `ytdlp_probe.py` and `ytdlp_worker.py` resolve the yt-dlp/ffmpeg binary path in this order:
  1. Env var `DM_YTDLP_BIN` / `DM_FFMPEG_BIN` (set by Tauri shell to point at bundled binaries).
  2. `shutil.which("yt-dlp")` / `which("ffmpeg")` (dev mode on the contributor's machine).
- **Health endpoint** already exists; Tauri uses it to detect "API is up."

### 2. `apps/desktop` (small changes + UI polish pass)

- `src/api.ts`: replace the hardcoded `http://127.0.0.1:6543` constant with a helper that reads `window.__DM_API_PORT__` (number) injected by Tauri at app start. Fall back to `6543` so the Vite dev workflow still works when contributing.
- **UI polish pass.** Apply the `frontend-design` skill to the existing screens:
  - Improve type hierarchy and density (move from a generic dashboard look toward a focused pro-tool look).
  - Resizable docked side panel + details pane (drag handles).
  - Command palette (`⌘K` / `Ctrl K`) for actions: add URL, clear completed, retry failed, open downloads folder, paste URL.
  - Real empty / loading / error states for every list and panel.
  - Per-row context menu (right-click): pause, resume, retry, open file, open folder, copy source URL, delete.
  - Consistent icon set (lucide-react), consistent spacing scale, consistent state colors.

### 3. `apps/shell` (new Tauri project)

Layout:

```
apps/shell/
  src-tauri/
    Cargo.toml
    tauri.conf.json
    src/main.rs              # spawn sidecar, read DM_PORT, inject into webview, kill on quit
    binaries/                # PyInstaller output and yt-dlp/ffmpeg go here at build time
      dm-api-x86_64-pc-windows-msvc.exe
      dm-api-x86_64-apple-darwin
      dm-api-aarch64-apple-darwin
      dm-api-x86_64-unknown-linux-gnu
  package.json               # Tauri CLI invocation; serves apps/desktop in dev
```

Responsibilities:

- Build pipeline: in `package.json` `dev` script, run Vite dev server for `apps/desktop` AND start Tauri pointed at it. In `build`, build `apps/desktop` to `dist/`, then have Tauri bundle `dist/` plus the platform-matching sidecar binary.
- Runtime:
  1. On app start, spawn `binaries/dm-api-<triple>` as a sidecar (Tauri's `tauri-plugin-shell` `Sidecar` API).
  2. Read sidecar stdout line-by-line until a `DM_PORT <N>` line arrives (timeout 30 s; show an error dialog if the sidecar fails to bind).
  3. Inject the port via Tauri's `initialization_script` so `window.__DM_API_PORT__` exists before any React code runs.
  4. Load the bundled `index.html` from `apps/desktop/dist`.
  5. On window close: send SIGTERM to the sidecar; if it's still alive after 5 s, SIGKILL.

### 4. `build/pyinstaller/`

- `dm-api.spec`: PyInstaller spec that bundles the `dm_api` package as a one-file executable named `dm-api`. Uses `--add-binary` to embed the platform's `yt-dlp` and `ffmpeg` next to it, and a small bootstrap script that sets `DM_YTDLP_BIN` and `DM_FFMPEG_BIN` to point at the extracted binary paths before importing `dm_api`.
- Vendored binaries are downloaded by the CI workflow at build time from the official yt-dlp and FFmpeg release pages. Pinned versions live in `build/pyinstaller/binaries.lock` so builds are reproducible.

### 5. CI / Release workflow

- New `.github/workflows/release.yml` triggered on tags `v*`:
  - Matrix: `ubuntu-22.04`, `windows-2022`, `macos-13` (x86_64), `macos-14` (aarch64).
  - For each runner:
    1. Set up Python 3.14, Node 20, Rust stable.
    2. Run `pip install` + `pyinstaller` to produce `dm-api` for that platform.
    3. Copy the produced binary into `apps/shell/src-tauri/binaries/`.
    4. Run `npm install` in `apps/desktop`, build React.
    5. Run `tauri build` → produces the OS-native installer.
    6. Upload artifact.
  - A separate job collects all artifacts and attaches them to the GitHub Release.

## Data Flow

Sidecar lifecycle on app launch:

```
shell.main()
  → spawn sidecar(dm-api)
  → read stdout until "DM_PORT N" appears (or timeout 30s)
  → set webview pre-script: window.__DM_API_PORT__ = N
  → load apps/desktop/dist/index.html
  → user interacts; React calls http://127.0.0.1:N/api/...
  → API may shell out to embedded yt-dlp/ffmpeg
  → on window-close event, send SIGTERM to sidecar; await up to 5s; SIGKILL if needed
```

## Error Handling

- **Sidecar fails to start** (PyInstaller bundle corrupt, port permission denied, etc.): Tauri shows a native error dialog with the last 50 lines of sidecar stderr and a "Copy log" button. Window does not load the webview.
- **Sidecar starts but crashes mid-session**: shell detects the child exit, shows an in-app banner offering "Restart backend." Implements basic retry-with-backoff (max 3 attempts).
- **Port 6543 in use and OS refuses fallback bind** (extremely rare): same native dialog as above.
- **First-run binary extraction race** (PyInstaller one-file mode extracts to a temp dir on each start): handled by PyInstaller itself; we just have to make sure we don't try to invoke yt-dlp before extraction completes.

## Testing Strategy

- **Unit tests** for the new port-discovery, env-var-driven binary discovery, and sidecar bootstrap helper. Live in `apps/api/tests/`.
- **A single end-to-end "smoke" test per platform in CI**: install the built artifact in a clean VM, launch headless, hit `/api/health` over IPC, exit cleanly. Validates the bundle is functional without depending on YouTube.
- **No automated UI tests in v1.** Manual checklist in the spec for the UI polish pass.
- **Manual release checklist:** download each artifact, install on a clean OS, queue a YouTube download, verify it completes, verify the app exits cleanly and removes its sidecar.

## Implementation Phases

Build in this order; each phase is a working checkpoint we can stop at.

1. **Phase A — port and binary discovery in API.** API changes only. Verifiable by running `python -m dm_api.presentation.main --port 0` and confirming it prints `DM_PORT <N>`, plus a manual test that `DM_YTDLP_BIN=/path/to/yt-dlp` is respected.
2. **Phase B — desktop UI reads injected port.** React change + small dev-mode shim. Verifiable in the existing Vite + uvicorn dev workflow with no Tauri yet.
3. **Phase C — PyInstaller bundle.** New `build/pyinstaller/dm-api.spec` producing a runnable single binary on the dev machine (Linux first).
4. **Phase D — Tauri shell, Linux only.** New `apps/shell/` project; integrates the sidecar, ships a working `.AppImage`. Hand-to-anyone milestone for Linux.
5. **Phase E — UI polish pass.** Apply `frontend-design` skill across the existing screens.
6. **Phase F — Cross-platform CI.** Matrix builds for Windows and macOS, GitHub Releases artifacts.

Each phase ends with a runnable, demonstrable artifact and a commit.

## Open Questions

None blocking implementation. Items to decide later:

- Code signing / notarization (after v1 ships and we have real users hitting the SmartScreen warning).
- Auto-update channel (likely Tauri's `tauri-plugin-updater` against GitHub Releases).
- Whether to bundle a CA-signed cert for `127.0.0.1` so the webview can use HTTPS to the sidecar (probably unnecessary; the sidecar is loopback-only).
