# Plan 3 — UI Polish + Production Shell Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the working Plan-2 AppImage from "it boots and downloads" to "feels like a real desktop app." Two parallel tracks — Tauri shell production features (tray icon, native notifications, single-instance lock, theme bridge) and a React UI polish pass (design-system foundation, refined sidebar + downloads list, real empty/loading/error states, per-row context menu).

**Architecture:** No structural changes. All work happens inside `apps/desktop/` (React UI) and `apps/shell/` (Tauri shell). The shell tasks use existing Tauri 2.x plugins — `tauri-plugin-single-instance`, `tauri-plugin-notification`, and Tauri's built-in tray icon API. The UI polish tasks apply the `frontend-design` skill on existing components without changing the data flow.

**Tech Stack:** Continues to be Tauri 2.x + Rust, React + Vite + TypeScript + Tailwind. New plugins: `tauri-plugin-single-instance@2`, `tauri-plugin-notification@2`. Icon source: lucide-react (already present, audit and standardise).

**Spec:** `docs/superpowers/specs/2026-05-26-desktop-app-packaging-design.md` — Phase E (UI polish) plus the parts of Phase D that were deferred from Plan 2 (tray, notifications, single-instance).

**Out of scope (deferred to Plan 4):** Settings UI screen + `/api/settings` REST endpoint, command palette (Ctrl+K), drag-resize docked panels, deep-link handler (`downloadmgr://`), cross-platform CI, auto-updater, Sentry crash reporting.

---

## File Structure

**New files (Tauri shell, 3):**

- `apps/shell/src/tray.rs` — tray icon, menu, click-to-show window.
- `apps/shell/src/notifications.rs` — listen for completed downloads on the API's WebSocket, fire native notifications.
- `apps/shell/capabilities/default.json` — Tauri 2.x ACL allowing the new plugin permissions (notification, single-instance lifecycle, tray events).

**Modified files (Tauri shell, 4):**

- `apps/shell/Cargo.toml` — add `tauri-plugin-single-instance` and `tauri-plugin-notification` deps.
- `apps/shell/src/main.rs` (or `lib.rs` depending on current layout) — register the new plugins, wire tray + notifications, install single-instance lock.
- `apps/shell/tauri.conf.json` — declare the tray icon resource and the notification plugin.
- `apps/shell/icons/tray.png` — 32×32 monochrome tray glyph (replaces the placeholder 256×256 product icon for the tray-only context).

**New files (React UI design system, 2):**

- `apps/desktop/src/design/tokens.ts` — TypeScript module exporting design tokens (color, spacing, type, radius, motion) as a single source of truth.
- `apps/desktop/src/design/tokens.css` — same tokens as CSS custom properties (`--dm-color-bg-elevated`, etc.).

**Modified files (React UI, ~8):**

- `apps/desktop/src/index.css` — import `design/tokens.css`; remove ad-hoc theme variables.
- `apps/desktop/src/App.tsx` — adopt the new tokens for layout shell + theme switcher.
- `apps/desktop/src/components/Sidebar.tsx` — refined visual hierarchy, active/hover states, icon alignment.
- `apps/desktop/src/components/DownloadRow.tsx` — refined row layout, real per-row hover/focus, right-click context menu.
- `apps/desktop/src/components/StatusBadge.tsx` — refined badge palette tied to design tokens.
- `apps/desktop/src/components/ProgressBar.tsx` — refined animation + indeterminate state.
- `apps/desktop/src/components/AddDownloadDialog.tsx` — refined typography + form rhythm.
- `apps/desktop/src/components/EmptyState.tsx` — NEW component, plus references from every list view.

---

## Task 1: Single-instance lock in the Tauri shell

Launching the AppImage twice currently spawns two windows that both try to bind port 6543. The second one falls back to a random port (Plan 1's `_bind` behavior) so the app technically still works, but each instance has its own SQLite DB and the WebSockets cross-talk. Add a single-instance lock that focuses the existing window instead of spawning a second one.

**Files:**
- Modify: `apps/shell/Cargo.toml`
- Modify: `apps/shell/src/main.rs` (or `lib.rs` — whichever holds `tauri::Builder::default()`)

- [ ] **Step 1.1: Add the dependency**

In `apps/shell/Cargo.toml`, under `[dependencies]`:

```toml
tauri-plugin-single-instance = { version = "2", features = ["deep-link"] }
```

(The `deep-link` feature is forward-looking — Plan 4 will register a `downloadmgr://` URL scheme.)

- [ ] **Step 1.2: Register the plugin**

Open the file containing `tauri::Builder::default()` (likely `apps/shell/src/main.rs` or `apps/shell/src/lib.rs`). Find the `Builder` chain and add the plugin registration **as the first plugin** (per Tauri docs, single-instance must be registered before others):

```rust
.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
    // Second-instance launch: bring the existing window to front.
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    let _ = (args, cwd);
}))
```

Add the necessary imports:
```rust
use tauri::Manager;
```
(or merge into existing `use tauri::...` if it's already there).

- [ ] **Step 1.3: Manual smoke test**

Build a debug binary (faster than full release for testing):
```bash
cd /home/robotics1025/Documents/project/apps/shell
cargo tauri build --debug 2>&1 | tail -10
```

Locate the resulting binary (`target/debug/bundle/appimage/DownloadMgr_*.AppImage` or `target/debug/downloadmgr-shell`). Launch it twice:
```bash
./target/debug/downloadmgr-shell &
sleep 5
./target/debug/downloadmgr-shell &
sleep 3
ps aux | grep -c "downloadmgr-shell" | head -1
```

Expected: only **one** `downloadmgr-shell` process running (the second invocation exited quickly after talking to the first). Kill it:
```bash
pkill -f downloadmgr-shell
```

- [ ] **Step 1.4: Commit**

```bash
cd /home/robotics1025/Documents/project
git add apps/shell/Cargo.toml apps/shell/Cargo.lock apps/shell/src/main.rs apps/shell/src/lib.rs 2>/dev/null
# (Add whichever main/lib file you actually modified.)
git commit -m "feat(shell): single-instance lock — second launch focuses existing window"
```

---

## Task 2: Tray icon with Show / Quit menu

Add a system tray icon. Clicking it shows the window; right-clicking offers Show / Quit. Closing the window hides to tray instead of quitting (matches IDM / qBittorrent UX).

**Files:**
- Create: `apps/shell/icons/tray.png` (32×32 monochrome glyph)
- Create: `apps/shell/src/tray.rs`
- Modify: `apps/shell/src/main.rs` (or `lib.rs`)
- Modify: `apps/shell/tauri.conf.json`

- [ ] **Step 2.1: Generate the tray glyph**

Tray icons must be small and high-contrast. Generate a 32×32 monochrome download-arrow PNG:

```bash
python3 << 'EOF' > /home/robotics1025/Documents/project/apps/shell/icons/tray.png
import struct, zlib, sys
w, h = 32, 32
# Solid white download arrow on transparent background.
def pixel(x, y):
    cx, cy = w // 2, h // 2 - 2
    # Vertical bar of the arrow.
    if abs(x - cx) <= 2 and 6 <= y <= 18:
        return (255, 255, 255, 255)
    # Arrowhead triangle.
    if 18 <= y <= 24:
        spread = y - 18
        if abs(x - cx) <= 5 + spread and abs(x - cx) >= 0:
            return (255, 255, 255, 255)
    # Tray (the platform underline).
    if 26 <= y <= 28 and 4 <= x <= 27:
        return (255, 255, 255, 255)
    return (0, 0, 0, 0)

raw = b''
for y in range(h):
    raw += b'\x00'
    for x in range(w):
        r, g, b, a = pixel(x, y)
        raw += bytes((r, g, b, a))

def chunk(t, d):
    return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)

png = (
    b'\x89PNG\r\n\x1a\n'
    + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))  # RGBA
    + chunk(b'IDAT', zlib.compress(raw))
    + chunk(b'IEND', b'')
)
sys.stdout.buffer.write(png)
EOF

file /home/robotics1025/Documents/project/apps/shell/icons/tray.png
```
Expected: `PNG image data, 32 x 32, 8-bit/color RGBA, non-interlaced`.

- [ ] **Step 2.2: Implement `src/tray.rs`**

```rust
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

/// Install the system tray icon. The icon source is the bundled
/// `icons/tray.png` resource declared in `tauri.conf.json`.
pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Show DownloadMgr", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu: Menu<Wry> = Menu::with_items(app, &[&show_item, &quit_item])?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().cloned().ok_or_else(|| {
            tauri::Error::AssetNotFound("default window icon".into())
        })?)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
```

- [ ] **Step 2.3: Make window close hide-to-tray**

In the file containing `WebviewWindowBuilder::new("main", ...)`, after the window is built, intercept the close event:

```rust
let window_clone = window.clone();
window.on_window_event(move |event| {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        // Hide instead of quitting — the user can re-show via the tray.
        let _ = window_clone.hide();
        api.prevent_close();
    }
});
```

(`window` is the `WebviewWindow` returned by `.build()`.)

- [ ] **Step 2.4: Register the tray module and invoke install**

In `apps/shell/src/main.rs` (or `lib.rs`), add `mod tray;` near the other module declarations. In the `tauri::Builder::default().setup(|app| { ... })` block, after the sidecar starts successfully (the `Ok(port)` branch), add:

```rust
if let Err(e) = tray::install(&handle) {
    eprintln!("failed to install tray icon: {e}");
}
```

- [ ] **Step 2.5: Update `tauri.conf.json`**

Add the tray icon to the bundle and declare the icon resource. Find the `"bundle"` block and add to its `"icon"` array if not already present:

```json
  "bundle": {
    "icon": ["icons/icon.png", "icons/tray.png"],
    ...
  }
```

- [ ] **Step 2.6: Build and verify**

```bash
cd /home/robotics1025/Documents/project/apps/shell
cargo tauri build --debug 2>&1 | tail -10
./target/debug/bundle/appimage/DownloadMgr_*.AppImage &
sleep 6
# Look at the system tray (top right on GNOME / right corner on KDE) — the
# arrow glyph should be visible. Right-clicking shows the menu.
echo "Check the tray now. The icon should be visible."
sleep 8
pkill -f DownloadMgr || true
```

Note: on some Linux desktop environments (vanilla GNOME without AppIndicator extension), tray icons don't render natively — that's a desktop-environment limitation, not a bug. On Ubuntu / KDE / Cinnamon / XFCE / Mate, it should appear.

- [ ] **Step 2.7: Commit**

```bash
cd /home/robotics1025/Documents/project
git add apps/shell/src/tray.rs apps/shell/icons/tray.png \
        apps/shell/src/main.rs apps/shell/src/lib.rs 2>/dev/null \
        apps/shell/tauri.conf.json
git commit -m "feat(shell): tray icon with Show / Quit menu, hide-on-close"
```

---

## Task 3: Native notifications on download completion

When a download finishes, post a native OS notification (`notify-send` on Linux, banner on Windows/macOS). Click the notification → focus the window.

**Files:**
- Modify: `apps/shell/Cargo.toml`
- Modify: `apps/shell/tauri.conf.json`
- Create: `apps/shell/src/notifications.rs`
- Modify: `apps/shell/src/main.rs` (or `lib.rs`)

- [ ] **Step 3.1: Add the plugin dependency**

In `apps/shell/Cargo.toml` `[dependencies]`:

```toml
tauri-plugin-notification = "2"
```

Add to `tauri.conf.json` under `"plugins"` (create the block if missing):

```json
  "plugins": {
    "notification": {}
  },
```

- [ ] **Step 3.2: Implement `src/notifications.rs`**

The sidecar already broadcasts download progress over a WebSocket (the React UI subscribes to it). The shell will also subscribe and watch for transitions to `status: completed` / `status: failed`. On match, fire a notification via the plugin.

```rust
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::time::sleep;

/// Snapshot DTO matching apps/api/src/dm_api/presentation/schemas/progress_dto.py.
/// We only care about a couple of fields.
#[derive(Debug, Deserialize)]
struct ProgressSnapshot {
    download_id: String,
    status: String,
    #[serde(default)]
    downloaded_bytes: u64,
}

/// Spawn a background task that subscribes to the API's WebSocket and posts a
/// native notification for every download transitioning to a terminal state.
pub fn install(app: &AppHandle, port: u16) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        // Track which task IDs we have already notified for — avoid duplicates
        // when the API re-broadcasts a status.
        let mut notified: std::collections::HashSet<String> = std::collections::HashSet::new();

        loop {
            let url = format!("ws://127.0.0.1:{port}/api/ws/progress");
            match tokio_tungstenite::connect_async(&url).await {
                Ok((mut ws, _)) => {
                    use futures_util::StreamExt;
                    while let Some(message) = ws.next().await {
                        let Ok(msg) = message else { break; };
                        if let tokio_tungstenite::tungstenite::Message::Text(text) = msg {
                            if let Ok(snap) = serde_json::from_str::<ProgressSnapshot>(&text) {
                                if snap.status == "completed" && notified.insert(snap.download_id.clone()) {
                                    let _ = handle
                                        .notification()
                                        .builder()
                                        .title("DownloadMgr")
                                        .body("Download completed")
                                        .show();
                                } else if snap.status == "failed" && notified.insert(snap.download_id.clone()) {
                                    let _ = handle
                                        .notification()
                                        .builder()
                                        .title("DownloadMgr")
                                        .body("Download failed")
                                        .show();
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("notifications: websocket connect failed: {e}");
                }
            }
            // Reconnect after a short backoff.
            sleep(Duration::from_secs(3)).await;
        }
    });
}
```

Add to `Cargo.toml`:
```toml
tokio-tungstenite = "0.21"
futures-util = "0.3"
```

- [ ] **Step 3.3: Register and invoke from `main.rs`**

Near other module declarations:
```rust
mod notifications;
```

In the `Builder::default()` chain:
```rust
.plugin(tauri_plugin_notification::init())
```

In the `setup(|app| { ... })` block, in the sidecar `Ok(port)` branch (after the window is built):
```rust
notifications::install(&handle, port);
```

- [ ] **Step 3.4: Build and verify**

```bash
cd /home/robotics1025/Documents/project/apps/shell
cargo tauri build --debug 2>&1 | tail -10
./target/debug/bundle/appimage/DownloadMgr_*.AppImage &
sleep 8
# In another terminal (or use the UI), queue a tiny test download via
# the API. When it completes, a native notification should appear.
echo "Queue a test download from the UI. A notification should appear when it completes."
sleep 60
pkill -f DownloadMgr || true
```

- [ ] **Step 3.5: Commit**

```bash
cd /home/robotics1025/Documents/project
git add apps/shell/Cargo.toml apps/shell/Cargo.lock \
        apps/shell/tauri.conf.json \
        apps/shell/src/notifications.rs \
        apps/shell/src/main.rs apps/shell/src/lib.rs 2>/dev/null
git commit -m "feat(shell): native notification when a download completes or fails"
```

---

## Task 4: Design system foundation (tokens)

The current React UI uses ad-hoc Tailwind utilities + a handful of inline styles. To make the polish pass tractable, introduce a token layer first: CSS variables for color/space/type/radius/motion, mirrored by a TypeScript module for inline-style use. Every later UI task references these instead of literals.

**Files:**
- Create: `apps/desktop/src/design/tokens.css`
- Create: `apps/desktop/src/design/tokens.ts`
- Modify: `apps/desktop/src/index.css` (import the tokens)

- [ ] **Step 4.1: Apply the `frontend-design` skill to define the system**

Use `frontend-design` to design the token system. Brief: a dark-first pro-tool palette in the spirit of Linear, Raycast, and Figma. Two themes (dark and light). Tokens to define:

- **Color** (semantic, not raw hex):
  - `bg.app`, `bg.elevated`, `bg.recessed`, `bg.hover`, `bg.selected`
  - `fg.primary`, `fg.secondary`, `fg.tertiary`, `fg.disabled`
  - `border.subtle`, `border.default`, `border.strong`, `border.focus`
  - `accent.primary`, `accent.primary.hover`, `accent.subtle`
  - `status.success`, `status.warning`, `status.danger`, `status.info`
  - Each with `.surface` and `.text` variants where needed.
- **Spacing**: 4px scale — `space.1` (4) through `space.10` (40).
- **Typography**: type scale (`text.xs` 11px / `text.sm` 13px / `text.md` 14px / `text.lg` 16px / `text.xl` 20px / `text.2xl` 28px), font weights (`weight.regular` 400, `weight.medium` 500, `weight.semibold` 600), line heights.
- **Radius**: `radius.sm` 4px, `radius.md` 8px, `radius.lg` 12px, `radius.full` 9999px.
- **Motion**: `motion.fast` 120ms, `motion.normal` 180ms, `motion.slow` 260ms, easing `cubic-bezier(0.16, 1, 0.3, 1)`.

Write `tokens.css` using CSS custom properties under `[data-theme="dark"]` and `[data-theme="light"]` selectors. Write `tokens.ts` as a `const` object mirroring the same names with literal values for inline use (e.g. `tokens.color.bg.app === "var(--dm-color-bg-app)"`).

- [ ] **Step 4.2: Wire `tokens.css` into the app**

In `apps/desktop/src/index.css`, replace the existing `:root` block (if any) with:

```css
@import "./design/tokens.css";

:root {
  color-scheme: dark;
}

html, body, #root {
  height: 100%;
  margin: 0;
  background: var(--dm-color-bg-app);
  color: var(--dm-color-fg-primary);
  font-family: var(--dm-font-family);
  font-size: var(--dm-text-md);
}
```

- [ ] **Step 4.3: Verify dev mode still renders**

```bash
cd /home/robotics1025/Documents/project/apps/desktop
nohup npm run dev > /tmp/vite.log 2>&1 &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f "vite" || true
```

Expected: 200. Visual smoke is via the next task (which actually applies the tokens to components).

- [ ] **Step 4.4: Commit**

```bash
cd /home/robotics1025/Documents/project
git add apps/desktop/src/design/tokens.css \
        apps/desktop/src/design/tokens.ts \
        apps/desktop/src/index.css
git commit -m "feat(desktop): design system tokens (color, spacing, type, radius, motion)"
```

---

## Task 5: Polish Sidebar + DownloadRow + StatusBadge + ProgressBar

The five most-visible components, refined using the new tokens. Use the `frontend-design` skill.

**Files:**
- Modify: `apps/desktop/src/components/Sidebar.tsx`
- Modify: `apps/desktop/src/components/DownloadRow.tsx`
- Modify: `apps/desktop/src/components/StatusBadge.tsx`
- Modify: `apps/desktop/src/components/ProgressBar.tsx`

- [ ] **Step 5.1: Apply `frontend-design` to the Sidebar**

Brief: dense pro-tool sidebar. ~220px wide. Sections: top header (logo + product name), download-state filters (All / Active / Paused / Completed / Failed) with count badges, divider, Categories section (Video / Documents / Compressed / Audio / Images / Software / Others) with count badges, bottom utility group (Scheduler / Browser Extension / Settings).

Visual rules:
- Active item: `bg.selected` with `border-left` 2px in `accent.primary`.
- Hover: `bg.hover`. Transition 120ms.
- Count badges: `bg.recessed`, `fg.tertiary`, `text.xs`, monospace tabular-nums.
- Icons: lucide-react, 16px, color `fg.tertiary` (inactive) / `fg.primary` (active).
- Line height tight (1.2) to fit more items above the fold.

- [ ] **Step 5.2: Apply `frontend-design` to DownloadRow**

Brief: each row is a horizontal strip ~64px tall. Left: 96×54 thumbnail (16:9), absolute-positioned duration pill bottom-right. Center: two lines — title (`text.md weight.medium fg.primary`, truncate) and meta (`text.xs fg.tertiary`, format `1080p · MP4 · 13.09 MB / 13.09 MB`). Right: status badge or progress bar (depending on state), then a vertical 3-dot menu button (24×24, opens context menu).

States:
- Hover: row background lifts to `bg.elevated`, meta becomes `fg.secondary`.
- Selected: `bg.selected` with `border-left` 2px in `accent.primary`.
- Per-row context menu (right-click OR click on 3-dot): Open, Open Folder, Copy URL, Pause/Resume, Retry, Delete. Build the menu as a simple absolutely-positioned `<div>` with `bg.elevated` + `border.default` + `radius.md` + a 4px outer shadow.

- [ ] **Step 5.3: Apply `frontend-design` to StatusBadge**

Brief: small pills with semantic color. States: `pending` (info), `downloading` (info, with subtle pulse), `paused` (warning), `completed` (success), `failed` (danger), `queued` (subtle). Layout: 4px horizontal padding, 2px vertical, `text.xs weight.medium`, `radius.full`, uppercase label.

- [ ] **Step 5.4: Apply `frontend-design` to ProgressBar**

Brief: 4px tall track. Track color `bg.recessed`. Fill color `accent.primary`. Border radius `radius.full`. Indeterminate state: animated shimmer (200ms ease-in-out, repeats). Determinate animation: 180ms ease-out width transition. Show percentage text aligned right above the bar (`text.xs fg.tertiary`).

- [ ] **Step 5.5: Manual smoke test**

```bash
cd /home/robotics1025/Documents/project/apps/desktop
npx tsc --noEmit
nohup npm run dev > /tmp/vite.log 2>&1 &
sleep 6
echo "Open http://localhost:5173 in a browser and visually verify:"
echo "  - Sidebar filters have hover + active states"
echo "  - Download rows have thumbnails, two-line meta, status badges"
echo "  - Right-clicking a row opens a context menu"
echo "  - Status badges are coloured per state"
sleep 30
pkill -f vite || true
```

- [ ] **Step 5.6: Commit**

```bash
cd /home/robotics1025/Documents/project
git add apps/desktop/src/components/Sidebar.tsx \
        apps/desktop/src/components/DownloadRow.tsx \
        apps/desktop/src/components/StatusBadge.tsx \
        apps/desktop/src/components/ProgressBar.tsx
git commit -m "feat(desktop): polish sidebar, download row, status badge, progress bar"
```

---

## Task 6: Empty / loading / error states

Every list view currently shows a blank white area when there's no data. Add purposeful empty states (with illustration + helper copy + primary action) and skeleton loaders while fetching.

**Files:**
- Create: `apps/desktop/src/components/EmptyState.tsx`
- Create: `apps/desktop/src/components/SkeletonRow.tsx`
- Modify: `apps/desktop/src/App.tsx` (or wherever the downloads list lives) — render `<EmptyState>` when list is empty, `<SkeletonRow>` stack while loading.
- Modify: `apps/desktop/src/hooks/useDownloads.ts` if it doesn't already expose a `loading` flag.

- [ ] **Step 6.1: Apply `frontend-design` to `EmptyState.tsx`**

Brief: centered column, max 360px wide. Top: a lucide icon (e.g. `Inbox` for the All filter, `Download` for Active, `CheckCircle` for Completed, `AlertCircle` for Failed) at 48×48, color `fg.tertiary`. Below: title (`text.lg weight.semibold fg.primary`), helper copy (`text.sm fg.tertiary`, two lines max). Below that: a primary call-to-action button (the action depends on the context — e.g. "Paste URL" or "Browse downloads").

Accept props:
```typescript
type EmptyStateProps = {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  body: string;
  cta?: { label: string; onClick: () => void };
};
```

- [ ] **Step 6.2: Apply `frontend-design` to `SkeletonRow.tsx`**

Brief: a placeholder row matching `DownloadRow`'s dimensions. Thumbnail position: rectangle filled with `bg.recessed`, slow shimmer animation. Two text lines as rounded bars (full-width and 60%-width) in `bg.recessed`. Render N of these inside a stack while `loading` is true.

- [ ] **Step 6.3: Wire into the downloads list**

In `App.tsx` (or the list component), the render logic becomes:

```typescript
if (loading) {
  return (
    <>
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </>
  );
}
if (downloads.length === 0) {
  return (
    <EmptyState
      icon={Inbox}
      title="No downloads yet"
      body="Add a URL above, or use the browser extension to send media here."
      cta={{ label: "Paste URL", onClick: handlePasteUrl }}
    />
  );
}
return downloads.map(d => <DownloadRow key={d.id} download={d} />);
```

Tailor the empty state per filter (Active / Completed / Failed have different copy and icons).

- [ ] **Step 6.4: Add an error-state path**

When `useDownloads` returns an error (API unreachable, etc.), render a third variant:

```typescript
if (error) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Can't reach DownloadMgr"
      body={`The backend on ${apiBase} isn't responding. ${error.message}`}
      cta={{ label: "Retry", onClick: refetch }}
    />
  );
}
```

- [ ] **Step 6.5: Verify**

```bash
cd /home/robotics1025/Documents/project/apps/desktop
npx tsc --noEmit
nohup npm run dev > /tmp/vite.log 2>&1 &
sleep 6
echo "Visually verify:"
echo "  - With the API down: error state shows with Retry"
echo "  - With API up but no downloads: empty state with Paste URL CTA"
echo "  - During initial fetch: 3 skeleton rows pulse"
sleep 30
pkill -f vite || true
```

- [ ] **Step 6.6: Commit**

```bash
cd /home/robotics1025/Documents/project
git add apps/desktop/src/components/EmptyState.tsx \
        apps/desktop/src/components/SkeletonRow.tsx \
        apps/desktop/src/App.tsx \
        apps/desktop/src/hooks/useDownloads.ts
git commit -m "feat(desktop): empty, loading skeleton, and error states for download lists"
```

---

## Task 7: Polish AddDownloadDialog + theme switcher

Final two polish targets. The add-download dialog is the second-most-touched UI surface (after the downloads list). The theme switcher honors OS preference by default and persists the user's choice in localStorage.

**Files:**
- Modify: `apps/desktop/src/components/AddDownloadDialog.tsx`
- Modify: `apps/desktop/src/App.tsx` (theme switcher)
- Create: `apps/desktop/src/hooks/useTheme.ts`

- [ ] **Step 7.1: Apply `frontend-design` to AddDownloadDialog**

Brief: modal overlay (40% black, blur 8px backdrop). Card centered, 480px wide, `bg.elevated`, `radius.lg`, 24px padding. Top: title `text.lg weight.semibold` + close button (top-right, `X` icon, 32×32 button). Middle: form. Single full-width text input for URL with `bg.recessed`, `border.default`, focus → `border.focus`. Below: row of preset action buttons (Paste from clipboard, Best quality, Audio only). Bottom-right: Cancel + primary Add button. Keyboard: Enter submits, Escape closes.

- [ ] **Step 7.2: Theme switcher hook**

`apps/desktop/src/hooks/useTheme.ts`:

```typescript
import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "dm.theme";

function applyTheme(theme: Theme) {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.dataset.theme = resolved;
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // Re-apply when OS preference flips, but only when set to "system".
  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  return [theme, setTheme] as const;
}
```

- [ ] **Step 7.3: Wire the switcher into the header / top bar**

In `App.tsx`, use `useTheme()` and render a three-state segmented control (Light / Auto / Dark) in the top-right of the header. Default visible. Persistence is automatic via the hook.

- [ ] **Step 7.4: Verify dark and light themes both look right**

```bash
cd /home/robotics1025/Documents/project/apps/desktop
nohup npm run dev > /tmp/vite.log 2>&1 &
sleep 6
echo "Open in browser. Toggle theme switcher:"
echo "  - Light mode: all surfaces, text, borders, badges adapt correctly"
echo "  - System mode: follows OS"
echo "  - Reload: previous choice persists"
sleep 45
pkill -f vite || true
```

- [ ] **Step 7.5: Commit**

```bash
cd /home/robotics1025/Documents/project
git add apps/desktop/src/components/AddDownloadDialog.tsx \
        apps/desktop/src/App.tsx \
        apps/desktop/src/hooks/useTheme.ts
git commit -m "feat(desktop): polish add-download dialog + add light/dark/system theme switcher"
```

---

## Task 8: Rebuild AppImage and end-to-end smoke

After all the React + Rust changes, rebuild the AppImage from scratch and confirm it still works end-to-end.

- [ ] **Step 8.1: Re-stage the sidecar binary**

If the PyInstaller dist is stale (unlikely, but ensure):
```bash
cd /home/robotics1025/Documents/project
ls -la build/pyinstaller/dist/dm-api
# If missing or older than apps/api/, rebuild:
cd apps/api && uv run pyinstaller --noconfirm \
  --distpath ../../build/pyinstaller/dist \
  --workpath ../../build/pyinstaller/build \
  ../../build/pyinstaller/dm-api.spec

# Re-copy the binary into the shell's sidecar staging dir:
cd /home/robotics1025/Documents/project
TRIPLE=$(rustc -vV | grep "host:" | awk '{print $2}')
cp build/pyinstaller/dist/dm-api apps/shell/binaries/dm-api-$TRIPLE
chmod +x apps/shell/binaries/dm-api-$TRIPLE
ls -la apps/shell/binaries/
```

- [ ] **Step 8.2: Build the release AppImage**

```bash
cd /home/robotics1025/Documents/project/apps/shell
cargo tauri build 2>&1 | tail -20
ls -la target/release/bundle/appimage/
```

Expected: produces a new `DownloadMgr_0.1.0_amd64.AppImage`.

- [ ] **Step 8.3: End-to-end test**

```bash
./target/release/bundle/appimage/DownloadMgr_0.1.0_amd64.AppImage &
sleep 6
ps aux | grep -c "dm-api\|DownloadMgr"
echo "Verify in the open window:"
echo "  1. Window opens with polished UI"
echo "  2. Theme switcher works"
echo "  3. Empty/loading/error states render correctly"
echo "  4. Add a URL, queue a download — context menu opens on right-click"
echo "  5. When download completes — a native notification appears"
echo "  6. Close the window — process keeps running (hidden to tray on tray-supporting DEs)"
echo "  7. Launch the AppImage again — focuses the existing window instead of opening a second one"
sleep 60
pkill -f DownloadMgr || true
```

- [ ] **Step 8.4: (No commit needed — production AppImage is gitignored.)**

---

## Done

After Task 8, Plan 3 is complete. The AppImage at
`apps/shell/target/release/bundle/appimage/DownloadMgr_0.1.0_amd64.AppImage`
now feels like a desktop app, not a wrapped dev tool:

- Single-instance lock.
- Tray icon, hide-on-close.
- Native notifications on download completion / failure.
- Polished UI with consistent design system tokens.
- Real empty / loading / error states throughout.
- Light / dark / system theme switcher with persistence.

Plan 4 covers cross-platform CI (Windows + macOS), the auto-updater (Tauri's signed-update channel against GitHub Releases), opt-in Sentry crash reporting, and the deferred Settings UI screen + `/api/settings` REST endpoint.
