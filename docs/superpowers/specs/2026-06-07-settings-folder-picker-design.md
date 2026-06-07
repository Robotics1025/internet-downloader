---
title: Settings — Native Folder Picker
date: 2026-06-07
status: approved
project: download-manager
group: B (of a 4-part user-issue batch)
references:
  - SYSTEM_DESIGN.md
  - apps/shell/src/main.rs
  - apps/desktop/src/screens/SettingsScreen.tsx
---

# Settings — Native Folder Picker

## 1. Goal

In Settings → Downloads → "Download directory", clicking **Browse…** must open the
OS-native folder picker (pick a folder, click OK), instead of today's
`window.prompt()` text box where the user has to type a path by hand.

**Definition of done (binary):**
- Clicking **Browse…** in the running desktop app opens a native folder-selection
  dialog.
- Choosing a folder sets it as the pending `download_dir`; the existing Save bar
  persists it via `PUT /api/settings` (unchanged).
- Cancelling the dialog leaves `download_dir` unchanged.
- `cd apps/desktop && npx tsc -b` is clean.
- Running `npm run dev` in a plain browser (no Tauri) still works — Browse falls
  back to the old `prompt()` there.

## 2. Why it's broken today

`handleBrowseDir` in `apps/desktop/src/screens/SettingsScreen.tsx` uses
`window.prompt("Enter download directory path:", current)`. The desktop UI
currently uses **no** Tauri JS API at all (it talks only to the Python sidecar over
HTTP), so there's no native dialog wired up.

## 3. Approach

Use Tauri 2's official **`tauri-plugin-dialog`**. Rejected alternatives: a custom
Rust command wrapping the `rfd` crate (reinvents the plugin); a sidecar/Python-side
dialog (the sidecar has no reliable display/window context). The plugin is the
standard, smallest path.

## 4. Scope

### In scope
- Register `tauri-plugin-dialog` in the Rust shell.
- Add a Tauri capability granting `dialog:allow-open` to the `main` window (the
  app's first capability file).
- Add `@tauri-apps/api` + `@tauri-apps/plugin-dialog` to the desktop frontend.
- Rewrite `handleBrowseDir` to call the native picker, with a `prompt()` fallback
  when not running inside Tauri.

### Out of scope
- Any other file/folder pickers (only the download directory).
- Path validation beyond what the native picker guarantees (it returns only real,
  existing folders).
- Changing how settings are saved (the Save bar + `PUT /api/settings` are unchanged).

## 5. Design

### 5.1 Rust shell
- `apps/shell/Cargo.toml`: add dependency `tauri-plugin-dialog = "2"`.
- `apps/shell/src/main.rs`: add `.plugin(tauri_plugin_dialog::init())` to the
  `tauri::Builder` chain, next to the existing `notification`/`single-instance`/
  `shell` plugins.

### 5.2 Capability
- Create `apps/shell/capabilities/default.json`:
  ```json
  {
    "$schema": "../gen/schemas/desktop-schema.json",
    "identifier": "default",
    "description": "Core permissions for the main window.",
    "windows": ["main"],
    "permissions": ["dialog:allow-open"]
  }
  ```
  The main window is created programmatically in `main.rs` with label `"main"`;
  capability files in `capabilities/` are compiled in and applied to windows whose
  label matches the `windows` glob. (`$schema` path is best-effort; if the generated
  schema isn't present it can be omitted — it does not affect runtime.)

### 5.3 Frontend deps
- `apps/desktop/package.json`: add `@tauri-apps/api` (`^2`) and
  `@tauri-apps/plugin-dialog` (`^2`) to `dependencies`. `npm install` pulls them in;
  the bundle's `beforeBuildCommand` already runs `npm install` before building.

### 5.4 `handleBrowseDir`
Replace the prompt-based callback with:
```tsx
import { open } from "@tauri-apps/plugin-dialog";

const handleBrowseDir = useCallback(async () => {
  const current = draft?.download_dir ?? "";
  // Browser dev server (not inside Tauri): keep the typed-path fallback.
  if (!("__TAURI_INTERNALS__" in window)) {
    const next = window.prompt("Enter download directory path:", current);
    if (next !== null) patch("download_dir", next.trim());
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
- `open({ directory: true })` returns the chosen path as a `string`, or `null` on
  cancel (with `multiple: false`). Only a `string` result updates the draft.
- Importing the plugin module is safe in the browser; only *calling* `open()`
  outside Tauri would fail, which the `__TAURI_INTERNALS__` guard prevents.

## 6. Testing
- **Typecheck:** `cd apps/desktop && npx tsc -b` — clean.
- **Build:** the Rust shell compiles with the new plugin (`cargo check` in
  `apps/shell`, or a full `cargo tauri build`).
- **Manual (running app):** open Settings → Browse… → native dialog appears →
  pick a folder → the path shows in the field → Save → reopen Settings shows the
  new directory. Cancel leaves it unchanged.
- **Dev fallback:** `npm run dev` in a browser → Browse still shows the prompt.

## 7. Risks
- **Capability not applied** (wrong window label / missing file) → `open()` rejects
  with a permissions error. Mitigated: label is confirmed `"main"`; manual test
  covers it.
- **First Tauri JS dep**: adds `@tauri-apps/*` to the frontend bundle. Low risk;
  these are small and standard. Version must track Tauri 2 (`^2`).
