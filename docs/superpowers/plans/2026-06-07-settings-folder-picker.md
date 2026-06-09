# Settings Native Folder Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the typed-path `window.prompt` behind Settings → "Browse…" with a native OS folder picker via `tauri-plugin-dialog`.

**Architecture:** Register `tauri-plugin-dialog` in the Rust shell, grant `dialog:allow-open` to the `main` window via the app's first capability file, add the `@tauri-apps` JS deps, and rewrite `handleBrowseDir` to call the native picker (with a `prompt()` fallback when not running inside Tauri).

**Tech Stack:** Tauri 2 (Rust), `tauri-plugin-dialog`, React + TypeScript (verified with `tsc -b`; no JS test runner in this repo), `cargo` for the shell.

**Reference spec:** `docs/superpowers/specs/2026-06-07-settings-folder-picker-design.md`

---

## File Structure

- Modify: `apps/shell/Cargo.toml` — add `tauri-plugin-dialog` dependency
- Modify: `apps/shell/src/main.rs` — register the plugin
- Create: `apps/shell/capabilities/default.json` — grant `dialog:allow-open` to `main`
- Modify: `apps/desktop/package.json` — add `@tauri-apps/api` + `@tauri-apps/plugin-dialog`
- Modify: `apps/desktop/src/screens/SettingsScreen.tsx` — rewrite `handleBrowseDir`

---

## Task 1: Register `tauri-plugin-dialog` in the Rust shell + capability

**Files:**
- Modify: `apps/shell/Cargo.toml`
- Modify: `apps/shell/src/main.rs`
- Create: `apps/shell/capabilities/default.json`

- [ ] **Step 1: Add the Cargo dependency**

In `apps/shell/Cargo.toml`, under `[dependencies]`, alongside the existing
`tauri-plugin-notification = "2"` etc., add:

```toml
tauri-plugin-dialog = "2"
```

- [ ] **Step 2: Register the plugin in `main.rs`**

In `apps/shell/src/main.rs`, the builder currently chains:
```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            ...
        }))
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
```
Add the dialog plugin right after the shell plugin line:
```rust
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
```

- [ ] **Step 3: Create the capability file**

Create `apps/shell/capabilities/default.json` with exactly:
```json
{
  "identifier": "default",
  "description": "Permissions for the main window.",
  "windows": ["main"],
  "permissions": ["dialog:allow-open"]
}
```
(The main window is created in `main.rs` with label `"main"`. Capability files in
`capabilities/` are compiled in and applied to matching window labels.)

- [ ] **Step 4: Verify the shell compiles**

Run: `cd apps/shell && cargo check`
Expected: compiles successfully (it will download + build `tauri-plugin-dialog`).
If `cargo check` reports the capability schema is invalid, re-run; the capability
JSON above uses only stable fields (`identifier`, `description`, `windows`,
`permissions`) and `dialog:allow-open` is a permission the plugin defines, so it
should validate once the plugin crate is present.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/Cargo.toml apps/shell/src/main.rs apps/shell/capabilities/default.json
git commit -m "feat(shell): register tauri-plugin-dialog + dialog:allow-open capability"
```

---

## Task 2: Frontend deps + native picker in `handleBrowseDir`

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/src/screens/SettingsScreen.tsx`

- [ ] **Step 1: Add the JS dependencies**

In `apps/desktop`, run:
```bash
npm install @tauri-apps/api@^2 @tauri-apps/plugin-dialog@^2
```
This adds both to `package.json` `dependencies` and updates the lockfile.

- [ ] **Step 2: Add the import**

In `apps/desktop/src/screens/SettingsScreen.tsx`, add near the top with the other
imports (after the React import line):
```tsx
import { open } from "@tauri-apps/plugin-dialog";
```

- [ ] **Step 3: Rewrite `handleBrowseDir`**

The current implementation is:
```tsx
  const handleBrowseDir = useCallback(() => {
    const current = draft?.download_dir ?? "";
    const next = window.prompt("Enter download directory path:", current);
    if (next !== null) {
      patch("download_dir", next.trim());
    }
  }, [draft, patch]);
```
Replace it with:
```tsx
  const handleBrowseDir = useCallback(async () => {
    const current = draft?.download_dir ?? "";
    // Browser dev server (not inside Tauri): keep the typed-path fallback.
    if (!("__TAURI_INTERNALS__" in window)) {
      const next = window.prompt("Enter download directory path:", current);
      if (next !== null) {
        patch("download_dir", next.trim());
      }
      return;
    }
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: current || undefined,
    });
    if (typeof selected === "string") {
      patch("download_dir", selected);
    }
  }, [draft, patch]);
```
The `onClick={handleBrowseDir}` on the Browse button stays as-is (an async handler
is fine for onClick).

- [ ] **Step 4: Typecheck**

Run: `cd apps/desktop && npx tsc -b`
Expected: no errors. (If TS complains that `open` can return `string[] | null`,
the `typeof selected === "string"` guard already narrows it correctly — no cast
needed because `multiple: false` returns `string | null` at the type level in
plugin v2.)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/package.json apps/desktop/package-lock.json apps/desktop/src/screens/SettingsScreen.tsx
git commit -m "feat(ui): native folder picker for download directory (Browse)"
```

---

## Task 3: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Build + run the app.** Rebuild the desktop bundle and launch via
  `./run_app.sh` (handles this machine's snap-XDG + GStreamer quirks), or use dev
  mode: `cd apps/shell && cargo tauri dev` (which runs the Vite dev server + shell
  together). Note: in `cargo tauri dev` the webview IS inside Tauri, so the native
  picker path runs (not the prompt fallback).

- [ ] **Step 2: Native picker.** Open Settings → Downloads → click **Browse…**. A
  native OS folder-selection dialog appears. Pick a folder, confirm. The chosen
  absolute path appears in the "Download directory" field, and the "Unsaved changes"
  Save bar slides in.

- [ ] **Step 3: Persistence.** Click **Save**, leave Settings, reopen Settings —
  the new directory is shown (persisted via `PUT /api/settings`).

- [ ] **Step 4: Cancel.** Click **Browse…** again, cancel the dialog — the
  directory is unchanged, no Save bar appears.

- [ ] **Step 5: Dev fallback (optional).** Run `cd apps/desktop && npm run dev` and
  open `http://localhost:5173` in a plain browser → clicking Browse shows the
  `prompt()` (no crash), confirming the non-Tauri fallback.

---

## Self-Review notes (for the implementer)

- **Spec coverage:** Rust plugin registration (Task 1 Steps 1-2), capability (Task 1
  Step 3), frontend deps (Task 2 Step 1), `handleBrowseDir` rewrite + dev fallback
  (Task 2 Steps 2-3), persistence unchanged (verified Task 3 Step 3), tsc clean
  (Task 2 Step 4). All DoD items map to a task.
- **No placeholders:** every code edit is shown in full.
- **Consistency:** the import name `open` from `@tauri-apps/plugin-dialog` is used
  exactly in the rewritten `handleBrowseDir`; window label `"main"` matches both the
  capability `windows` glob and the `WebviewWindowBuilder::new(&handle, "main", ...)`
  call in `main.rs`.
- **No JS test runner** exists in this repo, so Task 2 is verified by `tsc -b` +
  Task 3 manual steps — consistent with how the rest of the desktop app is verified.
