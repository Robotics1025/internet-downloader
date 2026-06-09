# Reliable Extension Auto-Connect (Stable Port) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the browser extension connect to the desktop API instantly and reliably by binding the sidecar to a predictable port (6543) and removing the extension's slow ephemeral port scan.

**Architecture:** The Tauri shell launches the Python sidecar requesting port 6543 (the single-instance lock keeps it free; the API's bind logic falls through 6543–6552 then ephemeral if needed). The extension already fast-paths 6543–6552, so it hits on the first probe; the ~30s ephemeral fallback scan is deleted so failures are fast and actionable.

**Tech Stack:** Tauri 2 (Rust shell), vanilla JS MV3 extension. No JS test runner — verification is `cargo check` + code review + manual.

**Reference spec:** `docs/superpowers/specs/2026-06-07-extension-stable-port-design.md`

---

## File Structure
- Modify: `apps/shell/src/sidecar.rs` — request port 6543 instead of 0
- Modify: `apps/browser-extension/background.js` — drop `_scanEphemeralRange`, fail fast
- Modify: `apps/browser-extension/manifest.json` — bump version

---

## Task 1: Shell binds the stable port

**Files:**
- Modify: `apps/shell/src/sidecar.rs`

- [ ] **Step 1: Make the edit.** In `apps/shell/src/sidecar.rs`, find:
```rust
        .args(["--port", "0"]);
```
Change it to:
```rust
        .args(["--port", "6543"]);
```
That is the only change in this file. The sidecar still prints `DM_PORT <actual>` on
stdout and the shell still reads it, so the webview keeps working even if the API
lands on 6544–6552.

- [ ] **Step 2: Verify the shell compiles.**

Run: `cd apps/shell && cargo check 2>&1 | tail -5`
Expected: `Finished` with no errors.

- [ ] **Step 3: Commit.**
```bash
cd /home/robotics1025/Documents/project
git add apps/shell/src/sidecar.rs
git commit -m "feat(shell): bind sidecar to stable port 6543 for extension auto-connect"
```

---

## Task 2: Extension connects fast, fails fast

**Files:**
- Modify: `apps/browser-extension/background.js`
- Modify: `apps/browser-extension/manifest.json`

- [ ] **Step 1: Remove the slow fallback from `discoverPort()`.** In
`apps/browser-extension/background.js`, the function currently ends like this:
```javascript
  // 3. Primary range — what the API uses by default.
  for (const port of PRIMARY_PORT_RANGE) {
    if (await _probePort(port)) {
      _cachedPort = port;
      _cachedAt = Date.now();
      await _saveStoredPort(port);
      return port;
    }
  }
  // 4. Last resort: scan a chunk of the Linux ephemeral range in parallel.
  //    Linux defaults to 32768–60999. We probe in batches of 100 to keep
  //    things bounded; ~28k ports total but parallelism makes it ~30 s worst
  //    case, which is fine for a fallback rarely-hit path.
  const ephemeralFound = await _scanEphemeralRange();
  if (ephemeralFound) {
    _cachedPort = ephemeralFound;
    _cachedAt = Date.now();
    await _saveStoredPort(ephemeralFound);
    return ephemeralFound;
  }
  _cachedPort = null;
  throw new Error(
    "Cannot reach DownloadMgr on 127.0.0.1. Is the desktop app running?",
  );
}
```
Replace that whole tail (from the `// 4. Last resort:` comment through the `}` closing
`discoverPort`) so it becomes:
```javascript
  // 3. Primary range — what the API uses by default (it now binds 6543).
  for (const port of PRIMARY_PORT_RANGE) {
    if (await _probePort(port)) {
      _cachedPort = port;
      _cachedAt = Date.now();
      await _saveStoredPort(port);
      return port;
    }
  }
  // Not found on the known range — the app is almost certainly not running.
  // Fail fast with an actionable message (no slow ephemeral scan).
  _cachedPort = null;
  throw new Error(
    "Cannot reach DownloadMgr on 127.0.0.1. Is the desktop app running?",
  );
}
```
(The `// 3.` comment text update is optional but recommended.)

- [ ] **Step 2: Delete the `_scanEphemeralRange` function.** Remove the entire
function block:
```javascript
async function _scanEphemeralRange() {
  const START = 32768;
  const END = 60999;
  const BATCH = 200;
  for (let base = START; base <= END; base += BATCH) {
    const tasks = [];
    for (let p = base; p < Math.min(base + BATCH, END + 1); p++) {
      tasks.push(_probePort(p, 250).then(ok => (ok ? p : null)));
    }
    const results = await Promise.all(tasks);
    const hit = results.find(p => p !== null);
    if (hit) return hit;
  }
  return null;
}
```
Leave `apiBase()` (which follows it) and everything else intact.

- [ ] **Step 3: Verify nothing else references `_scanEphemeralRange`.**

Run: `grep -n "_scanEphemeralRange" apps/browser-extension/background.js`
Expected: no matches (the only definition and its only call were both removed).

- [ ] **Step 4: Bump the extension version.** In `apps/browser-extension/manifest.json`,
change `"version": "0.2.2"` to `"version": "0.2.3"`.

- [ ] **Step 5: Sanity-check the JS parses.** If `node` is available:
`node --check apps/browser-extension/background.js` → no output (valid). If `node`
isn't available, visually confirm braces balance (the removed function was
self-contained) and that `discoverPort` ends with the single throw + closing `}`.

- [ ] **Step 6: Commit.**
```bash
cd /home/robotics1025/Documents/project
git add apps/browser-extension/background.js apps/browser-extension/manifest.json
git commit -m "feat(extension): rely on stable port 6543, drop slow ephemeral scan"
```

---

## Task 3: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Build/run the app with the change.** Rebuild + launch the desktop app
(`cd apps/shell && cargo tauri dev`, or a full build + `./run_app.sh`). Confirm the
sidecar is on 6543: `ss -ltnp | grep dm-api` should show `127.0.0.1:6543` (or a
6544–6552 port if 6543 was taken).

- [ ] **Step 2: Load the extension.** In Chrome → `chrome://extensions` → Developer
mode → Load unpacked → select `apps/browser-extension/`.

- [ ] **Step 3: Connected path.** With the app running, on a video page click the
extension action (or the hover button / right-click "Send to DownloadMgr"). It should
enqueue with no perceptible delay. Confirm a download appears in the desktop app (or
`curl -s http://127.0.0.1:6543/api/downloads`).

- [ ] **Step 4: Fast-failure path.** Quit the desktop app, then trigger the extension
again. It should show the "Is the desktop app running?" error within ~1–2s — not hang
~30s.

- [ ] **Step 5: Webview regression.** Confirm the desktop app's own window still loads
and lists downloads (the `DM_PORT` handshake is unaffected by the port change).

---

## Self-Review notes (for the implementer)
- **Spec coverage:** stable port (Task 1), fast connect + remove slow scan (Task 2
  Steps 1-3), version bump (Task 2 Step 4), DoD manual checks (Task 3). All spec
  sections map to a task.
- **No placeholders:** every edit shows the exact before/after code.
- **Consistency:** `PRIMARY_PORT_RANGE`, `_probePort`, `_saveStoredPort`, `_cachedPort`,
  `_cachedAt` names are all pre-existing and unchanged; only `_scanEphemeralRange` is
  removed (and its single call site). The error string is identical to the one already
  in the file.
- **No JS test runner** in the repo, so Task 2 is verified by `node --check` (if
  available) + grep + Task 3 manual — consistent with the rest of the extension.
