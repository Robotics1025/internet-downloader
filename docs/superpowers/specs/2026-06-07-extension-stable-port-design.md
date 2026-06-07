---
title: Reliable Extension Auto-Connect via Stable Port
date: 2026-06-07
status: approved
project: download-manager
group: C (of a 4-part user-issue batch)
references:
  - apps/shell/src/sidecar.rs
  - apps/browser-extension/background.js
  - apps/api/src/dm_api/presentation/main.py
---

# Reliable Extension Auto-Connect via Stable Port

## 1. Goal

The browser extension should connect to the local desktop API **immediately and
reliably** whenever the app is running, and fail **fast with a clear message** when
it isn't — no multi-second port scanning.

This is the achievable core of the user's issue 5 ("make the extension just work").
Silent auto-install/enable of the extension is impossible in Chrome and is out of
scope; native messaging was considered and deliberately deferred in favour of this
lighter mechanism.

**Definition of done (binary):**
- With the desktop app running, the extension reaches the API on the first probe
  (no ephemeral scan).
- With the app closed, "Send to DownloadMgr" fails within ~1–2s with the existing
  "Is the desktop app running?" message — not a ~30s hang.
- `cd apps/shell && cargo check` passes.
- The desktop app still starts normally and its webview still reaches the API
  (the `DM_PORT` handshake is unchanged).

## 2. Why it's unreliable today

`apps/shell/src/sidecar.rs` launches the sidecar with `--port 0`, forcing the OS to
assign a **random** port. The extension therefore cannot predict the port and, after
trying the 6543–6552 range, falls back to `_scanEphemeralRange()` in
`apps/browser-extension/background.js` — a parallel scan of ~28k ephemeral ports that
can take ~30s. The app already runs **single-instance** (the
`tauri-plugin-single-instance` lock), so there is normally only one API process and
no real reason port 6543 would be taken.

## 3. Approach

Make the sidecar bind a **predictable** port (6543) so the extension's existing fast
path hits on the first probe, and delete the now-pointless slow scan. The API's
bind logic (`apps/api/src/dm_api/presentation/main.py`, `_bind`) already prefers the
requested port, then the 6543–6552 discovery range, then an ephemeral fallback — so
asking for 6543 is safe even in the rare case it's occupied (it lands on 6544–6552,
which the extension also fast-paths).

Rejected alternative: a native-messaging host (robust, port-independent, enables
app→extension push) — far larger cross-platform effort for a benefit not needed yet.
Deferred until there's a concrete need to push events to the extension or the
extension is published to the Chrome Web Store.

## 4. Scope

### In scope
- `apps/shell/src/sidecar.rs`: request port 6543 instead of 0.
- `apps/browser-extension/background.js`: remove `_scanEphemeralRange()` and its call;
  on 6543–6552 miss, throw the existing clear error immediately. Keep the cached-port
  and last-known-port fast paths.
- Bump the extension `version` in `manifest.json` (reflects behavior change).

### Out of scope
- Native messaging, app→extension push.
- Extension install/registration/Web Store flow.
- Any change to the `DM_PORT` stdout handshake or the API's `_bind` logic.

## 5. Design

### 5.1 Shell — request a stable port
In `apps/shell/src/sidecar.rs`, the command is built with `.args(["--port", "0"])`.
Change to `.args(["--port", "6543"])`. The sidecar still prints `DM_PORT <actual>`
on stdout and the shell still reads it for the webview's `__DM_API_PORT__`, so if
6543 is momentarily busy and the API lands on 6544–6552 the webview remains correct.
No other shell change.

### 5.2 Extension — fast connect, fast failure
In `apps/browser-extension/background.js`, `discoverPort()` currently:
1. returns the in-memory cached port if set,
2. probes the persisted last-known port,
3. probes the `PRIMARY_PORT_RANGE` (6543–6552) in order,
4. falls back to `_scanEphemeralRange()` (the slow scan),
5. throws "Cannot reach DownloadMgr… Is the desktop app running?".

Change: delete step 4 (and the `_scanEphemeralRange` function). After step 3 misses,
go straight to the throw in step 5. Steps 1–3 and `_probePort`, `_getStoredPort`,
`_saveStoredPort`, `STORAGE_KEY_PORT`, `PRIMARY_PORT_RANGE` are unchanged. Bump
`manifest.json` `version` (e.g. `0.2.2` → `0.2.3`).

### 5.3 Data flow (after)
app launches → sidecar binds 6543 → extension `discoverPort()` hits 6543 on the
first range probe → caches it → all extension API calls use `http://127.0.0.1:6543`.
App closed → steps 1–3 miss within ~1–2s → clear error shown.

## 6. Testing
The extension is vanilla JS in an MV3 service worker with no test runner; the shell
change is a one-line arg. Verification:
- `cd apps/shell && cargo check` — compiles.
- **Manual (app running):** load the extension, open its popup / use "Send to
  DownloadMgr" on a video page → it connects and enqueues without delay. Confirm via
  the API that a download was created.
- **Manual (app closed):** quit the app, trigger the extension → clear "Is the
  desktop app running?" message within ~1–2s (no long hang).
- **Regression:** launch the desktop app normally → window loads and lists downloads
  (webview port handshake still works).

## 7. Risks
- **6543 occupied by an unrelated process** → API lands on 6544–6552; extension still
  fast-paths it. Only if all of 6543–6552 are taken (extremely unlikely given
  single-instance) would it fail — and then it fails fast with guidance, which is the
  intended behavior.
- **Stale stored port** from the old random-port era → its probe fails fast (~600ms)
  and the 6543 range probe succeeds; self-heals on first success.
