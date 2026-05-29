# Desktop App Packaging — Design (Production)

**Date:** 2026-05-26
**Status:** Approved for implementation
**Scope:** Wrap the existing `apps/api` (FastAPI + Python) and `apps/desktop` (React + Vite) into a **production-grade** distributable desktop application that runs on Windows, macOS, and Linux without the user needing to install Python, Node, yt-dlp, or ffmpeg. Production means: code-signed, auto-updating, crash-reported, native installer UX, and a polished pro-tool UI.

## Goals

1. **One-click installer per OS.** Double-click installer, then double-click the app. No terminal, no Python install, no PATH setup.
2. **Native shell.** Own OS window via system webview. Tray icon, native notifications, keyboard shortcuts, proper window-state persistence.
3. **Trustable by the OS later.** v1 ships unsigned (saves $$ until there are real users). Code signing is wired into the CI pipeline but disabled by default; flipping a single flag turns it on once signing certs are obtained.
4. **Self-updating.** Users get bug fixes automatically (channel: stable). Update manifests are signed; the app verifies the signature before installing.
5. **Self-contained.** yt-dlp and ffmpeg ship inside the installer; no PATH lookups, no network downloads on first run.
6. **Observable.** Structured logs to a per-user file, opt-in crash reporting to a hosted service (Sentry), and a one-click "Copy diagnostics" action in Settings for bug reports.
7. **Pro-tool UI.** The existing React UI gets a polish pass to Illustrator-grade quality: density, type hierarchy, resizable docked panels, command palette, proper empty/loading/error states.

## Non-Goals

- Mobile (iOS/Android). Different code paths; not addressed here.
- Browser version. The Vite dev server stays for contributor workflow only; production users always get the desktop binary.
- Bundling the browser extension into the installer. The extension stays a separate Chrome Web Store submission. The desktop UI's Settings page links to the store listing.
- Plugin/extension API for third-party developers. Not in this phase.

## Cost (defaults to $0)

**v1 ships unsigned.** Total ongoing cost: **$0**. Distribution channel is GitHub Releases (free).

On first install, users will see a one-time OS security warning they need to click past:

- **Windows:** SmartScreen "unrecognized app" → click *More info* → *Run anyway*. Once.
- **macOS:** Gatekeeper "cannot check for malicious software" → right-click the `.dmg` → *Open* → confirm. Once.
- **Linux:** No warning. Just runs.

This matches the experience of most indie / open-source desktop apps shipped via GitHub Releases.

Signing and notarization (which remove the warning) are explicitly deferred to a later optional phase. When the project is ready to pay for trust, the table below shows the options:

| Item | Cost | What it removes |
|---|---|---|
| Apple Developer Program | $99 / year | macOS Gatekeeper warning |
| Azure Trusted Signing | ~$10 / month | Windows SmartScreen warning (recommended over $200/yr OV certs) |
| Sentry (crash reporting) | Free tier: 5k errors / mo | Nothing — adds crash visibility you wouldn't otherwise have |
| GitHub Releases | Free | (Already used for distribution) |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Tauri 2.x shell (Rust)                                      │
│                                                              │
│  ┌────────────────────┐    ┌─────────────────────────────┐   │
│  │  WebView           │    │  Sidecar process            │   │
│  │  (React UI, polish │◄──►│  dm-api (PyInstaller bundle)│   │
│  │   pass)            │    │  ├─ FastAPI / uvicorn       │   │
│  │                    │    │  ├─ yt-dlp (binary)         │   │
│  └────────────────────┘    │  └─ ffmpeg (binary)         │   │
│      ▲                     └─────────────────────────────┘   │
│      │ http://127.0.0.1:6543 (or random fallback)            │
│      │                                                       │
│  ┌──────────────────────────────────────┐                    │
│  │  Tray icon · Notifications ·         │                    │
│  │  Auto-updater · Window state         │                    │
│  └──────────────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────┘
                       │
                       │  signed update channel
                       ▼
            GitHub Releases (latest.json + artifacts)
```

- **Shell** — Tauri 2.x in Rust. Owns the OS window, embeds the system webview (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux). Spawns and supervises the sidecar. Owns the tray icon, notifications, and updater.
- **Sidecar** — `dm-api`, a single binary produced by PyInstaller that contains the FastAPI app, uvicorn, all Python deps, plus `yt-dlp` and `ffmpeg` as embedded resources. Listens on `127.0.0.1:6543` (falls back to a random port if 6543 is in use; that port is then injected into the webview).
- **Frontend** — the existing `apps/desktop` React app, built to `dist/` and consumed by Tauri as static assets.
- **Browser extension** — unchanged. Keeps calling `127.0.0.1:6543` because that's still the default port in packaged mode.

## Components and Responsibilities

### 1. `apps/api` (small changes)

Responsibilities unchanged: HTTP API, probe orchestration, download worker, WebSocket progress. New responsibilities:

- **Port selection.** `main.py` accepts a `--port` CLI flag. Default behavior in packaged mode: try `6543`; if taken, bind to `127.0.0.1:0` (OS-assigned). Print the actual port as a single line `DM_PORT <N>` to stdout immediately after the server is listening, so the Tauri shell can parse it.
- **Bundled-binary discovery.** `ytdlp_probe.py` and `ytdlp_worker.py` resolve the yt-dlp/ffmpeg binary path in this order:
  1. Env var `DM_YTDLP_BIN` / `DM_FFMPEG_BIN` (set by Tauri shell to point at bundled binaries).
  2. `shutil.which("yt-dlp")` / `which("ffmpeg")` (dev mode on the contributor's machine).
- **Structured logging.** Migrate from `print` / no-logging to `logging` with a JSON formatter. Log file path: per-OS standard data dir (`%APPDATA%/DownloadMgr/logs/api.log` on Windows, `~/Library/Logs/DownloadMgr/api.log` on macOS, `$XDG_STATE_HOME/DownloadMgr/logs/api.log` on Linux). Rotating at 5 MB, keeping 3 files.
- **Settings persistence.** Currently the API reads `DM_*` env vars. Add a `settings` table the UI can write through `/api/settings` (download dir, max parallel, default quality, theme, language). Existing env vars take precedence when set.
- **Opt-in crash reporting.** When the user opts in via Settings, install Sentry's Python SDK with a DSN read from a build-time env var. No data is sent unless the user opts in.

### 2. `apps/desktop` (small changes + UI polish pass)

- `src/api.ts`: replace the hardcoded `http://127.0.0.1:6543` constant with a helper that reads `window.__DM_API_PORT__` (number) injected by Tauri at app start. Fall back to `6543` so the Vite dev workflow still works when contributing.
- **UI polish pass.** Apply the `frontend-design` skill across the existing screens:
  - Improve type hierarchy and density (move from generic dashboard toward focused pro-tool).
  - Resizable docked side panel + details pane (drag handles, position persisted).
  - Command palette (`⌘K` / `Ctrl K`) for actions: add URL, clear completed, retry failed, open downloads folder, paste URL, open settings.
  - Real empty / loading / error states for every list and panel.
  - Per-row context menu (right-click): pause, resume, retry, open file, open folder, copy source URL, delete.
  - Consistent icon set (lucide-react), consistent 4 px spacing scale, consistent state colors.
  - Native-feeling drag-to-reorder for the queue.
  - Light/dark/system theme; system follows OS by default.
  - Settings screen (download dir picker, max parallel, default quality, theme, language, opt-in crash reporting, "Check for updates", "Copy diagnostics", about/version).

### 3. `apps/shell` (new Tauri project)

Layout:

```
apps/shell/
  src-tauri/
    Cargo.toml
    tauri.conf.json
    src/
      main.rs            # entry: tauri::Builder
      sidecar.rs         # spawn + supervise dm-api, parse DM_PORT, kill on quit
      tray.rs            # tray icon + menu (show, pause all, quit)
      updater.rs         # plumbing for tauri-plugin-updater
      notifications.rs   # bridge: API "download completed" event → native notification
    binaries/            # populated by CI before build
      dm-api-x86_64-pc-windows-msvc.exe
      dm-api-x86_64-apple-darwin
      dm-api-aarch64-apple-darwin
      dm-api-x86_64-unknown-linux-gnu
    icons/               # .ico, .icns, .png in all required sizes
  package.json           # Tauri CLI entry; serves apps/desktop in dev
```

Responsibilities:

- **Sidecar lifecycle.** Spawn on app start. Read stdout until `DM_PORT <N>` appears (timeout 30 s). Inject port via `initialization_script`. Send SIGTERM on app quit; SIGKILL after 5 s. On unexpected exit during a session, show an in-app banner offering "Restart backend"; retry with backoff (max 3 attempts).
- **Tray icon.** Standard tray icon with menu: Show / Pause All / Resume All / Quit. Closing the window hides to tray on Windows + Linux; on macOS closing follows the platform convention (app stays in dock).
- **Native notifications.** Subscribe to the WebSocket progress stream; on `status: completed` post a native notification with the file name and an "Open folder" action.
- **Auto-updater.** Uses `tauri-plugin-updater` against a `latest.json` hosted in GitHub Releases. Updates are signed with a private key (kept in CI secrets); the public key is baked into the binary and verifies the manifest signature before installing.
- **Single-instance lock.** Uses `tauri-plugin-single-instance`. Launching a second copy focuses the existing window instead.
- **Deep-link handler.** Registers a custom URL scheme (`downloadmgr://add?url=...`) so the browser extension can later use a direct desktop handoff instead of HTTP.

### 4. `build/pyinstaller/`

- `dm-api.spec`: PyInstaller spec that bundles `dm_api` as a one-file executable named `dm-api`. Uses `--add-binary` to embed the platform's `yt-dlp` and `ffmpeg` binaries. A small bootstrap module runs first and sets `DM_YTDLP_BIN` and `DM_FFMPEG_BIN` to point at the extracted binary paths before importing `dm_api`.
- Vendored binaries are downloaded by the CI workflow at build time from official yt-dlp and FFmpeg release pages. Pinned versions live in `build/pyinstaller/binaries.lock` with SHA256 checksums verified before bundling.
- `dm-api.spec` is identical across platforms; CI selects the right binary URLs per runner.

### 5. CI / Release workflow

`.github/workflows/release.yml` triggered on tags `v*`:

1. **Build matrix** — `ubuntu-22.04`, `windows-2022`, `macos-13` (x86_64), `macos-14` (aarch64).
2. **For each runner:**
   1. Set up Python 3.14, Node 20, Rust stable.
   2. Download + verify pinned yt-dlp and ffmpeg for the platform.
   3. Run PyInstaller → produces `dm-api` (or `dm-api.exe`).
   4. Copy the produced binary into `apps/shell/src-tauri/binaries/`.
   5. Run `npm install` in `apps/desktop`, build React to `dist/`.
   6. **Windows runner:** sign `dm-api.exe` with the code-signing cert (cert imported from `WINDOWS_SIGNING_CERT_BASE64` secret).
   7. **macOS runner:** sign the binary with the Developer ID cert (from `APPLE_SIGNING_CERT_BASE64`).
   8. Run `tauri build` → produces native installer. Tauri itself signs the outer installer and macOS app bundle.
   9. **macOS:** notarize via `notarytool` (Apple ID + app-specific password from secrets).
   10. Upload artifacts.
3. **Aggregate job** — collects all artifacts, generates an updater `latest.json` (containing signed download URLs), publishes to GitHub Release.

CI secrets required:
- `WINDOWS_SIGNING_CERT_BASE64`, `WINDOWS_SIGNING_PASSWORD`
- `APPLE_SIGNING_CERT_BASE64`, `APPLE_SIGNING_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD`
- `TAURI_UPDATER_PRIVATE_KEY`, `TAURI_UPDATER_KEY_PASSWORD`
- `SENTRY_DSN` (optional; baked into binary at build time)

## Data Flow

On app launch:

```
shell.main()
  → check single-instance lock (focus existing if running)
  → spawn sidecar(dm-api)
  → read stdout until "DM_PORT N" (timeout 30 s)
  → set webview pre-script: window.__DM_API_PORT__ = N
  → load apps/desktop/dist/index.html
  → register tray icon
  → subscribe to /api/ws/progress
  → check updater (silent; prompt if update available)
  → user interacts; React calls http://127.0.0.1:N/api/...
  → API may shell out to embedded yt-dlp/ffmpeg
  → completed download → native notification
  → window close → hide to tray (Win/Linux) OR follow macOS convention
  → Quit → SIGTERM to sidecar, await 5s, SIGKILL if needed
```

## Error Handling

- **Sidecar fails to start** (bundle corrupt, port permission, etc.): native error dialog with last 50 lines of sidecar stderr and a "Copy log" button. Window does not load the webview.
- **Sidecar crashes mid-session**: shell detects child exit, shows in-app banner offering "Restart backend." Retry with backoff (max 3 attempts).
- **Updater can't reach GitHub**: silent failure; user can manually click "Check for updates" in Settings.
- **Notarization fails in CI**: release blocks; artifact is not published. CI surfaces the notarization log.
- **Download fails mid-stream**: existing behavior (status=failed + error_message). UI shows the row in the failed list with retry / delete actions.
- **Unhandled exception in API**: caught by FastAPI exception handler, logged, reported to Sentry (if opted in), surfaced to the UI as a toast with "Copy details" action.

## Testing Strategy

- **Unit tests** for port-discovery, env-var binary discovery, sidecar bootstrap helper, settings persistence. Live in `apps/api/tests/`.
- **Integration test** of the PyInstaller bundle: build it in CI, run it, hit `/api/health`, kill it, assert clean exit. Validates the bundle is functional without YouTube dependency.
- **End-to-end smoke test per platform in CI**: install the artifact in a clean VM, launch headless, hit `/api/health` over IPC, exit cleanly.
- **Updater integration test**: stand up a local `latest.json` server, simulate an upgrade, verify the new version replaces the old one.
- **Manual release checklist** (in `build/release/CHECKLIST.md`): install each artifact on a clean OS, queue a YouTube download, verify it completes, verify tray icon works, verify auto-updater detects a stub newer version, verify "Copy diagnostics" produces a usable log bundle.

## Implementation Phases

Each phase ends with a runnable, demonstrable artifact and a commit.

1. **Phase A — Port and binary discovery in API.** API changes only. Verifiable by running `python -m dm_api.presentation.main --port 0` and confirming it prints `DM_PORT <N>`, plus a manual test that `DM_YTDLP_BIN=/path/to/yt-dlp` is respected. Adds structured logging.
2. **Phase B — Desktop UI reads injected port + settings API.** React change + small dev-mode shim + new Settings screen scaffold. Verifiable in the existing Vite + uvicorn dev workflow with no Tauri yet.
3. **Phase C — PyInstaller bundle.** New `build/pyinstaller/dm-api.spec` producing a runnable single binary on the dev machine (Linux first). Includes the bootstrap that sets `DM_YTDLP_BIN`/`DM_FFMPEG_BIN`.
4. **Phase D — Tauri shell, Linux only.** New `apps/shell/` project. Integrates the sidecar, ships a working `.AppImage`. Includes tray icon, native notifications, single-instance lock. **Hand-to-anyone milestone for Linux.**
5. **Phase E — UI polish pass.** Apply the `frontend-design` skill across the existing screens. Command palette, resizable panels, context menus, real empty/loading/error states, settings UI complete.
6. **Phase F — Cross-platform CI + auto-updater (UNSIGNED).** Matrix builds for Windows and macOS, `tauri-plugin-updater` wired to GitHub Releases, signing skeleton in place but signing steps are gated behind a CI env flag (`DM_SIGN_ARTIFACTS=true`) that defaults to false. **Hand-to-anyone milestone for all three OSes — users click past one OS warning on first install.**
7. **Phase G — Crash reporting + telemetry opt-in.** Sentry integration in both API (Python SDK) and shell (Rust SDK). Opt-in toggle in Settings; off by default. Free tier covers this.
8. **Phase H (optional, deferred) — Code signing.** Obtain Apple Developer + Windows signing cert / Azure Trusted Signing, store secrets in CI, flip `DM_SIGN_ARTIFACTS=true`. No code changes needed — the pipeline was built for it in Phase F.

## Open Questions (decide before Phase F)

- **Apple Developer Program account** — does the project have one, or does the user need to create it ($99 / yr)?
- **Windows code signing cert** — purchase OV cert from Sectigo/SSL.com (~$200/yr) or use Azure Trusted Signing (~$10/mo, easier)?
- **Sentry DSN** — set up a free-tier project before Phase G, or defer crash reporting entirely?
- **Update channel cadence** — auto-check on launch + every 6 hours, or only on launch?
