---
title: File Reconcile — Detect Externally Deleted Downloads
date: 2026-06-07
status: approved
project: download-manager
group: D1 (of the app↔filesystem sync work; D2 = playlist=folder, deferred)
references:
  - apps/api/src/dm_api/application/services/progress_service.py
  - apps/api/src/dm_api/infrastructure/persistence/sqlite_download_repository.py
  - apps/api/src/dm_api/presentation/schemas/download_dto.py
  - apps/desktop/src/components/StatusBadge.tsx
---

# File Reconcile — Detect Externally Deleted Downloads

## 1. Goal

When a completed download's file is removed/moved/renamed **outside** the app, the app
detects it within ~15s, marks that download **Missing**, and lets the user **Remove**
it. If the file reappears, the Missing state clears automatically.

This is D1 of the app↔filesystem sync work — the achievable, lower-risk half of the
user's issue 3 ("I deleted a file from the folder and the app didn't reflect it").

**Deferred (not in this spec):** Re-download of a missing file (needs a yt-dlp worker
exact-path tweak); a live filesystem watcher; and D2 ("playlist = real on-disk folder"
two-way sync), which is a separate redesign since playlists are currently localStorage
groupings, not folders.

**Definition of done (binary):**
- Deleting a completed download's file on disk causes that download to show as
  **Missing** in the app within ~15s (and on app startup).
- Restoring the file clears Missing on the next reconcile.
- A Missing download can be **Removed** from the list (existing delete; the file is
  already gone).
- In-flight/paused/failed downloads are never marked Missing.
- `cd apps/api && uv run pytest` stays green (≥90% coverage gate, allowing for the
  pre-existing flakiness), and `cd apps/desktop && npx tsc -b` is clean.

## 2. Current state

Downloads are rows in the `downloads` table (raw aiosqlite repo). A completed
download stores the exact final location in `save_path` + `file_name` (the yt-dlp
worker rewrites `save_path` to the uploader subfolder on completion, so
`Path(save_path)/file_name` is the real path on disk). Nothing ever re-checks whether
that file still exists, so external deletions go unnoticed. There is an existing
background `ProgressService` (an asyncio loop started in the app lifespan) that this
feature mirrors.

## 3. Approach

Add a periodic backend **ReconcileService** that stats completed downloads' files and
maintains a `file_missing` flag, surfaced through the existing list/poll to the UI.

Rejected alternatives: a live `watchdog` filesystem watcher (heavier, new dependency,
many nested uploader subfolders, platform edge cases) and inline existence checks on
every `GET /api/downloads` (re-stats everything on each 3s poll). The periodic
reconcile is simple, dependency-free, and reuses the existing polling.

## 4. Scope

### In scope
- Migration adding `file_missing` to `downloads`.
- `file_missing` on the `DownloadTask` entity + SQLite repo read/write.
- `ReconcileService` background task (startup + ~15s interval).
- `file_missing` in `DownloadDTO`.
- Frontend: `file_missing` on the `Download` type; a **Missing** badge/state in the
  row; Remove available; play disabled for missing.

### Out of scope
- Re-download, live watcher, D2 (playlist=folder), any new REST endpoint (Remove uses
  existing `DELETE`).

## 5. Design

### 5.1 Schema (migration 0003)
Add a non-null boolean column `file_missing` to `downloads`, default `0`. Follow the
existing alembic migration pattern (see `migrations/versions/0002_media_format_id.py`).

### 5.2 Domain + persistence
- `DownloadTask`: add `file_missing: bool = False` (new field with default, after
  `media_format_id`, to keep existing positional constructors working).
- `SQLiteDownloadRepository`: include `file_missing` in the INSERT/UPDATE column lists
  and the row→entity mapping (store as 0/1, read back as bool).

### 5.3 ReconcileService
New application service `apps/api/src/dm_api/application/services/reconcile_service.py`,
modeled on `ProgressService`:
- `start()` launches an asyncio loop; `stop()` cancels it (suppressing
  `CancelledError`), same lifecycle as `ProgressService`.
- Loop: run one reconcile immediately, then every `RECONCILE_INTERVAL_SECONDS = 15`.
- One reconcile pass: `tasks = await repo.list_all()`; for each task with
  `status == COMPLETED`, compute `missing = not (Path(task.save_path) / task.file_name).exists()`;
  if `missing != task.file_missing`, set it and `await repo.update(task)`. Skip all
  non-completed tasks (leave their `file_missing` False).
- Filesystem `.exists()` is sync/fast; acceptable inside the loop for this scale. The
  loop swallows per-pass exceptions and keeps running (like `ProgressService._loop`).
- Wired into the app lifespan next to `ProgressService` (start after repo is built,
  stop in the `finally`).

### 5.4 DTO
`DownloadDTO` gains `file_missing: bool`, populated from the entity in `from_entity`.
The existing `GET /api/downloads` + 3s poll therefore surface the flag with no new
endpoint. (Optional, not required: the progress WebSocket is unchanged; the list poll
is sufficient to reflect Missing.)

### 5.5 Frontend
- `apps/desktop/src/types.ts`: add `file_missing: boolean` to `Download`.
- `apps/desktop/src/components/StatusBadge.tsx` (and/or `DownloadRow.tsx`): when a row
  is `completed` **and** `file_missing`, render a **"Missing"** badge with warning
  styling instead of the normal completed indicator.
- `DownloadRow.tsx`: for missing rows, disable double-click-to-play and the Play/Open
  actions (the file is gone); keep **Remove** (delete) available — it already is via
  the context menu. Deleting a missing row calls the existing delete (no `delete_file`
  needed since the file is already absent).

### 5.6 Data flow
reconcile pass (startup + every 15s) → stats completed files → flips `file_missing` in
DB on change → next list poll returns the flag → row shows Missing. File restored →
next pass clears the flag → row normal. Remove → existing DELETE drops the row.

## 6. Testing
- **Unit (application):** `ReconcileService` one-pass behavior with a fake repo +
  `tmp_path`: marks `file_missing` True when the file is absent, False when present,
  and ignores non-completed tasks. Persists only on change.
- **Integration (router):** create a download, force `completed` with a real file in
  `tmp_path`, run one reconcile pass, assert `GET /api/downloads/{id}` shows
  `file_missing: false`; delete the file, reconcile, assert `file_missing: true`.
- **Migration:** the new column exists after `alembic upgrade head` (existing migration
  test pattern).
- **Frontend:** `npx tsc -b` clean; manual — delete a completed file on disk, wait
  ~15s, see the Missing badge, click Remove.

## 7. Risks
- **Reconcile cost** with very many completed downloads (one `stat` each per 15s) —
  negligible at realistic scale; the 15s interval bounds it.
- **Transient unavailability** (e.g. an unmounted external drive) would mark everything
  on it Missing until remounted, then self-heal on the next pass. Acceptable and
  informative; no disk writes are performed by reconcile.
- **No disk mutation:** reconcile only reads (`stat`); it never deletes or moves files,
  so it cannot cause data loss. Removal is an explicit user action via the existing
  delete.
